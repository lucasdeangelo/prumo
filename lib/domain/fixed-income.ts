// Values fixed income typed by hand, the way banks accrue it: once per business day.
// % do CDI: (1 + CDI of the day × pct). Selic: (1 + Selic of the day). Prefixado: (1 + rate)^(1/252).
// IPCA +: the month's IPCA spread over its business days, plus the real rate per business day.
// Holidays are the weekdays the Banco Central did not publish a CDI for; after the last published
// day the last known rate is used (the series is published with a day of delay).

import { addDays } from "./dates";
import { costBasis, incomeTaxRate, type Movement } from "./investments";

export type RateIndex = "cdi" | "selic" | "pre" | "ipca";
export type RateTerms = { index: RateIndex; pct: number | null; annual: number | null };
export type DailyRate = { date: string; value: number };

export type Rates = {
  /** Daily % per business day (series 12), ascending. */
  cdi: DailyRate[];
  /** Daily % per business day (series 11), ascending. */
  selic: DailyRate[];
  /** Monthly % keyed by "YYYY-MM" (series 433). */
  ipca: Map<string, number>;
  /** IPCA of the last 12 months, % (series 13522), for projections. */
  ipca12: number | null;
};

/** The terms stored on an investment row ("110" + "CDI", or a fixed annual rate). */
export function termsFromRow(row: { rate: number | null; rate_type: string | null; fixed_annual_rate: number | null }): RateTerms | null {
  const type = row.rate_type?.toUpperCase() ?? null;
  if (type === "CDI" && row.rate !== null) return { index: "cdi", pct: row.rate, annual: null };
  if (type === "SELIC") return { index: "selic", pct: row.rate ?? 100, annual: null };
  if (type === "IPCA" && (row.fixed_annual_rate !== null || row.rate !== null)) return { index: "ipca", pct: null, annual: row.fixed_annual_rate ?? row.rate };
  if (!type && row.fixed_annual_rate !== null) return { index: "pre", pct: null, annual: row.fixed_annual_rate };
  return null;
}

function isWeekday(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

/** Weekdays from `from` (inclusive) to `to` (exclusive). */
export function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) if (isWeekday(d)) out.push(d);
  return out;
}

function weekdaysInMonth(month: string): number {
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return weekdays(start, next).length;
}

type Lookup = { byDate: Map<string, number>; last: DailyRate | null };

function lookup(series: DailyRate[]): Lookup {
  return { byDate: new Map(series.map((r) => [r.date, r.value])), last: series.length ? series[series.length - 1] : null };
}

/** Daily % of a published series for a business day, the last one after it, null on a holiday. */
function dailyPct(l: Lookup, date: string): number | null {
  const hit = l.byDate.get(date);
  if (hit !== undefined) return hit;
  if (l.last && date <= l.last.date) return null; // a weekday with no rate published: holiday
  return l.last?.value ?? null;
}

function ipcaOf(rates: Rates, month: string): number {
  const hit = rates.ipca.get(month);
  if (hit !== undefined) return hit;
  const known = [...rates.ipca.keys()].filter((k) => k < month).sort();
  return known.length ? rates.ipca.get(known[known.length - 1])! : 0;
}

/** Growth of one business day, or 1 on a holiday. */
export function dailyFactor(terms: RateTerms, date: string, rates: Rates, cdi = lookup(rates.cdi), selic = lookup(rates.selic)): number {
  const cdiToday = dailyPct(cdi, date);
  // The CDI calendar also tells holidays for the indexes that do not publish daily.
  if (cdiToday === null && cdi.last && date <= cdi.last.date) return 1;
  switch (terms.index) {
    case "cdi":
      return cdiToday === null ? 1 : 1 + (cdiToday / 100) * ((terms.pct ?? 100) / 100);
    case "selic": {
      const s = dailyPct(selic, date);
      return s === null ? 1 : 1 + (s / 100) * ((terms.pct ?? 100) / 100);
    }
    case "pre":
      return Math.pow(1 + (terms.annual ?? 0) / 100, 1 / 252);
    case "ipca": {
      const month = date.slice(0, 7);
      const monthly = Math.pow(1 + ipcaOf(rates, month) / 100, 1 / weekdaysInMonth(month));
      return monthly * Math.pow(1 + (terms.annual ?? 0) / 100, 1 / 252);
    }
  }
}

