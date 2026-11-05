import "server-only";

import { budgetStatus, firstShare, monthSettlement, talkPoints } from "@/lib/domain/couple";
import { addMonths, monthBounds } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";

import { goalsOverview, loadAccounts, loadBudgets, loadCategoryNames, loadFacts, loadSplitRules, shareFor, sharedSpendingByCategory } from "./couple-data";
import { getHousehold, type Household } from "./household";
import { DomainError } from "./transactions";

/** The couple's month in numbers, without a scoreboard. */
export async function loadRetro(household: Household, month: string) {
  const partner = household.partner!;
  const ids = [household.me.userId, partner.userId];
  const previous = addMonths(`${month}-01`, -1).slice(0, 7);
  const { start, end } = monthBounds(month);
  const prev = monthBounds(previous);
  const [facts, prevFacts, categories, budgets, rules, goals] = await Promise.all([
    loadFacts(ids, start, end),
    loadFacts(ids, prev.start, prev.end),
    loadCategoryNames(ids),
    loadBudgets(household.id),
    loadSplitRules(household.id),
    goalsOverview(household.id, end),
  ]);
  const byCategory = sharedSpendingByCategory(facts, categories);
  const prevByCategory = sharedSpendingByCategory(prevFacts, categories);
  const total = Object.values(byCategory).reduce((s, v) => s + v, 0);
  const prevTotal = Object.values(prevByCategory).reduce((s, v) => s + v, 0);
  const budgetLines = budgets.map((b) => budgetStatus({ category: b.category, limitCents: b.limitCents, spentCents: byCategory[b.category] ?? 0 }));

  // Who paid what of the shared spending, against the share each one agreed to. Card purchases are
  // settled through the invoice, so here they count as already split and stay out of the month settle-up.
  const cardIds = new Set((await loadAccounts(ids)).filter((a) => a.type === "CREDIT").map((a) => a.id));
  const shared = facts.filter((f) => f.scope === "ours" && f.type === "debit" && !(f.tag_id && categories.get(f.tag_id)?.excluded));
  const shareOf = (f: (typeof shared)[number]) => shareFor(f, household, rules, (f.tag_id ? categories.get(f.tag_id)?.name : null) ?? "Outros", false);
  const direct = shared.filter((f) => !f.account_id || !cardIds.has(f.account_id));
  const viaCard = shared.filter((f) => f.account_id && cardIds.has(f.account_id));
  const directSettlement = monthSettlement(direct.map((f) => ({ paidBy: f.user_id === household.me.userId ? (0 as const) : (1 as const), amountCents: f.amount_cents, firstShare: shareOf(f) })));
  const cardPaid: [number, number] = [0, 0];
  for (const f of viaCard) {
    const mine = Math.round(f.amount_cents * shareOf(f));
    cardPaid[0] += mine;
    cardPaid[1] += f.amount_cents - mine;
  }
  const settlement = {
    totalCents: directSettlement.totalCents + cardPaid[0] + cardPaid[1],
    paidCents: [directSettlement.paidCents[0] + cardPaid[0], directSettlement.paidCents[1] + cardPaid[1]] as [number, number],
    secondOwesFirstCents: directSettlement.secondOwesFirstCents,
  };
  // The proportion the couple chose: by income, or 50/50.
  const incomeShare = household.defaultSplit === "equal" ? 0.5 : firstShare("income", [household.me.incomeCents, partner.incomeCents]);

  // Goal deposits made during the month.
  const goalIds = goals.map((g) => g.id);
  const { data: deposits } = goalIds.length
    ? await createAdminClient().from("goal_contributions").select("goal_id, amount_cents").in("goal_id", goalIds).gte("contributed_on", start).lte("contributed_on", end)
    : { data: [] as Array<{ goal_id: string; amount_cents: number }> };
  const savedByGoal = new Map<string, number>();
  for (const d of deposits ?? []) savedByGoal.set(d.goal_id as string, (savedByGoal.get(d.goal_id as string) ?? 0) + (d.amount_cents as number));
  const goalLines = goals
    .filter((g) => savedByGoal.has(g.id))
    .map((g) => ({ id: g.id, name: g.name, savedCents: savedByGoal.get(g.id) ?? 0, percent: g.progress.percent, monthsAhead: g.progress.monthsAhead }));

  let biggestDrop: { category: string; cents: number } | null = null;
  for (const [category, value] of Object.entries(prevByCategory)) {
    const drop = value - (byCategory[category] ?? 0);
    if (drop > 0 && (!biggestDrop || drop > biggestDrop.cents)) biggestDrop = { category, cents: drop };
  }

  const points = talkPoints(
    {
      month,
      sharedByCategory: byCategory,
      previousSharedByCategory: prevByCategory,
      budgets: Object.fromEntries(budgets.map((b) => [b.category, b.limitCents])),
      goals: goalLines.map((g) => ({ id: g.id, name: g.name, monthsAhead: g.monthsAhead, savedThisMonthCents: g.savedCents })),
    },
    formatBRL,
  );
  const admin = createAdminClient();
  const [{ data: marks }, { data: monthSettled }] = await Promise.all([
    admin.from("retro_points").select("point_key, marked_at").eq("household_id", household.id).eq("month", month),
    admin.from("settlements").select("amount_cents, settled_at, from_user, to_user").eq("household_id", household.id).eq("kind", "month").eq("reference", month).maybeSingle(),
  ]);

  return {
    month,
    previous,
    totalCents: total,
    prevTotalCents: prevTotal,
    changePercent: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
    biggestDrop,
    budgetLines,
    goalLines,
    goalsSavedCents: goalLines.reduce((s, g) => s + g.savedCents, 0),
    settlement,
    incomeShare,
    points,
    marked: new Set((marks ?? []).map((m) => m.point_key as string)),
    done: (marks ?? []).some((m) => m.point_key === "__done__"),
    monthSettled: monthSettled as { amount_cents: number; settled_at: string } | null,
  };
}

export async function markRetroPoint(userId: string, month: string, key: string) {
  const household = await getHousehold(userId);
  if (!household?.partner) throw new DomainError("A retrospectiva é do casal.");
  const { error } = await createAdminClient().from("retro_points").insert({ household_id: household.id, month, point_key: key.slice(0, 80), marked_by: userId });
  if (error && error.code !== "23505") throw new Error(`Falha ao marcar: ${error.message}`);
}

export async function recordMonthSettlement(userId: string, month: string) {
  const household = await getHousehold(userId);
  if (!household?.partner) throw new DomainError("O acerto é entre vocês dois.");
  const retro = await loadRetro(household, month);
  const owed = retro.settlement.secondOwesFirstCents;
  if (owed === 0) return;
  const [from, to] = owed > 0 ? [household.partner.userId, household.me.userId] : [household.me.userId, household.partner.userId];
  const { error } = await createAdminClient().from("settlements").insert({
    household_id: household.id,
    kind: "month",
    reference: month,
    from_user: from,
    to_user: to,
    amount_cents: Math.abs(owed),
    settled_by: userId,
  });
  if (error && error.code !== "23505") throw new Error(`Falha ao registrar acerto: ${error.message}`);
}
