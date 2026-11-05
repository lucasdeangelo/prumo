// Calendar dates are "YYYY-MM-DD" strings. Arithmetic happens in UTC so no local offset leaks in.

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayIn(timezone = DEFAULT_TIMEZONE, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Converts an instant (ISO timestamp from a provider) to the calendar date in the given timezone. */
export function instantToDate(instant: string, timezone = DEFAULT_TIMEZONE): string {
  return todayIn(timezone, new Date(instant));
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Adds months keeping the anchor day when possible (Jan 31 + 1 = Feb 28, + 2 = Mar 31). */
export function addMonths(date: string, months: number, anchorDay?: number): string {
  const d = toUtc(date);
  const day = anchorDay ?? d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const clamped = Math.min(day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth()));
  target.setUTCDate(clamped);
  return fromUtc(target);
}

export type MonthKey = `${number}-${string}`;

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function isMonthKey(value: string): boolean {
  return ISO_MONTH.test(value);
}

export function monthBounds(month: string) {
  const match = ISO_MONTH.exec(month);
  if (!match) throw new Error(`Mês inválido: ${month}`);
  const start = `${month}-01`;
  const end = addDays(addMonths(start, 1), -1);
  return { start, end, prev: monthOf(addMonths(start, -1)), next: monthOf(addMonths(start, 1)) };
}

/** Last `count` month keys ending at `month`, oldest first. */
export function lastMonths(month: string, count: number): string[] {
  const start = `${month}-01`;
  return Array.from({ length: count }, (_, i) => monthOf(addMonths(start, i - count + 1)));
}

const monthLong = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
const dayShort = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

export function formatMonthLong(month: string): string {
  const label = monthLong.format(toUtc(`${month}-01`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatMonthShort(month: string): string {
  return monthShort.format(toUtc(`${month}-01`)).replace(".", "");
}

export function formatDayLabel(date: string): string {
  return dayLabel.format(toUtc(date)).replace(/\./g, "");
}

export function formatDayShort(date: string): string {
  return dayShort.format(toUtc(date));
}
