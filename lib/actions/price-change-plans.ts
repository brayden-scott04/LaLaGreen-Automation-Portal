"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSession } from "@/lib/session";
import { getSkuDetail, getSkuPricing, MARKETPLACE_IDS, type MarketplaceCode } from "@/lib/amazon/sp-api";

export type PriceType = "your_price" | "sale_price";

export interface PricePlan {
  id: string;
  sku: string;
  marketplace: MarketplaceCode;
  price_type: PriceType;
  start_price: number;
  current_price: number;
  target_price: number;
  increment: number;
  direction: "increase" | "decrease";
  status: "active" | "completed" | "cancelled";
  created_by: string;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
}

const PLAN_COLUMNS =
  "id, sku, marketplace, price_type, start_price, current_price, target_price, increment, direction, status, created_by, created_at, updated_at, cancelled_at";

async function requireStaff() {
  const session = await getSession();
  if (!session) return { session: null, error: "Unauthorized" as const };
  return { session, error: null };
}

export async function listPricePlans(): Promise<{ data: PricePlan[] | null; error: string | null }> {
  const { error } = await requireStaff();
  if (error) return { data: null, error };

  const client = await createClient();
  const { data, error: dbError } = await client
    .from("price_change_plans")
    .select(PLAN_COLUMNS)
    .order("created_at", { ascending: false });

  return { data: data as PricePlan[] | null, error: dbError?.message ?? null };
}

export async function createPricePlan(input: {
  sku: string;
  marketplace: MarketplaceCode;
  priceType: PriceType;
  targetPrice: number;
  increment: number;
}): Promise<{ data: PricePlan | null; error: string | null }> {
  const { session, error } = await requireStaff();
  if (error) return { data: null, error };

  const { sku, marketplace, priceType, targetPrice, increment } = input;

  if (!sku) return { data: null, error: "SKU is required" };
  if (priceType !== "your_price" && priceType !== "sale_price") {
    return { data: null, error: "Invalid price type" };
  }
  if (!Number.isFinite(increment) || increment <= 0) {
    return { data: null, error: "Increment must be greater than 0" };
  }
  if (!Number.isFinite(targetPrice)) {
    return { data: null, error: "Target price is required" };
  }

  let detail;
  try {
    detail = await getSkuDetail(sku, MARKETPLACE_IDS[marketplace]);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Failed to look up SKU on Amazon" };
  }
  // For a Sale Price plan, start from the live promotional sale price; when no sale is active
  // fall back to Your Price, since a new sale logically begins at the current selling price.
  const startPrice =
    priceType === "sale_price" ? detail.discountedPrice ?? detail.salesPrice : detail.salesPrice;
  if (startPrice === null) {
    const label = priceType === "sale_price" ? "sale price" : "price";
    return {
      data: null,
      error: detail.error ?? `No current ${label} on Amazon — a plan can't be created for this SKU`,
    };
  }
  if (targetPrice === startPrice) {
    return { data: null, error: "Target price must differ from current price" };
  }

  const service = createServiceClient();

  const { data: existingActive, error: existingError } = await service
    .from("price_change_plans")
    .select("id")
    .eq("sku", sku)
    .eq("marketplace", marketplace)
    .eq("price_type", priceType)
    .eq("status", "active")
    .maybeSingle();
  if (existingError) return { data: null, error: existingError.message };
  if (existingActive) {
    const label = priceType === "sale_price" ? "Sale Price" : "Your Price";
    return {
      data: null,
      error: `An active ${label} plan already exists for this SKU — cancel it first.`,
    };
  }

  const direction = targetPrice > startPrice ? "increase" : "decrease";

  const { data, error: insertError } = await service
    .from("price_change_plans")
    .insert({
      sku,
      marketplace,
      price_type: priceType,
      start_price: startPrice,
      current_price: startPrice,
      target_price: targetPrice,
      increment,
      direction,
      created_by: session!.username,
    })
    .select(PLAN_COLUMNS)
    .single();

  if (insertError) {
    // A concurrent create can slip past the pre-check above; the partial unique
    // index (sku, marketplace, price_type where status='active') is the real guard.
    if (insertError.code === "23505") {
      const label = priceType === "sale_price" ? "Sale Price" : "Your Price";
      return { data: null, error: `An active ${label} plan already exists for this SKU — cancel it first.` };
    }
    return { data: null, error: insertError.message };
  }
  return { data: data as PricePlan, error: null };
}

