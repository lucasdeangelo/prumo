import "server-only";

import type { Household, Member } from "@/lib/application/household";
import { addDays, formatMonthShort, lastMonths, monthBounds } from "@/lib/domain/dates";
import { buildForecast, forecastTotals } from "@/lib/domain/forecast";
import { monthlyEquivalentCents } from "@/lib/domain/recurrence";
import { monthlySeries, summarizeMonth } from "@/lib/domain/summary";
import { transactionLabel, type Subscription, type Tag, type Transaction, type UpcomingBill } from "@/lib/types";

/** What the app needs to draw a person (avatar, space color). */
export type PersonView = { userId: string; name: string; initial: string; color: "blue" | "terracotta" };

export function person(member: Pick<Member, "userId" | "name" | "initial" | "color">): PersonView {
  return { userId: member.userId, name: member.name, initial: member.initial, color: member.color };
}

export function householdView(household: Household | null) {
  if (!household) return null;
  return {
    id: household.id,
    me: person(household.me),
    partner: household.partner ? person(household.partner) : null,
    approvalThresholdCents: household.approvalThresholdCents ?? null,
  };
}

/** A transaction row as the list draws it: label, tag, origin icon, amount. Small on the wire. */
export type ListTx = {
  id: string;
  label: string;
  tagId: string | null;
  source: string;
  auto: boolean;
  cents: number;
  type: "credit" | "debit";
  date: string;
};

export function listTx(tx: Transaction): ListTx {
  return {
    id: tx.id,
    label: transactionLabel(tx),
    tagId: tx.tag_id,
    source: tx.source,
    auto: Boolean(tx.category_source && tx.category_source !== "user" && !tx.is_reviewed),
    cents: tx.amount_cents,
    type: tx.type,
    date: tx.transaction_date,
  };
}

export type TagView = { id: string; name: string; color: string | null };

export function tagViews(tags: Tag[]): TagView[] {
  return tags.map((t) => ({ id: t.id, name: t.name, color: t.color }));
}

/** components/app/home-analytics.tsx, computed on the server: the phone gets totals, not history. */
export function homeAnalytics(input: {
  month: string;
  today: string;
  history: Transaction[];
  tags: Tag[];
  bills: UpcomingBill[];
  subscriptions: Subscription[];
  balanceCents: number;
  hasBalance: boolean;
  showBalance?: boolean;
}) {
  const { month, today, history, tags, bills, subscriptions } = input;
  const months = lastMonths(month, 6);
  const summary = summarizeMonth(history, tags, month);
  const series = monthlySeries(history, tags, months).map((m) => ({ ...m, label: formatMonthShort(m.month) }));
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const byName = new Map<string, { tagId: string | null; name: string; color: string | null; cents: number }>();
  for (const row of summary.expenseByTag) {
    const tag = row.tagId ? tagById.get(row.tagId) : undefined;
    const name = tag?.name ?? "Sem tag";
    const current = byName.get(name);
    byName.set(name, { tagId: current?.tagId ?? row.tagId, name, color: current?.color ?? tag?.color ?? null, cents: (current?.cents ?? 0) + row.cents });
  }
  const categoryRows = [...byName.values()].sort((a, b) => b.cents - a.cents);
  const forecast = buildForecast({ bills, subscriptions, today, to: addDays(today, 14) });
  const overdue = forecast.filter((i) => i.state === "overdue");
  const recent = history.slice(0, 5);
  return {
    month,
    showBalance: input.showBalance ?? true,
    balanceCents: input.balanceCents,
    hasBalance: input.hasBalance,
    incomeCents: summary.incomeCents,
    expenseCents: summary.expenseCents,
    overdueCount: overdue.length,
    overdueCents: forecastTotals(overdue).outCents,
    candidateCount: subscriptions.filter((s) => s.status === "candidate").length,
    series: series.map((s) => ({ month: s.month, label: s.label, incomeCents: s.incomeCents, expenseCents: s.expenseCents })),
    categoryRows,
    untagged: history.filter((t) => t.transaction_date >= monthBounds(month).start && !t.tag_id).length,
    nextItems: forecast.slice(0, 6).map((i) => ({ key: i.key, date: i.date, description: i.description, state: i.state, amountCents: i.amountCents, direction: i.direction })),
    monthlySubs: subscriptions.filter((s) => s.status === "active").reduce((sum, s) => sum + monthlyEquivalentCents(s.amount_cents, s.frequency), 0),
    recent: recent.map(listTx),
    tags: tagViews(tags.filter((t) => recent.some((r) => r.tag_id === t.id))),
  };
}

export type HomeAnalyticsView = ReturnType<typeof homeAnalytics>;
