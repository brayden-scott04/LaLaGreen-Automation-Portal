"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { Settings, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ppcTopUp } from "@/lib/projects";
import {
  getDailyCapConfig,
  updateCountrySettings,
  updateScheduleSlots,
  type CountryConfig,
  type ScheduleRow,
} from "@/lib/actions/ppc-daily-cap";
import {
  listManualTopUps,
  createManualTopUp,
  cancelManualTopUp,
  type ManualTopUp,
} from "@/lib/actions/ppc-manual-topups";
import { analyzeScheduleImport, type DetectedSheet } from "@/lib/actions/ppc-ai-import";
import {
  getAcosTopupConfig,
  updateAcosBandSettings,
  updateAcosTopupSchedule,
  type AcosBandSettings,
  type AcosScheduleRow,
} from "@/lib/actions/ppc-acos-topup";
import {
  ACOS_BANDS,
  ACOS_METRICS,
  type AcosBandKey,
  type AcosMetric,
} from "@/lib/ppc-acos-topup-constants";
import {
  CANONICAL_SLOTS,
  computeRunningTotals,
  computeProjectedRows,
  currentSlotSgt,
  nextSlotSgt,
  resolveCycleDates,
  shiftDateSgt,
  todaySgt,
} from "@/lib/ppc-daily-cap-constants";

