// Couple money rules: splitting, settling up, budgets, goals and the monthly look back. Pure functions.

import { addMonths, daysBetween, monthBounds } from "./dates";

export type SplitMethod = "equal" | "income" | "fixed";

/** Share of the first person (0..1) under a split method. Income split falls back to 50/50 without incomes. */
export function firstShare(method: SplitMethod, incomes: [number | null, number | null], fixedShare?: number | null): number {
  if (method === "fixed" && fixedShare !== null && fixedShare !== undefined) return Math.min(1, Math.max(0, fixedShare));
  if (method === "income") {
    const [a, b] = incomes;
    if (a && b && a + b > 0) return a / (a + b);
  }
  return 0.5;
}

/** Splits cents between two people, giving the leftover cent to the first so the parts always add up. */
export function splitCents(amountCents: number, share: number): [number, number] {
  const first = Math.round(amountCents * share);
  return [first, amountCents - first];
}

export function sharePercentLabel(share: number): string {
  const a = Math.round(share * 100);
  return `${a}/${100 - a}`;
}

export type InvoiceItem = {
  amountCents: number;
  type: "credit" | "debit";
  /** ours = split between both; holder = the card holder's own; partner = the partner's (e.g. additional card). */
  owner: "ours" | "holder" | "partner";
  /** Share of the holder for "ours" items (from the item's split, its category rule or the household default). */
  holderShare: number;
};

/**
 * Card invoice settle-up: the holder pays the whole invoice, so the partner owes their share of what is
 * "Nosso" plus their own purchases. Refunds (credits) reduce the matching bucket.
 */
export function invoiceSettlement(items: InvoiceItem[]) {
  let total = 0;
  let ours = 0;
  let holder = 0;
  let partner = 0;
  let partnerShareOfOurs = 0;
  for (const item of items) {
    const signed = item.type === "debit" ? item.amountCents : -item.amountCents;
    total += signed;
    if (item.owner === "ours") {
      ours += signed;
      partnerShareOfOurs += signed - Math.round(signed * item.holderShare);
    } else if (item.owner === "holder") holder += signed;
    else partner += signed;
  }
  return { totalCents: total, oursCents: ours, holderCents: holder, partnerCents: partner, partnerShareOfOursCents: partnerShareOfOurs, partnerOwesCents: Math.max(0, partnerShareOfOurs + partner) };
}

/**
 * Month settle-up over shared ("Nosso") spending paid by either person. Positive result: the second
 * person owes the first; negative: the first owes the second.
 */
export function monthSettlement(shared: Array<{ paidBy: 0 | 1; amountCents: number; firstShare: number }>) {
  let paid: [number, number] = [0, 0];
  let owed: [number, number] = [0, 0];
  for (const item of shared) {
    paid = paid.map((p, i) => (i === item.paidBy ? p + item.amountCents : p)) as [number, number];
    const [a, b] = splitCents(item.amountCents, item.firstShare);
    owed = [owed[0] + a, owed[1] + b];
  }
  const total = paid[0] + paid[1];
  return { totalCents: total, paidCents: paid, owedCents: owed, secondOwesFirstCents: paid[0] - owed[0] };
}

// ---------- Household budget ----------

export type BudgetLine = { category: string; limitCents: number; spentCents: number };

export function budgetStatus(line: BudgetLine) {
  const ratio = line.limitCents > 0 ? line.spentCents / line.limitCents : 0;
  const state: "ok" | "attention" | "over" = ratio > 1 ? "over" : ratio >= 0.8 ? "attention" : "ok";
  return { ...line, ratio, percent: Math.round(ratio * 100), remainingCents: line.limitCents - line.spentCents, state };
}

/** Thresholds (80/100) crossed and not yet notified. One notice per category, month and threshold. */
export function budgetAlertsToSend(lines: BudgetLine[], alreadySent: Set<string>, month: string) {
  const alerts: Array<{ category: string; threshold: 80 | 100; key: string }> = [];
  for (const line of lines) {
    const { ratio } = budgetStatus(line);
    for (const threshold of [80, 100] as const) {
      const key = `${line.category}|${month}|${threshold}`;
      if (ratio * 100 >= threshold && !alreadySent.has(key)) alerts.push({ category: line.category, threshold, key });
    }
  }
  return alerts;
}

/** Suggested budget per category: the average of the last months' shared spending, rounded to R$ 10. */
export function suggestBudget(monthlyTotals: Array<Record<string, number>>): Array<{ category: string; amountCents: number }> {
  const categories = new Set(monthlyTotals.flatMap((m) => Object.keys(m)));
  return [...categories]
    .map((category) => {
      const values = monthlyTotals.map((m) => m[category] ?? 0);
      const avg = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
      return { category, amountCents: Math.max(1000, Math.round(avg / 1000) * 1000) };
    })
    .filter((s) => s.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents);
}

