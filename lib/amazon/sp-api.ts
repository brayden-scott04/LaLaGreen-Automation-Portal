const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const SP_API_HOST = "https://sellingpartnerapi-na.amazon.com";
const CHUNK_SIZE = 20;
const CHUNK_DELAY_MS = 1100;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);

export const MARKETPLACE_IDS = {
  US: "ATVPDKIKX0DER",
  CA: "A2EUQ1WTGCTBG2",
} as const;

export type MarketplaceCode = keyof typeof MARKETPLACE_IDS;

export interface PricingResult {
  sku: string;
  listPrice: number | null;
  listPriceAttr: number | null;
  salesPrice: number | null;
  discountedPrice: number | null;
  featuredPrice: number | null;
  error?: string;
}

export interface SkuDetail {
  sku: string;
  asin: string | null;
  salesPrice: number | null;
  discountedPrice: number | null;
  listPrice: number | null;
  featuredPrice: number | null;
  minSellerAllowedPrice: number | null;
  maxSellerAllowedPrice: number | null;
  productName: string | null;
  productDescription: string | null;
  /** Seller-configured price — Listings Items purchasable_offer.our_price, read directly (not a fallback). */
  ourPrice: number | null;
  /** Amazon's live buyer-facing price — the raw v0 BuyingPrice.ListingPrice.Amount, before the our_price fallback below overwrites salesPrice. */
  livePrice: number | null;
  /** Real List Price only (v0 AttributeSets.ListPrice or Listings Items list_price attribute) — null if neither is set, never RegularPrice. */
  listPriceExact: number | null;
  error?: string;
}

let tokenCache: { accessToken: string; expiresAt: number } | null = null;
let refreshInFlight: Promise<string> | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) return tokenCache.accessToken;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const res = await fetch(LWA_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: process.env.REFRESH_TOKEN!,
        client_id: process.env.CLIENT_ID!,
        client_secret: process.env.CLIENT_SECRET!,
      }),
    });
    if (!res.ok) throw new Error(`LWA token refresh failed (${res.status})`);
    const json = await res.json();
    tokenCache = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return tokenCache.accessToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface MoneyType {
  Amount: number;
  CurrencyCode: string;
}

interface PricingApiItem {
  SellerSKU: string;
  status: string;
  Product?: {
    Offers?: { BuyingPrice?: { ListingPrice?: MoneyType }; RegularPrice?: MoneyType }[];
    AttributeSets?: { ListPrice?: MoneyType }[];
    CompetitivePricing?: {
      CompetitivePrices?: { CompetitivePriceId: string; Price?: { ListingPrice?: MoneyType } }[];
    };
  };
}

interface PricingApiResponse {
  payload: PricingApiItem[];
}

async function callSpApiJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const accessToken = await getAccessToken();
  const url = `${SP_API_HOST}${path}?${new URLSearchParams(params).toString()}`;

  let lastError: Error = new Error("SP-API call failed");
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "x-amz-access-token": accessToken } });
    if (res.ok) return res.json();

    lastError = new Error(`SP-API ${path} failed (${res.status})`);
    if (!RETRYABLE_STATUSES.has(res.status)) throw lastError;
    await sleep(1000 * 2 ** attempt);
  }
  throw lastError;
}

function callSpApi(path: string, params: Record<string, string>): Promise<PricingApiResponse> {
  return callSpApiJson<PricingApiResponse>(path, params);
}

/**
 * getPricing (ItemType=Sku) is keyed by the caller's own SellerSKU, so the
 * returned offer is always the seller's own listing — that's our "sales price".
 * List Price comes from the item's AttributeSets when Amazon has it on file,
 * falling back to the offer's RegularPrice otherwise.
 */
function extractOwnPricing(payload: PricingApiItem[], results: Map<string, PricingResult>) {
  for (const item of payload ?? []) {
    const sku = item.SellerSKU;
    const result = results.get(sku);
    if (!result) continue;

    if (item.status !== "Success") {
      result.error = item.status === "ClientError" ? "No matching Amazon listing" : `Pricing lookup failed: ${item.status}`;
      continue;
    }

    const offer = item.Product?.Offers?.[0];
    const listPriceAttr = item.Product?.AttributeSets?.[0]?.ListPrice?.Amount;
    result.salesPrice = offer?.BuyingPrice?.ListingPrice?.Amount ?? null;
    result.listPrice = listPriceAttr ?? offer?.RegularPrice?.Amount ?? null;
    result.listPriceAttr = listPriceAttr ?? null;
  }
}

/** CompetitivePriceId "1" is Amazon's "New Buy Box" price — the featured offer price. */
function extractFeaturedPricing(payload: PricingApiItem[], results: Map<string, PricingResult>) {
  for (const item of payload ?? []) {
    const sku = item.SellerSKU;
    const result = results.get(sku);
    if (!result || item.status !== "Success") continue;

    const buyBox = item.Product?.CompetitivePricing?.CompetitivePrices?.find(
      (p) => p.CompetitivePriceId === "1"
    );
    result.featuredPrice = buyBox?.Price?.ListingPrice?.Amount ?? null;
  }
}