const chartConfig = {
  runningTotal: { label: "Cumulative cap ($)", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

const acosBandChartConfig = {
  "0-10": { label: "< 10%", color: "var(--color-chart-1)" },
  "10-20": { label: "10% – 20%", color: "var(--color-chart-2)" },
  "20-30": { label: "20% – 30%", color: "var(--color-chart-3)" },
  "30-plus": { label: "30%+", color: "var(--color-chart-4)" },
} satisfies ChartConfig;

function nextUpcomingSlot(): string {
  const candidate = nextSlotSgt();
  return CANONICAL_SLOTS.find((s) => s >= candidate) ?? CANONICAL_SLOTS[0];
}

function relativeDayLabel(offset: number): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return offset > 0 ? `${offset} days ahead` : `${Math.abs(offset)} days ago`;
}

function toNumericAmount(raw: string): number {
  const n = Number(raw.trim() === "" ? "0" : raw);
  return Number.isFinite(n) ? n : 0;
}

function statusBadgeClass(status: ManualTopUp["status"]): string {
  if (status === "pending") return "bg-primary/10 text-primary";
  if (status === "applied") return "bg-green-500/10 text-green-700 dark:text-green-400";
  return "bg-muted text-muted-foreground";
}

function isManualTopUpFuture(t: Pick<ManualTopUp, "target_date" | "slot_time">): boolean {
  return t.target_date > todaySgt() || (t.target_date === todaySgt() && t.slot_time > currentSlotSgt());
}

export default function PpcTopUpPage() {
  const [countries, setCountries] = useState<CountryConfig[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [dirty, setDirty] = useState<Record<string, Record<string, string>>>({});
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [manualTopUps, setManualTopUps] = useState<ManualTopUp[]>([]);
  const [manualLoading, setManualLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [, startManualTransition] = useTransition();
  const [showAiImport, setShowAiImport] = useState(false);

  function reload() {
    startTransition(async () => {
      const { data, error } = await getDailyCapConfig();
      if (error) setError(error);
      else if (data) {
        setCountries(data.countries);
        setSchedule(data.schedule);
        setError(null);
        setSelectedCountry((prev) => prev ?? data.countries[0]?.country_code ?? null);
      }
      setIsLoading(false);
    });
  }

  function reloadManualTopUps(countryCode: string) {
    startManualTransition(async () => {
      setManualLoading(true);
      const { data, error } = await listManualTopUps(countryCode);
      if (error) setError(error);
      else setManualTopUps(data ?? []);
      setManualLoading(false);
    });
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!selectedCountry) return;
    reloadManualTopUps(selectedCountry);
  }, [selectedCountry]);

  const amountsByCountry = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const row of schedule) {
      map[row.country_code] ??= {};
      map[row.country_code][row.slot_time] = row.amount;
    }
    return map;
  }, [schedule]);

  const allAmounts = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const c of countries) {
      const dirtyNumeric = Object.fromEntries(
        Object.entries(dirty[c.country_code] ?? {}).map(([slot, v]) => [slot, toNumericAmount(v)])
      );
      map[c.country_code] = { ...amountsByCountry[c.country_code], ...dirtyNumeric };
    }
    return map;
  }, [countries, amountsByCountry, dirty]);

  function setSlotAmount(countryCode: string, slotTime: string, rawValue: string) {
    setDirty((prev) => ({
      ...prev,
      [countryCode]: { ...prev[countryCode], [slotTime]: rawValue },
    }));
  }

  function discard(countryCode: string) {
    setDirty((prev) => {
      const next = { ...prev };
      delete next[countryCode];
      return next;
    });
  }

  function save(countryCode: string) {
    const changes = Object.entries(dirty[countryCode] ?? {}).map(([slotTime, rawValue]) => ({
      slotTime,
      amount: toNumericAmount(rawValue),
    }));
    if (changes.length === 0) return;
    startTransition(async () => {
      const { error } = await updateScheduleSlots(countryCode, changes);
      if (error) {
        setError(error);
      } else {
        discard(countryCode);
        setError(null);
        reload();
      }
    });
  }

  function toggleEnabled(country: CountryConfig) {
    startTransition(async () => {
      const { error } = await updateCountrySettings(country.country_code, {
        enabled: !country.enabled,
      });
      if (error) setError(error);
      else reload();
    });
  }

  function changeResetTime(country: CountryConfig, resetTime: string) {
    startTransition(async () => {
      const { error } = await updateCountrySettings(country.country_code, { resetTime });
      if (error) setError(error);
      else reload();
    });
  }

  const country = countries.find((c) => c.country_code === selectedCountry);

  return (
    <>
      <PageHeader
        icon={ppcTopUp.icon}
        title={ppcTopUp.name}
        description={ppcTopUp.description}
      />

      <div className="space-y-6 px-6 pb-6 md:px-8 md:pb-8">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!isLoading && countries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="marketplace-select" className="text-sm font-medium text-muted-foreground">
              Marketplace
            </label>
            <select
              id="marketplace-select"
              value={selectedCountry ?? ""}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-48 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {countries.map((c) => (
                <option key={c.country_code} value={c.country_code}>
                  {c.country_code}
                </option>
              ))}
            </select>
            {country && (
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Switch
                  checked={country.enabled}
                  onCheckedChange={() => toggleEnabled(country)}
                  disabled={isPending}
                />
                {country.enabled ? "Enabled" : "Disabled"}
              </label>
            )}
          </div>
        )}

        <div>
          {isLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-16" />
                <Skeleton className="mt-1 h-3.5 w-48" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Array.from({ length: 144 }).map((_, j) => (
                    <Skeleton key={j} className="h-6 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            (() => {
              if (!country) return null;

              const dirtyNumeric = Object.fromEntries(
                Object.entries(dirty[country.country_code] ?? {}).map(([slot, v]) => [slot, toNumericAmount(v)])
              );
              const amounts = {
                ...amountsByCountry[country.country_code],
                ...dirtyNumeric,
              };
              const rows = [...computeRunningTotals(amounts, country.reset_time)].sort((a, b) =>
                a.slot.localeCompare(b.slot)
              );
              const dirtyCount = Object.keys(dirty[country.country_code] ?? {}).length;
              const maxCap = Object.values(amounts).reduce((sum, v) => sum + (v || 0), 0);

              return (
                <div key={country.country_code} className="space-y-6">
                <LiveProjectionCard
                  country={country}
                  amounts={amounts}
                  topups={manualTopUps}
                  isLoading={manualLoading}
                  onChanged={() => reloadManualTopUps(country.country_code)}
                />

                <Card>
                    <CardHeader className="grid-cols-1! sm:grid-cols-[1fr_auto]!">
                      <CardTitle>{country.country_code}</CardTitle>
                      <CardDescription>
                        Amazon Sponsored Products daily budget cap
                      </CardDescription>
                      <CardAction className="col-start-1! row-start-3! row-span-1! justify-self-stretch! flex flex-wrap items-center gap-2 sm:col-start-2! sm:row-start-1! sm:row-span-2! sm:justify-self-end!">
                        <button
                          onClick={() => setShowAiImport(true)}
                          disabled={isPending}
                          className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background"
                        >
                          <Sparkles className="size-3.5" />
                          Upload Excel
                        </button>
                        <select
                          value={country.reset_time}
                          disabled={isPending}
                          onChange={(e) => changeResetTime(country, e.target.value)}
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                          title="Amazon reset time"
                        >
                          {CANONICAL_SLOTS.map((slot) => (
                            <option key={slot} value={slot}>
                              Reset {slot}
                            </option>
                          ))}
                        </select>
                      </CardAction>
                    </CardHeader>

                    <CardContent>
                      <div className="max-h-140 overflow-x-auto overflow-y-auto rounded-md border border-border">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                            <tr className="border-b border-border">
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                Slot
                              </th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                Amount ($)
                              </th>
                              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                                Running total
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(({ slot, runningTotal }, idx) => {
                              const rawDirty = dirty[country.country_code]?.[slot];
                              const isDirty = rawDirty !== undefined;
                              const displayValue = rawDirty ?? String(amounts[slot] ?? 0);
                              return (
                                <tr key={slot} className="border-b border-border last:border-0">
                                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                                    {slot}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      ref={(el) => {
                                        inputRefs.current[slot] = el;
                                      }}
                                      value={displayValue}
                                      onChange={(e) =>
                                        setSlotAmount(
                                          country.country_code,
                                          slot,
                                          e.target.value
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                                        e.preventDefault();
                                        const nextSlot =
                                          rows[e.key === "ArrowDown" ? idx + 1 : idx - 1]?.slot;
                                        const nextInput = nextSlot ? inputRefs.current[nextSlot] : null;
                                        if (nextInput) {
                                          nextInput.focus();
                                          nextInput.select();
                                        }
                                      }}
                                      className={`w-24 rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                                        isDirty ? "border-primary" : "border-input"
                                      }`}
                                    />
                                  </td>
                                  <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                                    ${runningTotal.toFixed(2)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>

                    <CardFooter className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          Max daily cap: <strong className="text-foreground">${maxCap.toFixed(2)}</strong>
                        </span>
                        {dirtyCount > 0 && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                            {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => discard(country.country_code)}
                          disabled={isPending || dirtyCount === 0}
                          className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Discard
                        </button>
                        <button
                          onClick={() => save(country.country_code)}
                          disabled={isPending || dirtyCount === 0}
                          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isPending ? "Saving…" : "Save Changes"}
                        </button>
                      </div>
                    </CardFooter>
                </Card>

                {ACOS_METRICS.map((metric) => (
                  <AcosScheduleCard
                    key={`${country.country_code}:${metric.key}`}
                    countryCode={country.country_code}
                    metric={metric.key}
                    label={metric.label}
                  />
                ))}

                <AiImportDialog
                  open={showAiImport}
                  onOpenChange={setShowAiImport}
                  countries={countries}
                  currentAmountsByCountry={allAmounts}
                  onApplied={(countryCodes) => {
                    countryCodes.forEach((cc) => discard(cc));
                    reload();
                  }}
                />
                </div>
              );
            })()
          )}
        </div>
      </div>
    </>
  );
}

function LiveProjectionCard({
  country,
  amounts,
  topups,
  isLoading,
  onChanged,
}: {
  country: CountryConfig;
  amounts: Record<string, number>;
  topups: ManualTopUp[];
  isLoading: boolean;
  onChanged: () => void;
}) {
  const [includeManualTopUps, setIncludeManualTopUps] = useState(true);
  const [dayOffset, setDayOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState(nextUpcomingSlot);
  const [amount, setAmount] = useState("");
  const [isPending, startTransition] = useTransition();

  const relevantTopUps = useMemo(
    () => topups.filter((t) => t.country_code === country.country_code && t.status !== "cancelled"),
    [topups, country.country_code]
  );

  const rows = [...computeProjectedRows(
    amounts,
    country.reset_time,
    includeManualTopUps ? relevantTopUps : [],
    dayOffset
  )].sort((a, b) => a.slot.localeCompare(b.slot));

  const { pmDate, amDate } = resolveCycleDates(country.reset_time, dayOffset);

  const viewedDate = shiftDateSgt(todaySgt(), dayOffset);

  const availableRows = useMemo(
    () =>
      CANONICAL_SLOTS.map((slot) => ({ slot, date: viewedDate })).filter(
        (r) => r.date > todaySgt() || (r.date === todaySgt() && r.slot > currentSlotSgt())
      ),
    [viewedDate]
  );

  const dayTopUps = useMemo(
    () => topups.filter((t) => t.target_date === viewedDate),
    [topups, viewedDate]
  );

  const [prevDayOffset, setPrevDayOffset] = useState(dayOffset);
  if (prevDayOffset !== dayOffset) {
    const movedBackward = dayOffset < prevDayOffset;
    setPrevDayOffset(dayOffset);
    const target = movedBackward ? availableRows[availableRows.length - 1] : availableRows[0];
    if (target) setSlot(target.slot);
  }

  const selectedIndex = Math.max(
    availableRows.findIndex((r) => r.slot === slot),
    0
  );

  function handleCreate() {
    const target = availableRows.find((r) => r.slot === slot)?.date;
    if (!target) {
      setError("Pick a valid slot for this day.");
      return;
    }
    const parsedAmount = Number(amount);
    startTransition(async () => {
      const { error } = await createManualTopUp(country.country_code, target, slot, parsedAmount);
      if (error) {
        setError(error);
      } else {
        setAmount("");
        setError(null);
        onChanged();
      }
    });
  }

  function handleCancel(id: string) {
    startTransition(async () => {
      const { error } = await cancelManualTopUp(id);
      if (error) setError(error);
      else onChanged();
    });
  }

  return (
    <Card>
      <CardHeader className="grid-cols-1! sm:grid-cols-[1fr_auto]!">
        <CardTitle>Live Projection</CardTitle>
        <CardDescription>
          {pmDate} → {amDate}
        </CardDescription>
        <CardAction className="col-start-1! row-start-3! row-span-1! justify-self-stretch! flex flex-wrap items-center gap-3 sm:col-start-2! sm:row-start-1! sm:row-span-2! sm:justify-self-end!">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Checkbox
              checked={includeManualTopUps}
              onCheckedChange={setIncludeManualTopUps}
            />
            Include manual top-ups
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDayOffset((d) => Math.max(d - 1, -5))}
              disabled={dayOffset <= -5}
              className="rounded-md px-2 py-1 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              title="Previous day"
            >
              ←
            </button>
            <button
              onClick={() => dayOffset !== 0 && setDayOffset(0)}
              disabled={dayOffset === 0}
              title={dayOffset === 0 ? undefined : "Jump to today"}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:cursor-default ${
                dayOffset === 0
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {relativeDayLabel(dayOffset)}
            </button>
            <button
              onClick={() => setDayOffset((d) => Math.min(d + 1, 5))}
              disabled={dayOffset >= 5}
              className="rounded-md px-2 py-1 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              title="Next day"
            >
              →
            </button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
          {dayOffset === 0 && (
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-0 shrink-0 border-[1.5px] border-dashed"
                style={{ borderColor: "var(--color-destructive)" }}
              />
              Now
            </span>
          )}
          {availableRows.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-0 shrink-0 border-[1.5px] border-dashed"
                style={{ borderColor: "#3b82f6" }}
              />
              Selected
            </span>
          )}
        </div>
        <ChartContainer config={chartConfig} className="h-56 w-full">
          <LineChart
            data={rows}
            className="cursor-pointer"
            onClick={(state) => {
              const clicked = state?.activeLabel;
              // Only move to selectable (future) slots — mirrors the top-up form,
              // which cannot target past slots. Past clicks are ignored.
              if (typeof clicked === "string" && availableRows.some((r) => r.slot === clicked)) {
                setSlot(clicked);
              }
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="slot" tickLine={false} axisLine={false} interval={17} />
            <YAxis tickLine={false} axisLine={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {dayOffset === 0 && (
              <ReferenceLine
                x={currentSlotSgt()}
                stroke="var(--color-destructive)"
                strokeDasharray="4 4"
              />
            )}
            {availableRows.length > 0 && (
              <ReferenceLine
                x={slot}
                stroke="#3b82f6"
                strokeDasharray="2 3"
              />
            )}
            <Line
              dataKey="runningTotal"
              type="monotone"
              stroke="var(--color-runningTotal)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>

      <CardContent className="space-y-4">
        <h3 className="text-sm font-medium">Manual Top-Ups</h3>
        <p className="text-xs text-muted-foreground">
          One-time bump on top of the recurring schedule below — applies to the day shown above.
        </p>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {availableRows.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            This day is in the past — swipe to today or later to add a top-up.
          </div>
        ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Slot</label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (selectedIndex > 0) {
                    setSlot(availableRows[selectedIndex - 1].slot);
                  } else if (dayOffset > 0) {
                    setDayOffset((d) => d - 1);
                  }
                }}
                disabled={selectedIndex <= 0 && dayOffset <= 0}
                className="rounded-md px-2 py-1 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                title="Previous slot"
              >
                ←
              </button>
              <span className="min-w-28 rounded-md border border-input bg-background px-2 py-1.5 text-center text-sm">
                {availableRows[selectedIndex]?.slot} · {availableRows[selectedIndex]?.date}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (selectedIndex < availableRows.length - 1) {
                    setSlot(availableRows[selectedIndex + 1].slot);
                  } else {
                    setDayOffset((d) => Math.min(d + 1, 5));
                  }
                }}
                disabled={selectedIndex >= availableRows.length - 1 && dayOffset >= 5}
                className="rounded-md px-2 py-1 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                title="Next slot"
              >
                →
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Amount ($)
            </label>
            <input
              type="number"
              min={0.01}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={isPending || !amount}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Top-Up
          </button>
        </div>
        )}

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Slot</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Amount</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Created by
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2" colSpan={6}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))
              ) : dayTopUps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No manual top-ups yet
                  </td>
                </tr>
              ) : (
                dayTopUps.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{t.target_date}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {t.slot_time}
                    </td>
                    <td className="px-3 py-2">${Number(t.amount).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(
                          t.status
                        )}`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{t.created_by_username}</td>
                    <td className="px-3 py-2 text-right">
                      {t.status === "pending" && isManualTopUpFuture(t) && (
                        <button
                          onClick={() => handleCancel(t.id)}
                          disabled={isPending}
                          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * One full slot x band grid for a single ACOS metric. Two of these render per
 * marketplace (Today and 14-Day) and each saves independently — the same
 * dirty-string / sticky-header / arrow-nav shape as the daily-cap grid above.
 */
function AcosScheduleCard({
  countryCode,
  metric,
  label,
}: {
  countryCode: string;
  metric: AcosMetric;
  label: string;
}) {
  const [rows, setRows] = useState<AcosScheduleRow[]>([]);
  const [bandSettings, setBandSettings] = useState<AcosBandSettings[]>([]);
  const [dirty, setDirty] = useState<Record<string, Record<string, string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [settingsBand, setSettingsBand] = useState<AcosBandKey | null>(null);
  const [bandForm, setBandForm] = useState({ maxDailyTopupTotal: "0", maxCampaignBudget: "0" });
  const [bandError, setBandError] = useState<string | null>(null);
  const [bandPending, startBandTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const { data, error } = await getAcosTopupConfig(countryCode);
      if (error) setError(error);
      else if (data) {
        setRows(data.schedule.filter((r) => r.acos_metric === metric));
        setBandSettings(data.bandSettings.filter((b) => b.acos_metric === metric));
        setError(null);
      }
      setIsLoading(false);
    });
  }

  function openBandSettings(bandKey: AcosBandKey) {
    const current = bandSettings.find((b) => b.band_key === bandKey);
    setBandForm({
      maxDailyTopupTotal: String(current?.max_daily_topup_total ?? 0),
      maxCampaignBudget: String(current?.max_campaign_budget ?? 0),
    });
    setBandError(null);
    setSettingsBand(bandKey);
  }

  function saveBandSettings() {
    if (!settingsBand) return;
    startBandTransition(async () => {
      const { error } = await updateAcosBandSettings(countryCode, metric, settingsBand, {
        maxDailyTopupTotal: toNumericAmount(bandForm.maxDailyTopupTotal),
        maxCampaignBudget: toNumericAmount(bandForm.maxCampaignBudget),
      });
      if (error) {
        setBandError(error);
        return;
      }
      setSettingsBand(null);
      reload();
    });
  }

  // Unsaved edits are discarded by remounting (see the `key` at the render site),
  // so this only has to fetch.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode, metric]);

  const amounts = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      (map[row.slot_time] ??= {})[row.band_key] = Number(row.topup_amount);
    }
    return map;
  }, [rows]);

  function setCell(slot: string, bandKey: AcosBandKey, raw: string) {
    setDirty((prev) => ({ ...prev, [slot]: { ...prev[slot], [bandKey]: raw } }));
  }

  function discard() {
    setDirty({});
  }

  function save() {
    const changes = Object.entries(dirty).flatMap(([slotTime, cells]) =>
      Object.entries(cells).map(([bandKey, raw]) => ({
        slotTime,
        bandKey: bandKey as AcosBandKey,
        topupAmount: toNumericAmount(raw),
      }))
    );
    if (changes.length === 0) return;
    startTransition(async () => {
      const { error } = await updateAcosTopupSchedule(countryCode, metric, changes);
      if (error) {
        setError(error);
        return;
      }
      discard();
      setError(null);
      reload();
    });
  }

  const dirtyCount = Object.values(dirty).reduce((sum, cells) => sum + Object.keys(cells).length, 0);
  const dailyTotal = CANONICAL_SLOTS.reduce(
    (sum, slot) =>
      sum +
      ACOS_BANDS.reduce((bandSum, band) => {
        const raw = dirty[slot]?.[band.key];
        return bandSum + (raw !== undefined ? toNumericAmount(raw) : amounts[slot]?.[band.key] ?? 0);
      }, 0),
    0
  );
  const columnTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const band of ACOS_BANDS) {
      totals[band.key] = CANONICAL_SLOTS.reduce((sum, slot) => {
        const raw = dirty[slot]?.[band.key];
        return sum + (raw !== undefined ? toNumericAmount(raw) : amounts[slot]?.[band.key] ?? 0);
      }, 0);
    }
    return totals;
  }, [amounts, dirty]);
  const chartData = useMemo(
    () =>
      CANONICAL_SLOTS.map((slot) => {
        const point: Record<string, string | number> = { slot };
        for (const band of ACOS_BANDS) {
          const raw = dirty[slot]?.[band.key];
          point[band.key] = raw !== undefined ? toNumericAmount(raw) : amounts[slot]?.[band.key] ?? 0;
        }
        return point;
      }),
    [amounts, dirty]
  );

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>
          Top-up applied to an out-of-budget campaign whose {label.toLowerCase()} falls in each band,
          at each 10-minute slot.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : (
          <>
          <ChartContainer config={acosBandChartConfig} className="mb-4 h-56 w-full">
            <LineChart data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="slot" tickLine={false} axisLine={false} interval={11} />
              <YAxis tickLine={false} axisLine={false} width={36} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <ReferenceLine x={currentSlotSgt()} stroke="var(--color-destructive)" strokeDasharray="4 4" />
              {ACOS_BANDS.map((band) => (
                <Line
                  key={band.key}
                  dataKey={band.key}
                  type="monotone"
                  stroke={`var(--color-${band.key})`}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
          <div className="max-h-140 overflow-x-auto overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Slot</th>
                  {ACOS_BANDS.map((band) => (
                    <th key={band.key} className="px-3 py-2 text-left font-medium text-muted-foreground">
                      <div className="flex items-center gap-1">
                        {band.label}
                        <button
                          onClick={() => openBandSettings(band.key)}
                          title={`Edit ${band.label} caps`}
                          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-1 text-xs font-normal text-muted-foreground">
                        Total: <span className="text-foreground">${columnTotals[band.key].toFixed(2)}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CANONICAL_SLOTS.map((slot, idx) => (
                  <tr key={slot} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{slot}</td>
                    {ACOS_BANDS.map((band) => {
                      const rawDirty = dirty[slot]?.[band.key];
                      const isDirty = rawDirty !== undefined;
                      const displayValue = rawDirty ?? String(amounts[slot]?.[band.key] ?? 0);
                      const refKey = `${slot}:${band.key}`;
                      return (
                        <td key={band.key} className="px-3 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            ref={(el) => {
                              inputRefs.current[refKey] = el;
                            }}
                            value={displayValue}
                            onChange={(e) => setCell(slot, band.key, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                              e.preventDefault();
                              const nextSlot = CANONICAL_SLOTS[e.key === "ArrowDown" ? idx + 1 : idx - 1];
                              const nextInput = nextSlot
                                ? inputRefs.current[`${nextSlot}:${band.key}`]
                                : null;
                              if (nextInput) {
                                nextInput.focus();
                                nextInput.select();
                              }
                            }}
                            className={`w-24 rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                              isDirty ? "border-primary" : "border-input"
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Sum of all slots &amp; bands:{" "}
            <strong className="text-foreground">${dailyTotal.toFixed(2)}</strong>
          </span>
          {dirtyCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
              {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={discard}
            disabled={isPending || dirtyCount === 0}
            className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Discard
          </button>
          <button
            onClick={save}
            disabled={isPending || dirtyCount === 0}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </CardFooter>
    </Card>

    <Dialog open={settingsBand !== null} onOpenChange={(open) => !open && setSettingsBand(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit {settingsBand ? ACOS_BANDS.find((b) => b.key === settingsBand)?.label : ""} caps ·{" "}
            {label}
          </DialogTitle>
          <DialogDescription>
            Caps apply only to campaigns that are out of budget and match this ACOS band.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {bandError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {bandError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Max budget ($)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={bandForm.maxDailyTopupTotal}
              onChange={(e) =>
                setBandForm((prev) => ({ ...prev, maxDailyTopupTotal: e.target.value }))
              }
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Max individual campaign budget ($)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={bandForm.maxCampaignBudget}
              onChange={(e) =>
                setBandForm((prev) => ({ ...prev, maxCampaignBudget: e.target.value }))
              }
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent">
            Cancel
          </DialogClose>
          <button
            onClick={saveBandSettings}
            disabled={bandPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bandPending ? "Saving…" : "Save"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function AiImportDialog({
  open,
  onOpenChange,
  countries,
  currentAmountsByCountry,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countries: CountryConfig[];
  currentAmountsByCountry: Record<string, Record<string, number>>;
  onApplied: (countryCodes: string[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [proposedCountries, setProposedCountries] = useState<
    { countryCode: string; changes: { slotTime: string; amount: number }[] }[] | null
  >(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [detected, setDetected] = useState<DetectedSheet[] | null>(null);
  const [showDetected, setShowDetected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setIsDragging(false);
      setProposedCountries(null);
      setWarnings([]);
      setDetected(null);
      setShowDetected(false);
      setError(null);
    }
    onOpenChange(next);
  }

  function handleFile(file: File) {
    setError(null);
    setWarnings([]);
    setProposedCountries(null);
    setDetected(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const { data, error } = await analyzeScheduleImport(formData);
      if (error) setError(error);
      else if (data) {
        setProposedCountries(data.countries);
        setWarnings(data.warnings);
        setDetected(data.detected);
        setShowDetected(true);
      }
    });
  }

  function handleApply() {
    if (!proposedCountries || proposedCountries.length === 0) return;
    startTransition(async () => {
      for (const { countryCode, changes } of proposedCountries) {
        if (changes.length === 0) continue;
        const { error } = await updateScheduleSlots(countryCode, changes);
        if (error) {
          setError(`${countryCode}: ${error}`);
          return;
        }
      }
      onOpenChange(false);
      onApplied(proposedCountries.map((c) => c.countryCode));
    });
  }

  const diffsByCountry = (proposedCountries ?? [])
    .map(({ countryCode, changes }) => {
      const current = currentAmountsByCountry[countryCode] ?? {};
      const rows = changes
        .map((c) => ({
          slotTime: c.slotTime,
          current: current[c.slotTime] ?? 0,
          proposed: c.amount,
          delta: c.amount - (current[c.slotTime] ?? 0),
        }))
        .filter((r) => Math.abs(r.delta) > 0.001);
      return { countryCode, rows, netChange: rows.reduce((sum, r) => sum + r.delta, 0) };
    })
    .filter((c) => c.rows.length > 0);

  const totalDiffRows = diffsByCountry.reduce((sum, c) => sum + c.rows.length, 0);

  return (
    <>
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Use AI — Import Schedule</SheetTitle>
          <SheetDescription>
            Drop an Excel sheet and Claude will map it onto the 10-minute slot grid for every marketplace it recognizes ({countries.map((c) => c.country_code).join(", ")}).
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
          {!proposedCountries && (
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
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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

          {proposedCountries && (
            <>
              {detected && detected.length > 0 && (
                <button
                  onClick={() => setShowDetected(true)}
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  View what was detected in the file
                </button>
              )}
              {diffsByCountry.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This file didn&apos;t produce any changes to the current schedule.
                </p>
              ) : (
                diffsByCountry.map(({ countryCode, rows, netChange }) => (
                  <div key={countryCode} className="space-y-1.5">
                    <h3 className="text-sm font-medium">{countryCode}</h3>
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Slot</th>
                            <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Current</th>
                            <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Proposed</th>
                            <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.slotTime} className="border-b border-border last:border-0">
                              <td className="px-2 py-1 font-mono text-muted-foreground">{r.slotTime}</td>
                              <td className="px-2 py-1 text-right">${r.current.toFixed(2)}</td>
                              <td className="px-2 py-1 text-right font-medium">${r.proposed.toFixed(2)}</td>
                              <td className={`px-2 py-1 text-right ${r.delta >= 0 ? "text-primary" : "text-destructive"}`}>
                                {r.delta >= 0 ? "+" : ""}
                                {r.delta.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Net change:{" "}
                      <strong className="text-foreground">
                        {netChange >= 0 ? "+" : ""}
                        {netChange.toFixed(2)}
                      </strong>
                    </p>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        <SheetFooter className="flex-row flex-wrap justify-end gap-2">
          {proposedCountries && (
            <button
              onClick={() => {
                setProposedCountries(null);
                setWarnings([]);
                setError(null);
              }}
              disabled={isPending}
              className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start Over
            </button>
          )}
          <button
            onClick={handleApply}
            disabled={!proposedCountries || totalDiffRows === 0 || isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Applying…" : "Apply Changes"}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    {showDetected && detected && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-lg">
          <h2 className="mb-1 text-lg font-semibold">What was detected in the file</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Every amount is parsed straight from the cells below and snapped to the nearest 10-minute slot —
            Claude is only used to locate columns when a sheet can&apos;t be read directly, never to retype values.
          </p>
          <div className="max-h-96 overflow-x-auto overflow-y-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Sheet</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Header row</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Time column</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Amount column</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Marketplace column</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Inferred marketplace</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Detected by</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Rows parsed</th>
                </tr>
              </thead>
              <tbody>
                {detected.map((d, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 font-medium">{d.sheetName}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{d.headerRowIndex + 1}</td>
                    <td className="px-2 py-1.5">{d.timeColumnLabel}</td>
                    <td className="px-2 py-1.5">{d.amountColumnLabel}</td>
                    <td className="px-2 py-1.5">{d.countryColumnLabel ?? "—"}</td>
                    <td className="px-2 py-1.5">{d.inferredCountryCode ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          d.source === "heuristic"
                            ? "bg-primary/10 text-primary"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        {d.source === "heuristic" ? "column headers" : "Claude"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right">{d.rowsParsed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setShowDetected(false)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Looks right
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
