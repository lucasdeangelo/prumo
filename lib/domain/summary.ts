import { addDays, monthBounds, monthOf } from "./dates";

export type SummaryTransaction = {
  amount_cents: number;
  type: "credit" | "debit";
  transaction_date: string;
  tag_id: string | null;
};

export type SummaryTag = { id: string; excluded_from_totals: boolean };

function isCounted(tx: SummaryTransaction, excluded: Set<string>): boolean {
  return !tx.tag_id || !excluded.has(tx.tag_id);
}

/** Income and spending for a month. Transfers/investments (excluded tags) are left out. */
export function summarizeMonth(transactions: SummaryTransaction[], tags: SummaryTag[], month: string) {
  const excluded = new Set(tags.filter((t) => t.excluded_from_totals).map((t) => t.id));
  const { start, end } = monthBounds(month);
  let incomeCents = 0;
  let expenseCents = 0;
  const byTag = new Map<string | null, number>();
  const dailyExpense = new Map<string, number>();
  const dailyIncome = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.transaction_date < start || tx.transaction_date > end || !isCounted(tx, excluded)) continue;
    if (tx.type === "credit") {
      incomeCents += tx.amount_cents;
      dailyIncome.set(tx.transaction_date, (dailyIncome.get(tx.transaction_date) ?? 0) + tx.amount_cents);
    } else {
      expenseCents += tx.amount_cents;
      byTag.set(tx.tag_id, (byTag.get(tx.tag_id) ?? 0) + tx.amount_cents);
      dailyExpense.set(tx.transaction_date, (dailyExpense.get(tx.transaction_date) ?? 0) + tx.amount_cents);
    }
  }

  const daily: Array<{ date: string; expenseCents: number; incomeCents: number }> = [];
  let accExpense = 0;
  let accIncome = 0;
  for (let date = start; date <= end; date = addDays(date, 1)) {
    accExpense += dailyExpense.get(date) ?? 0;
    accIncome += dailyIncome.get(date) ?? 0;
    daily.push({ date, expenseCents: accExpense, incomeCents: accIncome });
  }

  const expenseByTag = [...byTag.entries()]
    .map(([tagId, cents]) => ({ tagId, cents }))
    .sort((a, b) => b.cents - a.cents);

  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents, expenseByTag, daily };
}

/** Income/spending per month for a bar chart, oldest first. */
export function monthlySeries(transactions: SummaryTransaction[], tags: SummaryTag[], months: string[]) {
  const excluded = new Set(tags.filter((t) => t.excluded_from_totals).map((t) => t.id));
  const totals = new Map(months.map((m) => [m, { month: m, incomeCents: 0, expenseCents: 0 }]));
  for (const tx of transactions) {
    const row = totals.get(monthOf(tx.transaction_date));
    if (!row || !isCounted(tx, excluded)) continue;
    if (tx.type === "credit") row.incomeCents += tx.amount_cents;
    else row.expenseCents += tx.amount_cents;
  }
  return months.map((m) => totals.get(m)!);
}

/** Groups transactions by calendar day, newest day first, preserving order inside each day. */
export function groupByDay<T extends { transaction_date: string }>(transactions: T[]) {
  const groups = new Map<string, T[]>();
  for (const tx of transactions) {
    const list = groups.get(tx.transaction_date) ?? [];
    list.push(tx);
    groups.set(tx.transaction_date, list);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => ({ date, items }));
}