export async function createBulkPricePlans(input: {
  skus: { sku: string; targetPrice: number }[];
  marketplace: MarketplaceCode;
  priceType: PriceType;
  increment: number;
}): Promise<{
  data: { created: PricePlan[]; skipped: { sku: string; error: string }[] } | null;
  error: string | null;
}> {
  const { session, error } = await requireStaff();
  if (error) return { data: null, error };

  const { skus, marketplace, priceType, increment } = input;
  const label = priceType === "sale_price" ? "Sale Price" : "Your Price";

  if (priceType !== "your_price" && priceType !== "sale_price") {
    return { data: null, error: "Invalid price type" };
  }
  if (!Number.isFinite(increment) || increment <= 0) {
    return { data: null, error: "Increment must be greater than 0" };
  }
  if (skus.length === 0) return { data: null, error: "No SKUs selected" };
  if (skus.some((s) => !s.sku || !Number.isFinite(s.targetPrice))) {
    return { data: null, error: "Every SKU needs a valid target price" };
  }

  const skuList = skus.map((s) => s.sku);
  const pricing = await getSkuPricing(skuList, MARKETPLACE_IDS[marketplace]);
  const pricingBySku = new Map(pricing.map((p) => [p.sku, p]));

  const service = createServiceClient();

  const { data: activeRows, error: activeError } = await service
    .from("price_change_plans")
    .select("sku")
    .in("sku", skuList)
    .eq("marketplace", marketplace)
    .eq("price_type", priceType)
    .eq("status", "active");
  if (activeError) return { data: null, error: activeError.message };
  const alreadyActive = new Set((activeRows ?? []).map((r) => r.sku as string));

  const skipped: { sku: string; error: string }[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const { sku, targetPrice } of skus) {
    if (alreadyActive.has(sku)) {
      skipped.push({ sku, error: `An active ${label} plan already exists for this SKU — cancel it first.` });
      continue;
    }

    const detail = pricingBySku.get(sku);
    const startPrice =
      priceType === "sale_price" ? detail?.discountedPrice ?? detail?.salesPrice ?? null : detail?.salesPrice ?? null;
    if (startPrice === null || startPrice === undefined) {
      skipped.push({
        sku,
        error: detail?.error ?? `No current ${label.toLowerCase()} on Amazon — a plan can't be created for this SKU`,
      });
      continue;
    }
    if (targetPrice === startPrice) {
      skipped.push({ sku, error: "Target price must differ from current price" });
      continue;
    }

    rows.push({
      sku,
      marketplace,
      price_type: priceType,
      start_price: startPrice,
      current_price: startPrice,
      target_price: targetPrice,
      increment,
      direction: targetPrice > startPrice ? "increase" : "decrease",
      created_by: session!.username,
    });
  }

  if (rows.length === 0) return { data: { created: [], skipped }, error: null };

  const { data, error: insertError } = await service
    .from("price_change_plans")
    .insert(rows)
    .select(PLAN_COLUMNS);

  if (insertError) {
    // The partial unique index (sku, marketplace, price_type where status='active') can still
    // reject the whole batch on a rare concurrent create that slipped past the pre-check above.
    if (insertError.code === "23505") {
      return { data: null, error: `One or more selected SKUs already have an active ${label} plan — refresh and try again.` };
    }
    return { data: null, error: insertError.message };
  }

  return { data: { created: (data ?? []) as PricePlan[], skipped }, error: null };
}

export async function updatePricePlan(
  id: string,
  input: { targetPrice: number; increment: number }
): Promise<{ data: PricePlan | null; error: string | null }> {
  const { error } = await requireStaff();
  if (error) return { data: null, error };

  const { targetPrice, increment } = input;
  if (!Number.isFinite(increment) || increment <= 0) {
    return { data: null, error: "Increment must be greater than 0" };
  }
  if (!Number.isFinite(targetPrice)) {
    return { data: null, error: "Target price is required" };
  }

  const service = createServiceClient();

  // Need current_price to recompute direction and validate the new target.
  const { data: plan, error: loadError } = await service
    .from("price_change_plans")
    .select("current_price, status")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return { data: null, error: loadError.message };
  if (!plan) return { data: null, error: "Plan not found" };
  if (plan.status !== "active") return { data: null, error: "Only active plans can be edited" };
  if (targetPrice === plan.current_price) {
    return { data: null, error: "Target price must differ from current price" };
  }

  const direction = targetPrice > plan.current_price ? "increase" : "decrease";

  const { data, error: updateError } = await service
    .from("price_change_plans")
    .update({ target_price: targetPrice, increment, direction, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "active")
    .select(PLAN_COLUMNS)
    .single();

  if (updateError) return { data: null, error: updateError.message };
  return { data: data as PricePlan, error: null };
}

export async function cancelPricePlan(id: string): Promise<{ data: { ok: true } | null; error: string | null }> {
  const { error } = await requireStaff();
  if (error) return { data: null, error };

  const service = createServiceClient();

  const { data, error: updateError } = await service
    .from("price_change_plans")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (updateError) return { data: null, error: updateError.message };
  if (!data) return { data: null, error: "Only active plans can be cancelled" };

  return { data: { ok: true }, error: null };
}
