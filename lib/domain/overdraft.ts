// Overdraft ("cheque especial"): the bank reports only today's balance and limit. The balance of
// each past day is rebuilt backwards from today's balance and the account's movements.

import { addDays } from "./dates";

export type Movement = { date: string; type: "credit" | "debit"; amount_cents: number };
export type DayBalance = { date: string; balanceCents: number };

/**
 * Closing balance of every day from `from` to `asOf`, given the closing balance on `asOf`.
 * Each day's movements are undone walking backwards.
 */
export function dailyBalances(balanceOnAsOf: number, asOf: string, movements: Movement[], from: string): DayBalance[] {
  const net = new Map<string, number>();
  for (const m of movements) net.set(m.date, (net.get(m.date) ?? 0) + (m.type === "credit" ? m.amount_cents : -m.amount_cents));
  const days: DayBalance[] = [];
  let balance = balanceOnAsOf;
  for (let day = asOf; day >= from; day = addDays(day, -1)) {
    days.push({ date: day, balanceCents: balance });
    balance -= net.get(day) ?? 0;
  }
  return days.reverse();
}

/** Interest and tax the bank charges for using the overdraft. */
export function isOverdraftCharge(description: string): boolean {
  return /juros.*(limite|cheque|especial|saldo devedor)|(limite|cheque) especial.*juros|^iof\b|pagamento de imposto iof|iof (sobre|de) (saldo|limite|cheque)/i.test(description.trim());
}

export type OverdraftMonth = {
  negativeDays: number;
  lowestCents: number;
  lowestDate: string | null;
  chargesCents: number;
};

/** One month of an account: days that ended below zero, the lowest point and what it cost. */
export function overdraftMonth(days: DayBalance[], month: string, movements: Array<Movement & { description: string }>): OverdraftMonth {
  const inMonth = days.filter((d) => d.date.startsWith(month));
  let lowest: DayBalance | null = null;
  for (const d of inMonth) if (!lowest || d.balanceCents < lowest.balanceCents) lowest = d;
  const chargesCents = movements
    .filter((m) => m.date.startsWith(month) && m.type === "debit" && isOverdraftCharge(m.description))
    .reduce((s, m) => s + m.amount_cents, 0);
  return {
    negativeDays: inMonth.filter((d) => d.balanceCents < 0).length,
    lowestCents: lowest?.balanceCents ?? 0,
    lowestDate: lowest && lowest.balanceCents < 0 ? lowest.date : null,
    chargesCents,
  };
}