export async function getSkuPricing(skus: string[], marketplaceId: string): Promise<PricingResult[]> {
  const cleaned = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  const results = new Map<string, PricingResult>(
    cleaned.map((sku) => [
      sku,
      { sku, listPrice: null, listPriceAttr: null, salesPrice: null, discountedPrice: null, featuredPrice: null },
    ])
  );

  const chunks = chunk(cleaned, CHUNK_SIZE);
  for (let i = 0; i < chunks.length; i++) {
    const batch = chunks[i];
    const params = { MarketplaceId: marketplaceId, Skus: batch.join(","), ItemType: "Sku" };

    try {
      const pricing = await callSpApi("/products/pricing/v0/price", params);
      extractOwnPricing(pricing.payload, results);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Pricing lookup failed";
      for (const sku of batch) results.get(sku)!.error = message;
    }

    await sleep(CHUNK_DELAY_MS);

    try {
      const competitive = await callSpApi("/products/pricing/v0/competitivePrice", params);
      extractFeaturedPricing(competitive.payload, results);
    } catch {
      // Featured price is best-effort — a failure here shouldn't blank out the sales/list price already fetched.
    }

    if (i < chunks.length - 1) await sleep(CHUNK_DELAY_MS);
  }

  // getPricing/getCompetitivePricing both report "Success" even when a SKU has zero
  // buyable offers — they just omit Offers/CompetitivePrices entirely in that case.
  for (const result of results.values()) {
    if (!result.error && result.listPrice === null && result.salesPrice === null && result.featuredPrice === null) {
      result.error = "No active offer on Amazon";
    }
  }

  return cleaned.map((sku) => results.get(sku)!);
}

// The Listings Items API returns the seller's own submitted listing. `attributes` is a
// map of attributeName -> array of values, but the exact nesting varies by product type,
// so every extraction below is defensive and falls back to null.
interface ListingsItemResponse {
  sku?: string;
  summaries?: { marketplaceId?: string; itemName?: string; asin?: string }[];
  attributes?: Record<string, unknown[]>;
}

function firstAttr(attributes: Record<string, unknown[]> | undefined, key: string): Record<string, unknown> | null {
  const value = attributes?.[key]?.[0];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Reads a price sub-attribute of purchasable_offer (our_price, min/max seller allowed), with a top-level fallback. */
function extractOfferPrice(attributes: Record<string, unknown[]> | undefined, key: string): number | null {
  const offer = firstAttr(attributes, "purchasable_offer");
  const nested = offer?.[key];
  if (Array.isArray(nested)) {
    const schedule = (nested[0] as Record<string, unknown>)?.schedule;
    if (Array.isArray(schedule)) {
      const amount = asNumber((schedule[0] as Record<string, unknown>)?.value_with_tax);
      if (amount !== null) return amount;
    }
  }
  // Fallback: some product types expose it as a top-level attribute.
  const topLevel = firstAttr(attributes, key);
  return asNumber(topLevel?.value ?? topLevel?.value_with_tax);
}

function extractStringAttr(attributes: Record<string, unknown[]> | undefined, key: string): string | null {
  const attr = firstAttr(attributes, key);
  const value = attr?.value;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Combines the Product Pricing API (sales/list/featured price) with the Listings Items API
 * (product name/description + seller-allowed min/max prices) for a single SKU. The listings
 * lookup is best-effort — a failure there leaves those fields null but keeps the prices.
 */
export async function getSkuDetail(sku: string, marketplaceId: string): Promise<SkuDetail> {
  const [pricing] = await getSkuPricing([sku], marketplaceId);

  const detail: SkuDetail = {
    sku,
    asin: null,
    salesPrice: pricing.salesPrice,
    discountedPrice: pricing.discountedPrice,
    listPrice: pricing.listPrice,
    featuredPrice: pricing.featuredPrice,
    minSellerAllowedPrice: null,
    maxSellerAllowedPrice: null,
    productName: null,
    productDescription: null,
    ourPrice: null,
    livePrice: pricing.salesPrice,
    listPriceExact: pricing.listPriceAttr,
    error: pricing.error,
  };

  try {
    const sellerId = process.env.SELLER_ID!;
    const listing = await callSpApiJson<ListingsItemResponse>(
      `/listings/2021-08-01/items/${sellerId}/${encodeURIComponent(sku)}`,
      { marketplaceIds: marketplaceId, includedData: "summaries,attributes" }
    );

    const attrs = listing.attributes;
    detail.asin = listing.summaries?.[0]?.asin ?? null;
    detail.productName = listing.summaries?.[0]?.itemName ?? extractStringAttr(attrs, "item_name");
    detail.productDescription = extractStringAttr(attrs, "product_description");
    detail.minSellerAllowedPrice = extractOfferPrice(attrs, "minimum_seller_allowed_price");
    detail.maxSellerAllowedPrice = extractOfferPrice(attrs, "maximum_seller_allowed_price");

    // The promotional Sale Price lives in purchasable_offer.discounted_price (same nested
    // schedule shape extractOfferPrice already handles). Null when no sale is configured.
    detail.discountedPrice = extractOfferPrice(attrs, "discounted_price");

    detail.ourPrice = extractOfferPrice(attrs, "our_price");

    if (detail.listPrice === null) {
      const listPriceAttr = firstAttr(attrs, "list_price");
      detail.listPrice = asNumber(listPriceAttr?.value_with_tax ?? listPriceAttr?.value);
    }

    if (detail.listPriceExact === null) {
      const listPriceAttr = firstAttr(attrs, "list_price");
      detail.listPriceExact = asNumber(listPriceAttr?.value_with_tax ?? listPriceAttr?.value);
    }

    // The Product Pricing API only returns a sales price when there's a buyable offer. For
    // inactive / out-of-stock listings it reports "No active offer", but the seller's own
    // configured price still lives in the listing — use it so a plan can still be created.
    if (detail.salesPrice === null) {
      const listingPrice = extractOfferPrice(attrs, "our_price");
      if (listingPrice !== null) {
        detail.salesPrice = listingPrice;
        detail.error = undefined;
      }
    }
  } catch {
    // Best-effort: keep the pricing fields; leave name/description/min/max as null.
  }

  return detail;
}
