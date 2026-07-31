"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSession } from "@/lib/session";
import { assertCountryExists } from "@/lib/actions/ppc-daily-cap";
import { CANONICAL_SLOTS } from "@/lib/ppc-daily-cap-constants";
import {
  ACOS_BAND_KEYS,
  ACOS_METRIC_KEYS,
  EXPECTED_BAND_SETTINGS_ROWS,
  EXPECTED_SCHEDULE_ROWS,
  MAX_BAND_TOPUP_AMOUNT,
  MAX_CAMPAIGN_BUDGET,
  MAX_DAILY_TOPUP_TOTAL,
  type AcosBandKey,
  type AcosMetric,
} from "@/lib/ppc-acos-topup-constants";

const BAND_SETTINGS_COLUMNS =
  "country_code, acos_metric, band_key, max_daily_topup_total, max_campaign_budget";
const SCHEDULE_COLUMNS = "country_code, acos_metric, slot_time, band_key, topup_amount";

export interface AcosBandSettings {
  country_code: string;
  acos_metric: AcosMetric;
  band_key: AcosBandKey;
  /** Max $ spent on top-ups across ALL campaigns in this (metric, band), per marketplace, per day. */
  max_daily_topup_total: number;
  /** Highest daily budget any single campaign in this (metric, band) may be raised to. */
  max_campaign_budget: number;
}

export interface AcosScheduleRow {
  country_code: string;
  acos_metric: AcosMetric;
  slot_time: string;
  band_key: AcosBandKey;
  topup_amount: number;
}

async function requireStaff() {
  const session = await getSession();
  if (!session) return { session: null, error: "Unauthorized" as const };
  return { session, error: null };
}

/**
 * Config for one marketplace. Scoped to a single country on purpose: a full
 * schedule is 144 slots x 4 bands x 2 metrics = 1152 rows, which exceeds
 * PostgREST's default 1000-row cap. Each metric is fetched separately (576 rows
 * each) and the row count is asserted, so a truncated grid can never be shown
 * as if it were complete — staff editing a partial grid would silently wipe the
 * missing slots' amounts.
 */
export async function getAcosTopupConfig(countryCode: string): Promise<{
  data: {
    bandSettings: AcosBandSettings[];
    schedule: AcosScheduleRow[];
  } | null;
  error: string | null;
}> {
  const { error } = await requireStaff();
  if (error) return { data: null, error };

  const client = await createClient();

  const [bandSettingsResult, ...scheduleResults] = await Promise.all([
    client
      .from("ppc_acos_topup_band_settings")
      .select(BAND_SETTINGS_COLUMNS)
      .eq("country_code", countryCode)
      .order("acos_metric", { ascending: true })
      .order("band_key", { ascending: true }),
    ...ACOS_METRIC_KEYS.map((metric) =>
      client
        .from("ppc_acos_topup_schedule")
        .select(SCHEDULE_COLUMNS)
        .eq("country_code", countryCode)
        .eq("acos_metric", metric)
        .order("slot_time", { ascending: true })
    ),
  ]);

  if (bandSettingsResult.error) return { data: null, error: bandSettingsResult.error.message };
  const bandSettings = bandSettingsResult.data ?? [];
  if (bandSettings.length !== EXPECTED_BAND_SETTINGS_ROWS) {
    return {
      data: null,
      error:
        `Incomplete band settings for ${countryCode}: got ${bandSettings.length} rows, ` +
        `expected ${EXPECTED_BAND_SETTINGS_ROWS}. ` +
        `The ppc_acos_topup_band_settings table needs seeding for this marketplace.`,
    };
  }

  const schedule: AcosScheduleRow[] = [];
  for (const [i, result] of scheduleResults.entries()) {
    if (result.error) return { data: null, error: result.error.message };
    const rows = result.data ?? [];
    if (rows.length !== EXPECTED_SCHEDULE_ROWS) {
      return {
        data: null,
        error:
          `Incomplete ${ACOS_METRIC_KEYS[i]} schedule for ${countryCode}: ` +
          `got ${rows.length} rows, expected ${EXPECTED_SCHEDULE_ROWS}. ` +
          `The ppc_acos_topup_schedule table needs seeding for this marketplace.`,
      };
    }
    schedule.push(...rows);
  }

  return { data: { bandSettings, schedule }, error: null };
}

