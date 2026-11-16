import "server-only";

import { addDays, addMonths, todayIn } from "@/lib/domain/dates";
import type { Rates, RatesSnapshot } from "@/lib/domain/fixed-income";
import { fetchSeries, type SeriesName } from "@/lib/integrations/bcb";
import { createAdminClient } from "@/lib/supabase/admin";

// Rates change once per business day; asking the Banco Central more than once an hour is waste.
let lastRefresh = 0;
const REFRESH_EVERY_MS = 60 * 60 * 1000;
const HISTORY_START = "2018-01-01";

async function latest(series: SeriesName): Promise<string | null> {
  const { data } = await createAdminClient().from("market_rates").select("on_date").eq("series", series).order("on_date", { ascending: false }).limit(1).maybeSingle();
  return (data?.on_date as string | undefined) ?? null;
}

async function earliest(series: SeriesName): Promise<string | null> {
  const { data } = await createAdminClient().from("market_rates").select("on_date").eq("series", series).order("on_date", { ascending: true }).limit(1).maybeSingle();
  return (data?.on_date as string | undefined) ?? null;
}

async function store(series: SeriesName, rows: Array<{ date: string; value: number }>) {
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await createAdminClient()
      .from("market_rates")
      .upsert(rows.slice(i, i + 1000).map((r) => ({ series, on_date: r.date, value: r.value })), { onConflict: "series,on_date" });
    if (error) throw new Error(`Falha ao guardar taxas: ${error.message}`);
  }
}

/** Fills a series from `from` to today in chunks the API accepts (daily series: < 10 years). */
async function fill(series: SeriesName, from: string, to: string) {
  let start = from;
  while (start <= to) {
    const limit = addMonths(start, 12 * 9);
    const end = limit < to ? limit : to;
    await store(series, await fetchSeries(series, start, end));
    start = addDays(end, 1);
  }
}

/**
 * Brings the rates the Prumo does not have yet: history back to `since` the first time, then only
 * the new days. Failures keep what is stored; values then use the last known rate.
 */
export async function refreshRates(since: string = HISTORY_START, force = false) {
  if (!force && Date.now() - lastRefresh < REFRESH_EVERY_MS) return;
  lastRefresh = Date.now();
  const today = todayIn();
  for (const series of ["cdi", "selic", "ipca", "ipca12"] as const) {
    try {
      const start = series === "ipca12" ? addMonths(today, -24) : since;
      const first = await earliest(series);
      // History missing before what is stored (or nothing stored yet).
      if (!first || first > start) await fill(series, start, first ? addDays(first, -1) : today);
      // New days since the last stored one.
      const last = await latest(series);
      if (last && last < today) await fill(series, addDays(last, 1), today);
    } catch (error) {
      console.error("rates refresh failed", series, error instanceof Error ? error.message : error);
    }
  }
}

/** Every rate needed to value positions started on or after `since`. */
export async function loadRates(since: string): Promise<Rates> {
  await refreshRates(since < HISTORY_START ? since : HISTORY_START);
  const admin = createAdminClient();
  const read = async (series: SeriesName, from: string) => {
    const out: Array<{ on_date: string; value: number }> = [];
    for (let page = 0; page < 20; page += 1) {
      const { data } = await admin.from("market_rates").select("on_date, value").eq("series", series).gte("on_date", from).order("on_date").range(page * 1000, page * 1000 + 999);
      out.push(...((data ?? []) as Array<{ on_date: string; value: number }>));
      if (!data || data.length < 1000) break;
    }
    return out.map((r) => ({ date: r.on_date, value: Number(r.value) }));
  };
  const [cdi, selic, ipca, ipca12] = await Promise.all([read("cdi", since), read("selic", since), read("ipca", `${since.slice(0, 7)}-01`), read("ipca12", addMonths(todayIn(), -24))]);
  return {
    cdi,
    selic,
    ipca: new Map(ipca.map((r) => [r.date.slice(0, 7), r.value])),
    ipca12: ipca12.at(-1)?.value ?? null,
  };
}

/** The latest rates, small enough to send to the new-investment form. */
export async function ratesSnapshot(): Promise<RatesSnapshot> {
  const rates = await loadRates(addDays(todayIn(), -40));
  const cdiDaily = rates.cdi.at(-1)?.value ?? null;
  return {
    cdiDaily,
    selicDaily: rates.selic.at(-1)?.value ?? null,
    ipca12: rates.ipca12,
    cdiAnnual: cdiDaily === null ? null : Math.round((Math.pow(1 + cdiDaily / 100, 252) - 1) * 10000) / 100,
  };
}
