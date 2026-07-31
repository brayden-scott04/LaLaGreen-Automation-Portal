import { CANONICAL_SLOTS } from "@/lib/ppc-daily-cap-constants";

/** Fixed ACOS bands staff can assign a top-up dollar amount to. Ranges are fixed — only the amount is editable. */
export const ACOS_BANDS = [
  { key: "0-10", label: "< 10%", min: 0, max: 10 },
  { key: "10-20", label: "10% – 20%", min: 10, max: 20 },
  { key: "20-30", label: "20% – 30%", min: 20, max: 30 },
  { key: "30-plus", label: "30%+", min: 30, max: null },
] as const;

export type AcosBandKey = (typeof ACOS_BANDS)[number]["key"];

export const ACOS_BAND_KEYS: readonly AcosBandKey[] = ACOS_BANDS.map((b) => b.key);

/**
 * The two ACOS figures a campaign is measured against. Each gets its own full
 * slot × band schedule, and both run every tick — an out-of-budget campaign can
 * be topped up by the "today" schedule and the "14d" schedule independently.
 */
export const ACOS_METRICS = [
  { key: "today", label: "Today's ACOS" },
  { key: "14d", label: "14-Day ACOS" },
] as const;

export type AcosMetric = (typeof ACOS_METRICS)[number]["key"];

export const ACOS_METRIC_KEYS: readonly AcosMetric[] = ACOS_METRICS.map((m) => m.key);

/** Rows one (country, metric) schedule must have: every canonical slot × every band. */
export const EXPECTED_SCHEDULE_ROWS = CANONICAL_SLOTS.length * ACOS_BAND_KEYS.length;

/** Rows one country's band-cap settings must have: one per band, per metric. */
export const EXPECTED_BAND_SETTINGS_ROWS = ACOS_BAND_KEYS.length * ACOS_METRIC_KEYS.length;

export const MAX_BAND_TOPUP_AMOUNT = 1000;
/** Ceiling on one band's "max top-up per day" — total $ across all campaigns in that band, per marketplace. */
export const MAX_DAILY_TOPUP_TOTAL = 100000;
/** Ceiling on one band's "max individual campaign budget" — the highest daily budget one campaign in that band may be raised to. */
export const MAX_CAMPAIGN_BUDGET = 10000;
