import { addDays, addMonths } from "./dates";

export const FREQUENCIES = ["weekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export type RecurrenceType = "once" | Frequency | "custom";
export type RecurrenceUnit = "day" | "week" | "month" | "year";

export const FREQUENCY_LABEL: Record<RecurrenceType, string> = {
  once: "Única",
  weekly: "Semanal",
  monthly: "Mensal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
  custom: "Personalizada",
};

const MONTHS: Partial<Record<RecurrenceType, number>> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 };

/** Approximate length in days, used to compare frequencies and turn amounts into a monthly cost. */
export function periodDays(type: RecurrenceType, interval = 1, unit: RecurrenceUnit = "month"): number {
  if (type === "weekly") return 7;
  if (type === "once") return Infinity;
  if (type === "custom") return interval * { day: 1, week: 7, month: 30.44, year: 365.25 }[unit];
  return (MONTHS[type] ?? 1) * 30.44;
}

export function monthlyEquivalentCents(amountCents: number, type: RecurrenceType, interval?: number, unit?: RecurrenceUnit): number {
  const days = periodDays(type, interval, unit);
  return Number.isFinite(days) ? Math.round((amountCents * 30.44) / days) : 0;
}

/** The n-th occurrence after `start` (n = 0 is `start`), anchored to the start day to avoid month-end drift. */
export function nthOccurrence(start: string, n: number, type: RecurrenceType, interval = 1, unit: RecurrenceUnit = "month"): string {
  const anchor = Number(start.slice(8, 10));
  if (type === "once") return start;
  if (type === "weekly") return addDays(start, 7 * n);
  if (type === "custom") {
    if (unit === "day") return addDays(start, interval * n);
    if (unit === "week") return addDays(start, 7 * interval * n);
    if (unit === "month") return addMonths(start, interval * n, anchor);
    return addMonths(start, 12 * interval * n, anchor);
  }
  return addMonths(start, (MONTHS[type] ?? 1) * n, anchor);
}

export function nextOccurrence(date: string, type: RecurrenceType, interval?: number, unit?: RecurrenceUnit): string {
  return nthOccurrence(date, 1, type, interval, unit);
}

/** Occurrences of a series starting at `start`, within [from, to]. Bounded to keep forecasts cheap. */
export function occurrencesBetween(
  start: string,
  type: RecurrenceType,
  from: string,
  to: string,
  options: { interval?: number; unit?: RecurrenceUnit; max?: number } = {},
): string[] {
  const max = options.max ?? 120;
  const result: string[] = [];
  if (type === "once") return start >= from && start <= to ? [start] : [];
  for (let n = 0; n < 2000 && result.length < max; n += 1) {
    const date = nthOccurrence(start, n, type, options.interval, options.unit);
    if (date > to) break;
    if (date >= from) result.push(date);
  }
  return result;
}
