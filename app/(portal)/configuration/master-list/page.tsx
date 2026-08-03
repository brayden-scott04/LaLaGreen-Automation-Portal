"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { masterList } from "@/lib/configuration";
import {
  listSkus,
  addSkus,
  replaceSkus,
  deleteSku,
  reorderSkus,
  parseSkuExcel,
  type Sku,
  type DetectedSkuSheet,
} from "@/lib/actions/sku-list";
import { fetchSkuDetail } from "@/lib/actions/pricing-update";
import type { MarketplaceCode, SkuDetail } from "@/lib/amazon/sp-api";

function formatPrice(amount: number | null): string {
  return amount === null ? "—" : "$" + amount.toFixed(2);
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const primaryBtn =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";

export default function MasterListPage() {
  const [skus, setSkus] = useState<Sku[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Sku | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function refresh() {
    const { data, error } = await listSkus();
    if (error) setError(error);
    else {
      setSkus(data ?? []);
      setError(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDelete(sku: Sku) {
    if (!confirm(`Remove "${sku.sku}" from the master list?`)) return;
    await deleteSku(sku.id);
    refresh();
  }

  const isFiltering = search.trim() !== "";
  // SKUs are stored case-sensitively, but search stays case-insensitive for usability.
  const query = search.trim().toLowerCase();
  const filtered = (skus ?? []).filter((s) => s.sku.toLowerCase().includes(query));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !skus) return;
    const oldIndex = skus.findIndex((s) => s.id === active.id);
    const newIndex = skus.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = skus;
    const next = arrayMove(skus, oldIndex, newIndex);
    setSkus(next); // optimistic
    reorderSkus(next.map((s) => s.id)).then(({ error }) => {
      if (error) {
        setError(error);
        setSkus(previous); // revert on failure
      } else {
        setError(null);
      }
    });
  }

  return (
    <>
      <PageHeader icon={masterList.icon} title={masterList.name} description={masterList.description} />
      <div className="p-6 md:p-8">
        <Card>
          <CardHeader className="grid-cols-1! sm:grid-cols-[1fr_auto]!">
            <CardTitle>SKUs</CardTitle>
            <CardDescription>
              {skus ? `${skus.length} SKU${skus.length === 1 ? "" : "s"} in the master list` : "Loading…"}
            </CardDescription>
            <CardAction className="flex gap-2">
              <button onClick={() => setImportOpen(true)} className={secondaryBtn}>
                Import from Excel
              </button>
              <button onClick={() => setAddOpen(true)} className={primaryBtn}>
                + Add SKUs
              </button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

            {skus === null ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : skus.length === 0 ? (
              <p className="text-sm text-muted-foreground">No SKUs yet — add some manually or import an Excel file.</p>
            ) : (
              <>
                <div className="mb-3 space-y-1">
                  <input
                    className={inputClass}
                    placeholder="Filter SKUs…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isFiltering
                      ? "Clear the filter to drag SKUs into a new order."
                      : "Drag the handle to reorder — the order is saved automatically."}
                  </p>
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={filtered.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {filtered.map((s) => (
                        <SortableSkuRow
                          key={s.id}
                          sku={s}
                          dragDisabled={isFiltering}
                          onSelect={() => setSelected(s)}
                          onDelete={() => handleDelete(s)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground">No SKUs match &quot;{search}&quot;.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AddSkusSheet open={addOpen} onOpenChange={setAddOpen} onApplied={refresh} />
      <ImportSkusSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        existingSkus={(skus ?? []).map((s) => s.sku)}
        onApplied={refresh}
      />
      <SkuDetailDialog sku={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  );
}

function SortableSkuRow({
  sku,
  dragDisabled,
  onSelect,
  onDelete,
}: {
  sku: Sku;
  dragDisabled: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sku.id,
    disabled: dragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Whole row is the drag surface (more robust than a tiny handle button). The grip is a
  // visual affordance only. Inner buttons still click through: PointerSensor's 4px
  // activation constraint treats a press without movement as a click, not a drag.
  const dragProps = dragDisabled ? {} : { ...attributes, ...listeners };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragProps}
      className={`flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm select-none ${
        dragDisabled ? "cursor-default" : "cursor-grab touch-none active:cursor-grabbing"
      } ${isDragging ? "z-10 shadow-md" : ""}`}
    >
      <span
        aria-hidden
        className={`-ml-1 shrink-0 text-muted-foreground ${dragDisabled ? "opacity-30" : ""}`}
      >
        <GripVertical className="size-4" />
      </span>
      <button
        onClick={onSelect}
        className={`min-w-0 flex-1 truncate text-left font-mono hover:underline ${
          dragDisabled ? "cursor-default" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        {sku.sku}
      </button>
      <button onClick={onDelete} className="ml-1 shrink-0 text-destructive hover:underline">
        Remove
      </button>
    </div>
  );
}

function AddSkusSheet({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setText("");
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleAdd() {
    const skus = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (skus.length === 0) {
      setError("Enter at least one SKU");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await addSkus(skus);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    handleOpenChange(false);
    onApplied();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Add SKUs</SheetTitle>
          <SheetDescription>One per line, or separated by commas.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4">
          <textarea
            className={`${inputClass} min-h-40 font-mono`}
            placeholder={"SKU-0001\nSKU-0002"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <SheetFooter className="flex-row justify-end gap-2">
          <button onClick={handleAdd} disabled={busy} className={primaryBtn}>
            {busy ? "Adding…" : "Add"}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ImportSkusSheet({
  open,
  onOpenChange,
  existingSkus,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSkus: string[];
  onApplied: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [extractedSkus, setExtractedSkus] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [detected, setDetected] = useState<DetectedSkuSheet[] | null>(null);
  const [mode, setMode] = useState<"append" | "overwrite">("append");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const existingSet = new Set(existingSkus);

  function reset() {
    setIsDragging(false);
    setExtractedSkus(null);
    setSelected(new Set());
    setWarnings([]);
    setDetected(null);
    setMode("append");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleFile(file: File) {
    setError(null);
    setWarnings([]);
    setExtractedSkus(null);
    setDetected(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const { data, error } = await parseSkuExcel(formData);
      if (error) setError(error);
      else if (data) {
        setExtractedSkus(data.skus);
        setSelected(new Set(data.skus));
        setWarnings(data.warnings);
        setDetected(data.detected);
      }
    });
  }

  function toggle(sku: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  function handleApply() {
    if (selected.size === 0 || !extractedSkus) return;
    // Follow the file's order regardless of the order rows were toggled.
    const applied = extractedSkus.filter((s) => selected.has(s));

    if (mode === "overwrite") {
      const ok = window.confirm(
        `Overwrite the entire master list with these ${applied.length} SKUs? SKUs not in this import will be removed.`
      );
      if (!ok) return;
    }

    startTransition(async () => {
      const { error } =
        mode === "overwrite" ? await replaceSkus(applied) : await addSkus(applied);
      if (error) {
        setError(error);
        return;
      }
      handleOpenChange(false);
      onApplied();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Use AI — Import SKUs</SheetTitle>
          <SheetDescription>
            Drop an Excel file and Claude will locate the SKU column and skip inactive items, even if the sheet isn&apos;t formatted consistently.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
          {!extractedSkus && (
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
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
                className={primaryBtn}
              >
                Browse
              </button>
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
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
              {warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          {detected && detected.length > 0 && (
            <div className="space-y-1 rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              {detected.map((d) => (
                <p key={d.sheetName}>
                  <span className="font-medium text-foreground">{d.sheetName}</span>: found{" "}
                  {d.rowsFound} SKU{d.rowsFound === 1 ? "" : "s"} in column &quot;{d.skuColumnLabel}&quot;
                  {d.source === "ai" ? " (Claude-detected)" : ""}
                  {d.inactiveExcluded > 0
                    ? ` (${d.inactiveExcluded} excluded as inactive)`
                    : ""}
                </p>
              ))}
            </div>
          )}

          {extractedSkus && extractedSkus.length > 0 && (
            <div className="space-y-1.5">
              <div className="space-y-1">
                <div className="inline-flex rounded-md border border-input p-0.5">
                  {(["append", "overwrite"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded px-3 py-1 text-sm font-medium capitalize transition-colors ${
                        mode === m ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {mode === "overwrite"
                    ? "Replaces the entire master list with these SKUs."
                    : "Adds these to the existing list."}
                </p>
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {selected.size} of {extractedSkus.length} selected — uncheck any that shouldn&apos;t be added
              </p>
              <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {extractedSkus.map((sku) => (
                  <label
                    key={sku}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox checked={selected.has(sku)} onCheckedChange={() => toggle(sku)} />
                    <span className="flex-1 truncate font-mono">{sku}</span>
                    {existingSet.has(sku) && (
                      <span className="text-xs text-muted-foreground">already in list</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="flex-row flex-wrap justify-end gap-2">
          {extractedSkus && (
            <button onClick={reset} disabled={isPending} className={secondaryBtn}>
              Start Over
            </button>
          )}
          <button
            onClick={handleApply}
            disabled={!extractedSkus || selected.size === 0 || isPending}
            className={primaryBtn}
          >
            {isPending
              ? "Applying…"
              : mode === "overwrite"
                ? `Overwrite with ${selected.size || ""} SKU${selected.size === 1 ? "" : "s"}`
                : `Add ${selected.size || ""} SKU${selected.size === 1 ? "" : "s"}`}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SkuDetailDialog({
  sku,
  onOpenChange,
}: {
  sku: Sku | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [marketplace, setMarketplace] = useState<MarketplaceCode>("US");
  const [detail, setDetail] = useState<SkuDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const skuValue = sku?.sku ?? null;

  // Reset the marketplace back to US each time a different SKU is opened.
  useEffect(() => {
    if (sku) setMarketplace("US");
  }, [sku]);

  const load = useCallback(() => {
    if (!skuValue) return;
    setDetail(null);
    setError(null);
    startTransition(async () => {
      const { data, error } = await fetchSkuDetail(skuValue, marketplace);
      if (error) setError(error);
      else setDetail(data);
    });
  }, [skuValue, marketplace]);

  useEffect(() => {
    load();
  }, [load]);

  const priceRows: { label: string; value: number | null; nullLabel?: string }[] = detail
    ? [
        { label: "Your Price", value: detail.ourPrice },
        { label: "Live Buyer Price", value: detail.livePrice },
        { label: "Sale Price", value: detail.discountedPrice },
        { label: "List Price", value: detail.listPriceExact, nullLabel: "Not set" },
        { label: "Featured Price", value: detail.featuredPrice },
      ]
    : [];

  return (
    <AlertDialog open={sku !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md gap-4 sm:max-w-md">
        <AlertDialogHeader className="place-items-start text-left sm:place-items-start sm:text-left">
          <AlertDialogTitle className="font-mono">{sku?.sku ?? "SKU"}</AlertDialogTitle>
          <AlertDialogDescription>Amazon catalog &amp; pricing details</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          <div className="inline-flex rounded-md border border-input p-0.5">
            {(["US", "CA"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMarketplace(m)}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  marketplace === m ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : error ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <button onClick={load} className={secondaryBtn}>
                Retry
              </button>
            </div>
          ) : detail ? (
            <div className="space-y-4">
              <div>
                {detail.productName ? (
                  <p className="font-medium leading-snug">{detail.productName}</p>
                ) : (
                  <p className="font-mono text-sm">{detail.sku}</p>
                )}
                {detail.productDescription && (
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                    {detail.productDescription}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  ASIN
                </p>
                <p className="font-mono text-sm">{detail.asin ?? "—"}</p>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {priceRows.map((row) => (
                  <div key={row.label}>
                    <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      {row.label}
                    </dt>
                    <dd className="font-medium">
                      {row.value === null && row.nullLabel ? row.nullLabel : formatPrice(row.value)}
                    </dd>
                  </div>
                ))}
              </dl>

              {detail.ourPrice === null && (
                <p className="text-xs text-muted-foreground">
                  {detail.error ?? "No active offer on Amazon for this SKU."}
                </p>
              )}
            </div>
          ) : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
