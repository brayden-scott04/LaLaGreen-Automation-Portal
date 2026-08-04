"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Clock, Pencil, X, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { priceChangePlans } from "@/lib/projects";
import { listSkus, type Sku } from "@/lib/actions/sku-list";
import { fetchSkuDetail, fetchSkuPricing } from "@/lib/actions/pricing-update";
import {
  listPricePlans,
  createPricePlan,
  createBulkPricePlans,
  updatePricePlan,
  cancelPricePlan,
  type PricePlan,
} from "@/lib/actions/price-change-plans";
import { analyzeBulkPriceImport, type DetectedPriceImportSheet } from "@/lib/actions/price-plan-import";
import type { MarketplaceCode, SkuDetail, PricingResult } from "@/lib/amazon/sp-api";

const inputClass =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const DEFAULT_INCREMENT = "2";

const PRICE_TYPES = ["your_price", "sale_price"] as const;
type PriceTypeOption = (typeof PRICE_TYPES)[number];

function priceTypeLabel(type: PriceTypeOption) {
  return type === "sale_price" ? "Sale Price" : "Your Price";
}

function formatPrice(amount: number | null) {
  return amount === null ? "—" : `$${amount.toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// n8n applies one step per day, so days remaining == steps remaining.
function daysRemaining(current: number, target: number, increment: number): number {
  return Math.ceil(Math.abs(target - current) / increment);
}

function progressPercent(start: number, current: number, target: number): number {
  if (target === start) return 100;
  const pct = ((current - start) / (target - start)) * 100;
  return Math.min(100, Math.max(0, pct));
}

export default function PriceChangePlansPage() {
  const [plans, setPlans] = useState<PricePlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bulkSheetOpen, setBulkSheetOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<PricePlan | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reloadPlans() {
    startTransition(async () => {
      const { data, error } = await listPricePlans();
      if (error) setError(error);
      else {
        setPlans(data ?? []);
        setError(null);
      }
    });
  }

  useEffect(() => {
    reloadPlans();
  }, []);

  function confirmCancel() {
    const id = cancelId;
    if (!id) return;
    setCancelId(null);
    startTransition(async () => {
      const { error } = await cancelPricePlan(id);
      if (error) setError(error);
      else reloadPlans();
    });
  }

  return (
    <>
      <PageHeader icon={priceChangePlans.icon} title={priceChangePlans.name} description={priceChangePlans.description} />
      <div className="space-y-6 p-6 md:p-8">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Plans</CardTitle>
                <CardDescription>
                  Gradually move a SKU&apos;s Amazon sales price toward a target. n8n executes each step —
                  this page only defines the plan and shows progress.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setBulkSheetOpen(true)} className="w-full sm:w-auto">
                  + Bulk Plan
                </Button>
                <Button onClick={() => setSheetOpen(true)} className="w-full sm:w-auto">
                  + New Plan
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {plans === null ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No price change plans yet — click &quot;+ New Plan&quot; to create one.
              </p>
            ) : (
              <PlansList plans={plans} isPending={isPending} onCancel={setCancelId} onEdit={setEditPlan} />
            )}
          </CardContent>
        </Card>
      </div>

      <NewPricePlanSheet
        open={sheetOpen}
        activePlans={(plans ?? []).filter((p) => p.status === "active")}
        onOpenChange={setSheetOpen}
        onCreated={() => {
          setSheetOpen(false);
          reloadPlans();
        }}
      />

      <NewBulkPricePlanSheet
        open={bulkSheetOpen}
        activePlans={(plans ?? []).filter((p) => p.status === "active")}
        onOpenChange={setBulkSheetOpen}
        onCreated={() => {
          setBulkSheetOpen(false);
          reloadPlans();
        }}
      />

      <EditPricePlanSheet
        plan={editPlan}
        onOpenChange={(open) => !open && setEditPlan(null)}
        onSaved={() => {
          setEditPlan(null);
          reloadPlans();
        }}
      />

      <AlertDialog open={cancelId !== null} onOpenChange={(open) => !open && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this price change plan?</AlertDialogTitle>
            <AlertDialogDescription>
              n8n will stop applying further steps for this plan. This can&apos;t be undone — you&apos;ll need to
              create a new plan if you want to resume.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Plan</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmCancel}>
              Cancel Plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PlansList({
  plans,
  isPending,
  onCancel,
  onEdit,
}: {
  plans: PricePlan[];
  isPending: boolean;
  onCancel: (id: string) => void;
  onEdit: (plan: PricePlan) => void;
}) {
  const [marketFilter, setMarketFilter] = useState<"ALL" | MarketplaceCode>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | PriceTypeOption>("ALL");
  const [skuSearch, setSkuSearch] = useState("");

  const query = skuSearch.trim().toUpperCase();
  const filtered = plans.filter(
    (p) =>
      (marketFilter === "ALL" || p.marketplace === marketFilter) &&
      (typeFilter === "ALL" || p.price_type === typeFilter) &&
      (query === "" || p.sku.toUpperCase().includes(query))
  );

  const pending = filtered.filter((p) => p.status === "active");
  const completed = filtered.filter((p) => p.status === "completed");
  const cancelled = filtered.filter((p) => p.status === "cancelled");

  return (
    <Tabs defaultValue="pending">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5" aria-label="Pending">
            <Clock className="size-3.5" />
            <span className="hidden sm:inline">Pending</span>
            <Badge variant="secondary" className="px-1.5">
              {pending.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5" aria-label="Completed">
            <CheckCircle2 className="size-3.5" />
            <span className="hidden sm:inline">Completed</span>
            <Badge variant="secondary" className="px-1.5">
              {completed.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="gap-1.5" aria-label="Cancelled">
            <XCircle className="size-3.5" />
            <span className="hidden sm:inline">Cancelled</span>
            <Badge variant="secondary" className="px-1.5">
              {cancelled.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <input
            value={skuSearch}
            onChange={(e) => setSkuSearch(e.target.value)}
            placeholder="Search SKU…"
            className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring sm:w-48"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "ALL" | PriceTypeOption)}
            className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring sm:w-auto"
          >
            <option value="ALL">All Price Types</option>
            {PRICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {priceTypeLabel(t)}
              </option>
            ))}
          </select>
          <select
            value={marketFilter}
            onChange={(e) => setMarketFilter(e.target.value as "ALL" | MarketplaceCode)}
            className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring sm:w-auto"
          >
            <option value="ALL">All Marketplaces</option>
            <option value="US">US</option>
            <option value="CA">Canada</option>
          </select>
        </div>
      </div>

      <TabsContent value="pending" className="mt-4">
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending plans right now.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                disabled={isPending}
                onCancel={() => onCancel(p.id)}
                onEdit={() => onEdit(p)}
              />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="completed" className="mt-4">
        <HistoryTable plans={completed} emptyText="No completed plans yet." />
      </TabsContent>

      <TabsContent value="cancelled" className="mt-4">
        <HistoryTable plans={cancelled} emptyText="No cancelled plans." />
      </TabsContent>
    </Tabs>
  );
}

function MarketplaceBadge({ code }: { code: MarketplaceCode }) {
  return (
    <Badge variant="secondary" className="font-mono">
      {code}
    </Badge>
  );
}

function HistoryTable({ plans, emptyText }: { plans: PricePlan[]; emptyText: string }) {
  if (plans.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Market</th>
            <th className="px-3 py-2">Start → Target</th>
            <th className="px-3 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0 even:bg-muted/20 hover:bg-muted/30">
              <td className="px-3 py-2.5 font-mono">{p.sku}</td>
              <td className="px-3 py-2.5">
                <MarketplaceBadge code={p.marketplace} />
              </td>
              <td className="px-3 py-2.5">
                {formatPrice(p.start_price)}
                <span className="text-muted-foreground"> → </span>
                {formatPrice(p.target_price)}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{formatDate(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanCard({
  plan: p,
  disabled,
  onCancel,
  onEdit,
}: {
  plan: PricePlan;
  disabled: boolean;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const pct = progressPercent(p.start_price, p.current_price, p.target_price);
  const days = daysRemaining(p.current_price, p.target_price, p.increment);
  const DirectionIcon = p.direction === "increase" ? ArrowUp : ArrowDown;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">{p.sku}</span>
          <MarketplaceBadge code={p.marketplace} />
          <Badge variant="outline">{priceTypeLabel(p.price_type)}</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            disabled={disabled}
            aria-label="Edit plan"
            title="Edit target & step"
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            disabled={disabled}
            aria-label="Cancel plan"
            title="Cancel plan"
          >
            <X />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Current</p>
          <p className="flex items-center gap-1 text-lg font-semibold">
            <DirectionIcon className="size-4 text-muted-foreground" />
            {formatPrice(p.current_price)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Target</p>
          <p className="text-lg font-semibold">{formatPrice(p.target_price)}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Complete</p>
          <p className="text-lg font-semibold">{Math.round(pct)}%</p>
          <p className="text-xs text-muted-foreground">{days} day{days === 1 ? "" : "s"} left</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="w-14 shrink-0 text-xs text-muted-foreground">{formatPrice(p.start_price)}</span>
        <div className="relative h-1.5 flex-1 rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          <div
            className="absolute top-1/2 size-3 rounded-full border-2 border-background bg-primary shadow"
            style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
          />
        </div>
        <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">{formatPrice(p.target_price)}</span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground/70">
        {formatPrice(p.increment)} per step · started {formatDate(p.created_at)}
      </p>
    </div>
  );
}

function SkuDetailPanel({ detail, onRefresh }: { detail: SkuDetail; onRefresh: () => void }) {
  const priceRows: { label: string; value: number | null }[] = [
    { label: "Your Price", value: detail.salesPrice },
    { label: "Sale Price", value: detail.discountedPrice },
    { label: "List Price", value: detail.listPrice },
    { label: "Featured Price", value: detail.featuredPrice },
    { label: "Min Seller Allowed", value: detail.minSellerAllowedPrice },
    { label: "Max Seller Allowed", value: detail.maxSellerAllowedPrice },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {detail.productName ? (
            <p className="font-medium leading-snug">{detail.productName}</p>
          ) : (
            <p className="font-mono text-sm">{detail.sku}</p>
          )}
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            ASIN: {detail.asin ?? "—"}
          </p>
          {detail.productDescription && (
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{detail.productDescription}</p>
          )}
        </div>
        <button onClick={onRefresh} className="shrink-0 text-xs text-primary hover:underline">
          Refresh
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {priceRows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{row.label}</dt>
            <dd className="font-medium">{formatPrice(row.value)}</dd>
          </div>
        ))}
      </dl>

      {detail.salesPrice === null && (
        <p className="text-xs text-muted-foreground">
          {detail.error ?? "No current sales price for this SKU — you can't create a plan until it has one."}
        </p>
      )}
    </div>
  );
}

function NewPricePlanSheet({
  open,
  activePlans,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  activePlans: PricePlan[];
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [skus, setSkus] = useState<Sku[] | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [marketplace, setMarketplace] = useState<MarketplaceCode>("US");
  const [priceType, setPriceType] = useState<PriceTypeOption>("your_price");
  const [detail, setDetail] = useState<SkuDetail | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const priceLabel = priceTypeLabel(priceType);
  // Mirror the server's start-price selection: a Sale Price plan starts from the live sale price,
  // falling back to Your Price when no sale is active.
  const currentPrice =
    priceType === "sale_price" ? detail?.discountedPrice ?? detail?.salesPrice ?? null : detail?.salesPrice ?? null;
  const [targetPrice, setTargetPrice] = useState("");
  const [increment, setIncrement] = useState(DEFAULT_INCREMENT);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open && skus === null) {
      listSkus().then(({ data }) => setSkus(data ?? []));
    }
  }, [open, skus]);

  function resetForm() {
    setSearch("");
    setSelectedSku(null);
    setMarketplace("US");
    setPriceType("your_price");
    setDetail(null);
    setPriceError(null);
    setTargetPrice("");
    setIncrement(DEFAULT_INCREMENT);
    setCreateError(null);
  }

  function selectSku(sku: string) {
    setSelectedSku(sku);
    setDetail(null);
    setPriceError(null);
  }

  const fetchPrice = useCallback(
    (sku: string, mp: MarketplaceCode) => {
      startTransition(async () => {
        setPriceError(null);
        setDetail(null);
        const { data, error } = await fetchSkuDetail(sku, mp);
        if (error || !data) {
          setPriceError(error ?? "Failed to fetch SKU detail");
        } else {
          // Always show whatever the listing has. A missing sales price is surfaced inside
          // the panel and the create gate stays disabled — it's not a hard error.
          setDetail(data);
          setPriceError(null);
        }
      });
    },
    [startTransition]
  );

  useEffect(() => {
    if (selectedSku) fetchPrice(selectedSku, marketplace);
  }, [selectedSku, marketplace, fetchPrice]);

  // Mirrors the server + DB uniqueness rule: one active plan per (sku, marketplace, price_type).
  const isDuplicate =
    selectedSku !== null &&
    activePlans.some(
      (p) => p.sku === selectedSku && p.marketplace === marketplace && p.price_type === priceType
    );

  const targetNum = Number(targetPrice);
  const incrementNum = Number(increment);
  const hasValidTarget = targetPrice.trim() !== "" && Number.isFinite(targetNum);
  const hasValidIncrement = increment.trim() !== "" && Number.isFinite(incrementNum) && incrementNum > 0;
  const canCreate =
    !isDuplicate &&
    currentPrice !== null &&
    hasValidTarget &&
    targetNum !== currentPrice &&
    hasValidIncrement &&
    !isPending;

  const direction = currentPrice !== null && hasValidTarget ? (targetNum > currentPrice ? "increase" : "decrease") : null;
  const steps =
    currentPrice !== null && hasValidTarget && hasValidIncrement
      ? Math.ceil(Math.abs(targetNum - currentPrice) / incrementNum)
      : null;

  function handleCreate() {
    if (!selectedSku || currentPrice === null) return;
    setCreateError(null);
    startTransition(async () => {
      const { error } = await createPricePlan({
        sku: selectedSku,
        marketplace,
        priceType,
        targetPrice: targetNum,
        increment: incrementNum,
      });
      if (error) setCreateError(error);
      else {
        resetForm();
        onCreated();
      }
    });
  }

  const filtered = (skus ?? []).filter((s) => s.sku.toUpperCase().includes(search.trim().toUpperCase()));
  const trimmedSearch = search.trim();
  const isExactMatch = (skus ?? []).some((s) => s.sku.toUpperCase() === trimmedSearch.toUpperCase());
  const showManualEntry = skus !== null && trimmedSearch !== "" && !isExactMatch;
  const selectedSkuInMasterList = selectedSku !== null && (skus ?? []).some((s) => s.sku === selectedSku);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New Price Change Plan</SheetTitle>
          <SheetDescription>
            Pick a SKU, choose which price to move, confirm its current value, then set a target and step size.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4">
          {createError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {createError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">SKU</label>
            <input
              className={`${inputClass} mb-2`}
              placeholder="Filter SKUs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-1">
              {skus === null ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <>
                  {filtered.length === 0 && !showManualEntry && (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">No SKUs match &quot;{search}&quot;.</p>
                  )}
                  {filtered.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectSku(s.sku)}
                      className={`block w-full rounded-md px-2 py-1.5 text-left font-mono text-sm ${
                        selectedSku === s.sku ? "bg-primary/10 text-primary" : "hover:bg-accent"
                      }`}
                    >
                      {s.sku}
                    </button>
                  ))}
                  {showManualEntry && (
                    <button
                      type="button"
                      onClick={() => selectSku(trimmedSearch)}
                      className={`block w-full rounded-md px-2 py-1.5 text-left text-sm ${
                        selectedSku === trimmedSearch ? "bg-primary/10 text-primary" : "hover:bg-accent"
                      }`}
                    >
                      Use &quot;<span className="font-mono">{trimmedSearch}</span>&quot;{" "}
                      <span className="text-muted-foreground">(not in master list)</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Marketplace</label>
            <select
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value as MarketplaceCode)}
              className={inputClass}
            >
              <option value="US">US</option>
              <option value="CA">Canada</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Price to update</label>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-input p-1">
              {PRICE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPriceType(type)}
                  className={`rounded px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    priceType === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {priceTypeLabel(type)}
                </button>
              ))}
            </div>
          </div>

          {isDuplicate && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              An active {priceLabel} plan already exists for {selectedSku} on {marketplace} — cancel it first or edit
              the existing plan.
            </div>
          )}

          {selectedSku && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm">
              {isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : priceError ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-destructive">{priceError}</span>
                  <button onClick={() => fetchPrice(selectedSku, marketplace)} className="shrink-0 text-xs text-primary hover:underline">
                    Retry
                  </button>
                </div>
              ) : detail ? (
                <div className="space-y-2">
                  {!selectedSkuInMasterList && <Badge variant="outline">Not in master list</Badge>}
                  <SkuDetailPanel detail={detail} onRefresh={() => fetchPrice(selectedSku, marketplace)} />
                </div>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Target {priceLabel} ($)</label>
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
              />
              {currentPrice !== null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Current {priceLabel}: <span className="font-medium">{formatPrice(currentPrice)}</span>
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Increment ($)</label>
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={increment}
                onChange={(e) => setIncrement(e.target.value)}
              />
            </div>
          </div>

          {direction && steps !== null && (
            <p className="text-sm text-muted-foreground">
              This will {direction} the {priceLabel} from {formatPrice(currentPrice)} to {formatPrice(targetNum)} in steps
              of up to {formatPrice(incrementNum)} — about {steps} day{steps === 1 ? "" : "s"} to reach the target
              (n8n applies one step per day).
            </p>
          )}
        </div>

        <SheetFooter>
          <Button onClick={handleCreate} disabled={!canCreate}>
            {isPending ? "Creating…" : "Create Plan"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function NewBulkPricePlanSheet({
  open,
  activePlans,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  activePlans: PricePlan[];
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [phase, setPhase] = useState<"select" | "review" | "results">("select");
  const [isDragging, setIsDragging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marketplace, setMarketplace] = useState<MarketplaceCode>("US");
  const [priceType, setPriceType] = useState<PriceTypeOption>("your_price");
  const [pricingMap, setPricingMap] = useState<Map<string, PricingResult> | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [increment, setIncrement] = useState(DEFAULT_INCREMENT);
  const [detected, setDetected] = useState<DetectedPriceImportSheet[] | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [results, setResults] = useState<{ created: number; skipped: { sku: string; error: string }[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const priceLabel = priceTypeLabel(priceType);

  function resetAll() {
    setPhase("select");
    setIsDragging(false);
    setSelected(new Set());
    setMarketplace("US");
    setPriceType("your_price");
    setPricingMap(null);
    setTargets({});
    setIncrement(DEFAULT_INCREMENT);
    setDetected(null);
    setImportWarnings([]);
    setLoadError(null);
    setCreateError(null);
    setResults(null);
  }

  function handleFile(file: File) {
    setLoadError(null);
    setDetected(null);
    setImportWarnings([]);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const { data, error } = await analyzeBulkPriceImport(formData);
      if (error || !data) {
        setLoadError(error ?? "Failed to parse file");
        return;
      }
      setDetected(data.detected);
      setImportWarnings(data.warnings);
      setSelected(new Set(data.rows.map((r) => r.sku)));
      setTargets(Object.fromEntries(data.rows.map((r) => [r.sku, r.targetPrice !== null ? String(r.targetPrice) : ""])));
    });
  }

  function loadPrices() {
    setLoadError(null);
    startTransition(async () => {
      const list = Array.from(selected);
      const { data, error } = await fetchSkuPricing(list, marketplace);
      if (error || !data) {
        setLoadError(error ?? "Failed to fetch pricing");
        return;
      }
      setPricingMap(new Map(data.map((p) => [p.sku, p])));
      setPhase("review");
    });
  }

  function removeRow(sku: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(sku);
      return next;
    });
    setTargets((prev) => {
      const next = { ...prev };
      delete next[sku];
      return next;
    });
  }

  const rowSkus = Array.from(selected);
  const missingTargetCount = rowSkus.filter((sku) => !(targets[sku] ?? "").trim()).length;

  function currentPriceFor(sku: string): number | null {
    const detail = pricingMap?.get(sku);
    if (!detail) return null;
    return priceType === "sale_price" ? detail.discountedPrice ?? detail.salesPrice ?? null : detail.salesPrice ?? null;
  }

  function isDuplicateFor(sku: string): boolean {
    return activePlans.some((p) => p.sku === sku && p.marketplace === marketplace && p.price_type === priceType);
  }

  const incrementNum = Number(increment);
  const hasValidIncrement = increment.trim() !== "" && Number.isFinite(incrementNum) && incrementNum > 0;

  const eligibleRows = rowSkus.filter((sku) => currentPriceFor(sku) !== null && !isDuplicateFor(sku));
  const allTargetsValid = eligibleRows.every((sku) => {
    const t = Number(targets[sku]);
    const current = currentPriceFor(sku);
    return (targets[sku] ?? "").trim() !== "" && Number.isFinite(t) && current !== null && t !== current;
  });

  const canCreate = eligibleRows.length > 0 && allTargetsValid && hasValidIncrement && !isPending;

  function handleCreate() {
    if (!canCreate) return;
    setCreateError(null);
    startTransition(async () => {
      const payload = eligibleRows.map((sku) => ({ sku, targetPrice: Number(targets[sku]) }));
      const { data, error } = await createBulkPricePlans({
        skus: payload,
        marketplace,
        priceType,
        increment: incrementNum,
      });
      if (error || !data) {
        setCreateError(error ?? "Failed to create plans");
        return;
      }
      setResults({ created: data.created.length, skipped: data.skipped });
      setPhase("results");
    });
  }

  function finish() {
    resetAll();
    onCreated();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetAll();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Bulk Price Change Plans</SheetTitle>
          <SheetDescription>
            {phase === "select"
              ? "Pick a marketplace and price type, then upload an Excel file with the SKUs and target prices."
              : phase === "review"
                ? "Set a target price for each SKU — every price must be filled in."
                : "Here's what happened."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4">
          {phase === "select" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Marketplace</label>
                <select
                  value={marketplace}
                  onChange={(e) => setMarketplace(e.target.value as MarketplaceCode)}
                  className={inputClass}
                >
                  <option value="US">US</option>
                  <option value="CA">Canada</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Price to update</label>
                <div className="grid grid-cols-2 gap-1 rounded-md border border-input p-1">
                  {PRICE_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setPriceType(type)}
                      className={`rounded px-2.5 py-1.5 text-sm font-medium transition-colors ${
                        priceType === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {priceTypeLabel(type)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-medium text-muted-foreground">SKUs</label>
                  {selected.size > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(new Set());
                        setTargets({});
                        setDetected(null);
                        setImportWarnings([]);
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Upload a different file
                    </button>
                  )}
                </div>

                {selected.size === 0 ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleFile(file);
                    }}
                    className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 text-center text-sm transition-colors ${
                      isDragging ? "border-primary bg-primary/5" : "border-input"
                    }`}
                  >
                    <p className="text-muted-foreground">Drag an Excel file here, or</p>
                    <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isPending}>
                      Browse
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                        e.target.value = "";
                      }}
                    />
                    {isPending && <p className="text-xs text-muted-foreground">Analyzing with Claude…</p>}
                  </div>
                ) : (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm">
                    Found <span className="font-medium">{selected.size}</span> SKU{selected.size === 1 ? "" : "s"} in the
                    file
                    {missingTargetCount > 0 ? (
                      <span className="text-muted-foreground"> — {missingTargetCount} still need a target price, next.</span>
                    ) : (
                      <span className="text-muted-foreground"> — every row already has a target price from the file.</span>
                    )}
                  </div>
                )}

                {detected && detected.length > 0 && (
                  <div className="mt-2 space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {detected.map((d) => (
                      <p key={d.sheetName}>
                        <span className="font-medium text-foreground">{d.sheetName}</span>: {d.rowsFound} row
                        {d.rowsFound === 1 ? "" : "s"} in column &quot;{d.skuColumnLabel}&quot;
                        {d.targetColumnLabel
                          ? `, target price in "${d.targetColumnLabel}"`
                          : ", no target price column found"}
                        {d.source === "ai" ? " (Claude-detected)" : ""}
                      </p>
                    ))}
                  </div>
                )}

                {importWarnings.length > 0 && (
                  <div className="mt-2 space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    {importWarnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </div>
                )}
              </div>

              {loadError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {loadError}
                </div>
              )}
            </>
          )}

          {phase === "review" && (
            <>
              <button type="button" onClick={() => setPhase("select")} className="text-xs text-primary hover:underline">
                ← Back to selection
              </button>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Increment ($)</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputClass}
                  value={increment}
                  onChange={(e) => setIncrement(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">Applied to every plan in this batch.</p>
              </div>

              {createError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {createError}
                </div>
              )}

              <div className="space-y-2">
                {rowSkus.map((sku) => {
                  const current = currentPriceFor(sku);
                  const duplicate = isDuplicateFor(sku);
                  const detail = pricingMap?.get(sku);
                  const targetVal = targets[sku] ?? "";
                  const targetNum = Number(targetVal);
                  const isFilled = targetVal.trim() !== "" && Number.isFinite(targetNum);
                  const sameAsCurrent = isFilled && current !== null && targetNum === current;

                  return (
                    <div key={sku} className="rounded-md border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-medium">{sku}</span>
                        <button
                          type="button"
                          onClick={() => removeRow(sku)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Remove SKU"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      {duplicate ? (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                          Already has an active {priceLabel} plan — excluded.
                        </p>
                      ) : current === null ? (
                        <p className="mt-1 text-xs text-destructive">
                          {detail?.error ?? `No current ${priceLabel.toLowerCase()} on Amazon`} — excluded.
                        </p>
                      ) : (
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Current: {formatPrice(current)}</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Target ($)"
                            value={targetVal}
                            onChange={(e) => setTargets((prev) => ({ ...prev, [sku]: e.target.value }))}
                            className={`${inputClass} w-28 ${!isFilled ? "border-destructive/50" : ""}`}
                          />
                          {sameAsCurrent && <span className="text-xs text-destructive">Must differ from current price</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {phase === "results" && results && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm">
                Created {results.created} plan{results.created === 1 ? "" : "s"}.
              </div>
              {results.skipped.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Skipped:</p>
                  {results.skipped.map((s) => (
                    <p key={s.sku} className="text-xs text-muted-foreground">
                      <span className="font-mono">{s.sku}</span> — {s.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter>
          {phase === "select" && (
            <Button onClick={loadPrices} disabled={selected.size === 0 || isPending}>
              {isPending ? "Loading…" : "Continue"}
            </Button>
          )}
          {phase === "review" && (
            <Button onClick={handleCreate} disabled={!canCreate}>
              {isPending ? "Creating…" : "Create Plans"}
            </Button>
          )}
          {phase === "results" && <Button onClick={finish}>Done</Button>}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function EditPricePlanSheet({
  plan,
  onOpenChange,
  onSaved,
}: {
  plan: PricePlan | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Sheet open={plan !== null} onOpenChange={onOpenChange}>
      <SheetContent>
        {/* Keyed by plan id so the form's inputs reset when a different plan is opened. */}
        {plan && <EditPricePlanForm key={plan.id} plan={plan} onSaved={onSaved} />}
      </SheetContent>
    </Sheet>
  );
}

function EditPricePlanForm({ plan, onSaved }: { plan: PricePlan; onSaved: () => void }) {
  const current = plan.current_price;
  const priceLabel = priceTypeLabel(plan.price_type);
  const [targetPrice, setTargetPrice] = useState(String(plan.target_price));
  const [increment, setIncrement] = useState(String(plan.increment));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const targetNum = Number(targetPrice);
  const incrementNum = Number(increment);
  const hasValidTarget = targetPrice.trim() !== "" && Number.isFinite(targetNum);
  const hasValidIncrement = increment.trim() !== "" && Number.isFinite(incrementNum) && incrementNum > 0;
  const canSave = hasValidTarget && targetNum !== current && hasValidIncrement && !isPending;

  const direction = hasValidTarget ? (targetNum > current ? "increase" : "decrease") : null;
  const steps = hasValidTarget && hasValidIncrement ? Math.ceil(Math.abs(targetNum - current) / incrementNum) : null;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const { error } = await updatePricePlan(plan.id, { targetPrice: targetNum, increment: incrementNum });
      if (error) setError(error);
      else onSaved();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit Price Change Plan</SheetTitle>
        <SheetDescription>
          Adjust the target and step size. The plan keeps its progress and continues from the current price.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">{plan.sku}</span>
          <MarketplaceBadge code={plan.marketplace} />
          <Badge variant="outline">{priceLabel}</Badge>
        </div>

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          Current {priceLabel}: <span className="font-medium">{formatPrice(current)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Target {priceLabel} ($)</label>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Increment ($)</label>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={increment}
              onChange={(e) => setIncrement(e.target.value)}
            />
          </div>
        </div>

        {direction && steps !== null && (
          <p className="text-sm text-muted-foreground">
            This will {direction} the {priceLabel} from {formatPrice(current)} to {formatPrice(targetNum)} in steps of up
            to {formatPrice(incrementNum)} — about {steps} day{steps === 1 ? "" : "s"} to reach the target (n8n applies
            one step per day).
          </p>
        )}
      </div>

      <SheetFooter>
        <Button onClick={handleSave} disabled={!canSave}>
          {isPending ? "Saving…" : "Save Changes"}
        </Button>
      </SheetFooter>
    </>
  );
}