export async function updateAcosBandSettings(
  countryCode: string,
  metric: AcosMetric,
  bandKey: AcosBandKey,
  updates: { maxDailyTopupTotal?: number; maxCampaignBudget?: number }
): Promise<{ data: AcosBandSettings | null; error: string | null }> {
  const { error } = await requireStaff();
  if (error) return { data: null, error };

  if (!ACOS_METRIC_KEYS.includes(metric)) {
    return { data: null, error: `Invalid ACOS metric: ${metric}` };
  }
  if (!ACOS_BAND_KEYS.includes(bandKey)) {
    return { data: null, error: `Invalid ACOS band: ${bandKey}` };
  }
  if (updates.maxDailyTopupTotal === undefined && updates.maxCampaignBudget === undefined) {
    return { data: null, error: "No changes provided" };
  }
  if (
    updates.maxDailyTopupTotal !== undefined &&
    (!Number.isFinite(updates.maxDailyTopupTotal) ||
      updates.maxDailyTopupTotal < 0 ||
      updates.maxDailyTopupTotal > MAX_DAILY_TOPUP_TOTAL)
  ) {
    return { data: null, error: `Invalid max top-up per day: ${updates.maxDailyTopupTotal}` };
  }
  if (
    updates.maxCampaignBudget !== undefined &&
    (!Number.isFinite(updates.maxCampaignBudget) ||
      updates.maxCampaignBudget < 0 ||
      updates.maxCampaignBudget > MAX_CAMPAIGN_BUDGET)
  ) {
    return {
      data: null,
      error: `Invalid max individual campaign budget: ${updates.maxCampaignBudget}`,
    };
  }

  const existsError = await assertCountryExists(countryCode);
  if (existsError) return { data: null, error: existsError };

  const service = createServiceClient();

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.maxDailyTopupTotal !== undefined) {
    dbUpdates.max_daily_topup_total = updates.maxDailyTopupTotal;
  }
  if (updates.maxCampaignBudget !== undefined) {
    dbUpdates.max_campaign_budget = updates.maxCampaignBudget;
  }

  const { data: after, error: updateError } = await service
    .from("ppc_acos_topup_band_settings")
    .update(dbUpdates)
    .eq("country_code", countryCode)
    .eq("acos_metric", metric)
    .eq("band_key", bandKey)
    .select(BAND_SETTINGS_COLUMNS)
    .single();
  if (updateError) return { data: null, error: updateError.message };

  return { data: after, error: null };
}

export async function updateAcosTopupSchedule(
  countryCode: string,
  metric: AcosMetric,
  changes: { slotTime: string; bandKey: AcosBandKey; topupAmount: number }[]
): Promise<{ data: { updated: number } | null; error: string | null }> {
  const { error } = await requireStaff();
  if (error) return { data: null, error };

  if (changes.length === 0) return { data: { updated: 0 }, error: null };

  if (!ACOS_METRIC_KEYS.includes(metric)) {
    return { data: null, error: `Invalid ACOS metric: ${metric}` };
  }

  // All-or-nothing validation: this data directly controls live ad spend,
  // so a batch save must never partially apply.
  for (const change of changes) {
    if (!CANONICAL_SLOTS.includes(change.slotTime)) {
      return { data: null, error: `Invalid slot time: ${change.slotTime}` };
    }
    if (!ACOS_BAND_KEYS.includes(change.bandKey)) {
      return { data: null, error: `Invalid ACOS band: ${change.bandKey}` };
    }
    if (
      !Number.isFinite(change.topupAmount) ||
      change.topupAmount < 0 ||
      change.topupAmount > MAX_BAND_TOPUP_AMOUNT
    ) {
      return {
        data: null,
        error: `Invalid top-up amount for ${change.slotTime} ${change.bandKey}: ${change.topupAmount}`,
      };
    }
  }

  const existsError = await assertCountryExists(countryCode);
  if (existsError) return { data: null, error: existsError };

  const service = createServiceClient();
  const updatedAt = new Date().toISOString();

  // One batched upsert rather than a row-at-a-time loop: filling a whole column
  // is 144 cells and a full grid is 576, which must not become 576 round trips.
  const { error: upsertError } = await service.from("ppc_acos_topup_schedule").upsert(
    changes.map((change) => ({
      country_code: countryCode,
      acos_metric: metric,
      slot_time: change.slotTime,
      band_key: change.bandKey,
      topup_amount: change.topupAmount,
      updated_at: updatedAt,
    })),
    { onConflict: "country_code,acos_metric,slot_time,band_key" }
  );
  if (upsertError) return { data: null, error: upsertError.message };

  return { data: { updated: changes.length }, error: null };
}