// ---------- Goals ----------

export function goalProgress(input: { targetCents: number; savedCents: number; monthlyPaceCents: number; deadline: string | null; today: string }) {
  const { targetCents, savedCents, monthlyPaceCents, deadline, today } = input;
  const ratio = Math.min(1, savedCents / targetCents);
  const missing = Math.max(0, targetCents - savedCents);
  const monthsNeeded = monthlyPaceCents > 0 ? Math.ceil(missing / monthlyPaceCents) : null;
  const reachDate = monthsNeeded === null ? null : addMonths(`${today.slice(0, 7)}-01`, monthsNeeded);
  let monthsAhead: number | null = null;
  let neededMonthlyCents: number | null = null;
  if (deadline) {
    const monthsLeft = Math.max(1, monthsBetween(today, deadline));
    neededMonthlyCents = Math.ceil(missing / monthsLeft);
    if (monthsNeeded !== null) monthsAhead = monthsLeft - monthsNeeded;
  }
  return {
    percent: Math.floor(ratio * 100),
    missingCents: missing,
    reachMonth: reachDate ? reachDate.slice(0, 7) : null,
    monthsAhead,
    neededMonthlyCents,
    extraMonthlyCents: neededMonthlyCents !== null && neededMonthlyCents > monthlyPaceCents ? neededMonthlyCents - monthlyPaceCents : 0,
  };
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Milestones (25/50/75/100) reached by moving from `before` to `after` cents. */
export function milestonesCrossed(targetCents: number, beforeCents: number, afterCents: number): Array<25 | 50 | 75 | 100> {
  return ([25, 50, 75, 100] as const).filter((p) => beforeCents * 100 < targetCents * p && afterCents * 100 >= targetCents * p);
}

/** Monthly amount each person contributes to a goal for it to finish by the deadline. */
export function goalPlan(targetCents: number, savedCents: number, deadline: string, today: string, share: number) {
  const months = Math.max(1, monthsBetween(today, deadline));
  const monthly = Math.ceil(Math.max(0, targetCents - savedCents) / months);
  const [a, b] = splitCents(monthly, share);
  return { months, monthlyCents: monthly, firstCents: a, secondCents: b };
}

// ---------- Free money ----------

export function freeMoneyStatus(allowanceCents: number, usedCents: number, month: string) {
  const next = addMonths(`${month}-01`, 1);
  return { allowanceCents, usedCents, remainingCents: allowanceCents - usedCents, renewsOn: next };
}

// ---------- Look back ----------

export type RetroInput = {
  month: string;
  sharedByCategory: Record<string, number>;
  previousSharedByCategory: Record<string, number>;
  budgets: Record<string, number>;
  goals: Array<{ id: string; name: string; monthsAhead: number | null; savedThisMonthCents: number }>;
};

export type TalkPoint = { key: string; title: string; body: string };

/** Neutral observations, no scoreboard: over budget, goal pace, the biggest drop. At most three. */
export function talkPoints(input: RetroInput, fmt: (cents: number) => string): TalkPoint[] {
  const points: TalkPoint[] = [];
  for (const [category, limit] of Object.entries(input.budgets)) {
    const spent = input.sharedByCategory[category] ?? 0;
    if (spent > limit) {
      points.push({
        key: `over:${category}`,
        title: `${category} passou ${fmt(spent - limit)} do combinado`,
        body: `O valor de ${fmt(limit)} ainda faz sentido para vocês?`,
      });
    }
  }
  for (const goal of input.goals) {
    if (goal.monthsAhead !== null && goal.monthsAhead > 0) {
      points.push({
        key: `ahead:${goal.id}`,
        title: `${goal.name} está ${goal.monthsAhead === 1 ? "um mês adiantada" : `${goal.monthsAhead} meses adiantada`}`,
        body: "Dá para manter o ritmo ou passar parte do valor para outra meta.",
      });
    }
  }
  let bestDrop: { category: string; drop: number } | null = null;
  for (const [category, previous] of Object.entries(input.previousSharedByCategory)) {
    const drop = previous - (input.sharedByCategory[category] ?? 0);
    if (drop > 0 && (!bestDrop || drop > bestDrop.drop)) bestDrop = { category, drop };
  }
  if (bestDrop && bestDrop.drop >= 5000) {
    points.push({ key: `drop:${bestDrop.category}`, title: `${bestDrop.category} caiu ${fmt(bestDrop.drop)}`, body: "Vale contar como vitória." });
  }
  return points.slice(0, 3);
}

/** Days left in the month, counting today, for "cerca de R$ 55 por dia". */
export function daysLeftInMonth(today: string): number {
  const { end } = monthBounds(today.slice(0, 7));
  return daysBetween(today, end) + 1;
}