/**
 * Value today of a fixed-income position built from its movements: money in on its date earns
 * from that business day on; withdrawals leave on their date. Today's rate is not earned yet.
 */
export function valueFixedIncome(movements: Movement[], terms: RateTerms, rates: Rates, today: string) {
  const ordered = [...movements].sort((a, b) => a.date.localeCompare(b.date));
  const invested = costBasis(ordered).investedCents;
  if (ordered.length === 0) return { amountCents: 0, investedCents: 0 };
  const cdi = lookup(rates.cdi);
  const selic = lookup(rates.selic);
  let balance = 0;
  let next = 0;
  const apply = (until: string) => {
    while (next < ordered.length && ordered[next].date <= until) {
      const m = ordered[next++];
      if (m.type === "BUY" || (m.type === "TRANSFER" && m.movementType === "CREDIT")) balance += m.amountCents;
      else if (m.type === "SELL" || m.type === "AMORTIZATION" || (m.type === "TRANSFER" && m.movementType === "DEBIT")) balance = Math.max(0, balance - m.amountCents);
    }
  };
  for (const d of weekdays(ordered[0].date, today)) {
    apply(d);
    balance *= dailyFactor(terms, d, rates, cdi, selic);
  }
  apply(today);
  return { amountCents: Math.round(balance), investedCents: invested };
}

/** Growth from `from` to `to` assuming today's rates stay (IPCA from the last 12 months). */
export function projectedFactor(terms: RateTerms, rates: Rates, from: string, to: string): number {
  const days = weekdays(from, to).length;
  const lastCdi = rates.cdi.at(-1)?.value ?? 0;
  const lastSelic = rates.selic.at(-1)?.value ?? lastCdi;
  let perDay: number;
  switch (terms.index) {
    case "cdi":
      perDay = 1 + (lastCdi / 100) * ((terms.pct ?? 100) / 100);
      break;
    case "selic":
      perDay = 1 + (lastSelic / 100) * ((terms.pct ?? 100) / 100);
      break;
    case "pre":
      perDay = Math.pow(1 + (terms.annual ?? 0) / 100, 1 / 252);
      break;
    case "ipca":
      perDay = Math.pow(1 + (rates.ipca12 ?? 0) / 100, 1 / 252) * Math.pow(1 + (terms.annual ?? 0) / 100, 1 / 252);
      break;
  }
  return Math.pow(perDay, days);
}

/**
 * "Vira ≈ R$ X no vencimento, já descontado o IR": today's value carried to the maturity at
 * today's rates, minus the regressive income tax for the whole holding period (0 for LCI/LCA).
 */
export function estimateAtMaturity(input: {
  amountCents: number;
  investedCents: number;
  since: string;
  today: string;
  due: string;
  terms: RateTerms;
  rates: Rates;
  type: string;
  subtype: string | null;
}) {
  const gross = Math.round(input.amountCents * projectedFactor(input.terms, input.rates, input.today, input.due));
  const gain = gross - input.investedCents;
  const days = Math.max(0, Math.round((Date.parse(`${input.due}T00:00:00Z`) - Date.parse(`${input.since}T00:00:00Z`)) / 86_400_000));
  const rate = incomeTaxRate(input.type, input.subtype, days) ?? 0;
  const tax = gain > 0 ? Math.round(gain * rate) : 0;
  return { grossCents: gross, taxCents: tax, netCents: gross - tax, taxRate: rate };
}

/** Compact rates the new-investment form needs to estimate on the device. */
export type RatesSnapshot = { cdiDaily: number | null; selicDaily: number | null; ipca12: number | null; cdiAnnual: number | null };

export function ratesFromSnapshot(s: RatesSnapshot): Rates {
  return {
    cdi: s.cdiDaily !== null ? [{ date: "1900-01-01", value: s.cdiDaily }] : [],
    selic: s.selicDaily !== null ? [{ date: "1900-01-01", value: s.selicDaily }] : [],
    ipca: new Map(),
    ipca12: s.ipca12,
  };
}
