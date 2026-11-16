import "server-only";

import { budgetAlertsToSend, milestonesCrossed, suggestBudget } from "@/lib/domain/couple";
import { addMonths, monthBounds, todayIn } from "@/lib/domain/dates";
import { goalProgress as investedProgress, linkFits, newMilestones } from "@/lib/domain/investments";
import { formatBRL } from "@/lib/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";

import { budgetOverview, loadCategoryNames, loadFacts, sharedSpendingByCategory } from "./couple-data";
import { loadGoalLinks } from "./goal-links";
import { forgetHouseholds, getHousehold, type Household } from "./household";
import { DomainError } from "./transactions";

// ---------- Notifications to the couple (WhatsApp outbox, deduplicated) ----------

/** Queues a WhatsApp notice for each person; the dedupe key makes repeats harmless. */
export async function notify(userIds: string[], type: string, text: string, dedupeKey: string) {
  const admin = createAdminClient();
  if (userIds.length === 0) return;
  // Only people with WhatsApp linked get a notice; the app screens show the same state anyway.
  const { data: links } = await admin.from("whatsapp_links").select("user_id").in("user_id", userIds).not("verified_at", "is", null).is("revoked_at", null);
  const linked = new Set((links ?? []).map((l) => l.user_id as string));
  for (const userId of userIds.filter((u) => linked.has(u))) {
    const { error } = await admin.from("notification_outbox").insert({
      user_id: userId,
      channel: "whatsapp",
      type,
      payload: { text },
      scheduled_for: new Date().toISOString(),
      dedupe_key: `${dedupeKey}:${userId}`,
    });
    if (error && error.code !== "23505") throw new Error(`Falha ao enfileirar aviso: ${error.message}`);
  }
}

function both(household: Household): string[] {
  return [household.me.userId, household.partner?.userId].filter(Boolean) as string[];
}

// ---------- Household budget ----------

/** Suggested values: the average of what was marked Nosso in the last three full months. */
export async function budgetSuggestion(household: Household) {
  const ids = both(household);
  const today = todayIn();
  const months = [-3, -2, -1].map((d) => addMonths(`${today.slice(0, 7)}-01`, d).slice(0, 7));
  const [facts, categories] = await Promise.all([loadFacts(ids, monthBounds(months[0]).start, monthBounds(months[2]).end), loadCategoryNames(ids)]);
  const perMonth = months.map((m) => {
    const { start, end } = monthBounds(m);
    return sharedSpendingByCategory(facts.filter((f) => f.transaction_date >= start && f.transaction_date <= end), categories);
  });
  return { suggestion: suggestBudget(perMonth), averages: perMonth, months };
}

/** One notice per category, month and threshold (80/100), to both people. */
export async function checkBudgetAlerts(householdId: string) {
  const admin = createAdminClient();
  const { data: household } = await admin.from("households").select("id, budget_alerts").eq("id", householdId).maybeSingle();
  if (!household?.budget_alerts) return 0;
  const { data: members } = await admin.from("household_members").select("user_id").eq("household_id", householdId);
  const ids = (members ?? []).map((m) => m.user_id as string);
  if (ids.length < 2) return 0;
  const month = todayIn().slice(0, 7);
  const { start, end } = monthBounds(month);
  const [facts, categories] = await Promise.all([loadFacts(ids, start, end), loadCategoryNames(ids)]);
  const overview = await budgetOverview(householdId, facts, categories);
  const { data: sent } = await admin.from("budget_alerts_sent").select("category, month, threshold").eq("household_id", householdId).eq("month", month);
  const already = new Set((sent ?? []).map((s) => `${s.category}|${s.month}|${s.threshold}`));
  const alerts = budgetAlertsToSend(overview.lines, already, month);
  for (const alert of alerts) {
    const { error } = await admin.from("budget_alerts_sent").insert({ household_id: householdId, category: alert.category, month, threshold: alert.threshold });
    if (error) continue; // another worker sent it first
    const line = overview.lines.find((l) => l.category === alert.category)!;
    const text = alert.threshold === 100
      ? `📊 ${alert.category} passou do combinado no orçamento do lar: ${formatBRL(line.spentCents)} de ${formatBRL(line.limitCents)}.`
      : `📊 ${alert.category} chegou a 80% do orçamento do lar: restam ${formatBRL(line.remainingCents)}.`;
    await notify(ids, "budget_alert", text, `budget:${householdId}:${alert.key}`);
  }
  return alerts.length;
}

export async function setBudgetAlerts(userId: string, enabled: boolean) {
  const household = await getHousehold(userId);
  if (!household) throw new DomainError("Você ainda não tem uma casa no Prumo.");
  await createAdminClient().from("households").update({ budget_alerts: enabled }).eq("id", household.id);
  forgetHouseholds();
}

// ---------- Goals ----------

export async function createGoal(
  userId: string,
  input: { name: string; icon: string | null; targetCents: number; deadline: string | null; method: "percent" | "fixed"; mine: number; theirs: number; scope?: "mine" | "ours" },
) {
  const household = await getHousehold(userId);
  if (!household) throw new DomainError("Você ainda não tem uma casa no Prumo.");
  const admin = createAdminClient();
  const personal = input.scope === "mine";
  // A personal goal is never shown to the partner: no invite, no confirmation.
  const partner = personal ? null : household.partner;
  const { data: goal, error } = await admin
    .from("goals")
    .insert({ household_id: household.id, name: input.name.trim(), icon: input.icon, target_cents: input.targetCents, deadline: input.deadline, method: personal ? "percent" : input.method, status: partner ? "pending" : "active", created_by: userId, scope: personal ? "mine" : "ours" })
    .select("id")
    .single();
  if (error || !goal) throw new Error(`Falha ao criar meta: ${error?.message}`);
  const value = (v: number) => (input.method === "percent" || personal ? { percent: personal ? 100 : v, monthly_cents: null } : { percent: null, monthly_cents: v });
  const rows = [{ goal_id: goal.id, user_id: userId, ...value(input.mine), confirmed_at: new Date().toISOString() }];
  if (partner) rows.push({ goal_id: goal.id, user_id: partner.userId, ...value(input.theirs), confirmed_at: null as unknown as string });
  await admin.from("goal_members").insert(rows);
  if (partner) {
    await notify([partner.userId], "goal_invite", `🎯 ${household.me.name} criou a meta “${input.name}” (${formatBRL(input.targetCents)}). Confirme sua parte no Prumo.`, `goal-invite:${goal.id}`);
  }
  return goal.id as string;
}

async function goalForUser(userId: string, goalId: string) {
  const household = await getHousehold(userId);
  if (!household) throw new DomainError("Meta não encontrada.");
  const { data: goal } = await createAdminClient().from("goals").select("id, household_id, name, target_cents, status, scope, created_by").eq("id", goalId).eq("household_id", household.id).maybeSingle();
  // The partner's personal goal does not exist for this person.
  if (!goal || (goal.scope === "mine" && goal.created_by !== userId)) throw new DomainError("Meta não encontrada.");
  return { household, goal };
}

/** Who hears about a goal: both for a couple goal, only the owner for a personal one. */
function goalAudience(household: Household, goal: { scope: unknown; created_by: unknown }): string[] {
  return goal.scope === "mine" ? [goal.created_by as string] : both(household);
}

/** Deposits plus the linked investments valued today. */
async function goalSavedCents(goal: { id: unknown; target_cents: unknown }): Promise<number> {
  const [{ data: deposits }, links] = await Promise.all([
    createAdminClient().from("goal_contributions").select("user_id, amount_cents").eq("goal_id", goal.id as string),
    loadGoalLinks([goal.id as string]),
  ]);
  return investedProgress(goal.target_cents as number, (deposits ?? []).map((d) => ({ userId: d.user_id as string, amountCents: d.amount_cents as number })), links).savedCents;
}

function milestoneText(goal: { name: unknown; target_cents: unknown; scope: unknown }, percent: number, savedCents: number): string {
  const together = goal.scope === "ours";
  return percent === 100
    ? `🎉 Meta “${goal.name}” concluída! ${together ? "Vocês guardaram" : "Você guardou"} ${formatBRL(goal.target_cents as number)}${together ? " juntos" : ""}.`
    : `🎯 “${goal.name}” chegou a ${percent}%: ${formatBRL(savedCents)} guardados${together ? " juntos" : ""}.`;
}

/**
 * Records milestones reached because investments moved (sync, a new link). Each is recorded once;
 * when several are reached at once only the highest is announced. 100% completes the goal.
 */
export async function refreshGoalMilestones(goalIds: string[]) {
  if (goalIds.length === 0) return;
  const admin = createAdminClient();
  const { data: goals } = await admin.from("goals").select("id, household_id, name, target_cents, status, scope, created_by").in("id", goalIds).eq("status", "active");
  for (const goal of goals ?? []) {
    const saved = await goalSavedCents(goal);
    const { data: recorded } = await admin.from("goal_milestones").select("percent").eq("goal_id", goal.id);
    const reached = newMilestones(goal.target_cents as number, saved, (recorded ?? []).map((r) => r.percent as number));
    if (reached.length === 0) continue;
    const { error } = await admin.from("goal_milestones").upsert(reached.map((percent) => ({ goal_id: goal.id, percent })), { onConflict: "goal_id,percent", ignoreDuplicates: true });
    if (error) continue;
    const top = reached[reached.length - 1];
    const household = await getHouseholdById(goal.household_id as string, goal.created_by as string);
    if (household) await notify(goalAudience(household, goal), "goal_milestone", milestoneText(goal, top, saved), `goal:${goal.id}:${top}`);
    if (reached.includes(100)) await admin.from("goals").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", goal.id);
  }
}

/** After a sync: goals that count this person's investments may have reached a milestone. */
export async function refreshMilestonesForOwner(userId: string) {
  const admin = createAdminClient();
  const { data: assets } = await admin.from("investments").select("id").eq("user_id", userId).is("deleted_at", null);
  const ids = (assets ?? []).map((a) => a.id as string);
  if (ids.length === 0) return;
  const { data: links } = await admin.from("goal_investments").select("goal_id").in("investment_id", ids);
  await refreshGoalMilestones([...new Set((links ?? []).map((l) => l.goal_id as string))]);
}

/** The household seen from one member, to know who hears about a goal. */
async function getHouseholdById(householdId: string, memberId: string) {
  const household = await getHousehold(memberId);
  return household?.id === householdId ? household : null;
}

/**
 * Makes one of the person's investments count for a goal they can see, whole or a part.
 * "Tudo" excludes other goals; parts together stay within the value today.
 */
export async function linkInvestment(userId: string, investmentId: string, goalId: string, mode: "all" | "part", partCents: number | null) {
  const admin = createAdminClient();
  const { data: asset } = await admin
    .from("investments")
    .select("id, amount_cents, status")
    .eq("id", investmentId)
    .eq("user_id", userId)
    .eq("include", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!asset || asset.status === "withdrawn") throw new DomainError("Investimento não encontrado.");
  const { goal } = await goalForUser(userId, goalId);
  if (goal.status === "done" || goal.status === "archived") throw new DomainError("Essa meta já foi concluída.");
  const { data: others } = await admin.from("goal_investments").select("mode, part_cents").eq("investment_id", investmentId).neq("goal_id", goalId);
  const existing = (others ?? []).map((o) => ({ mode: o.mode as "all" | "part", partCents: (o.part_cents as number | null) ?? null }));
  const next = { mode, partCents: mode === "part" ? partCents : null };
  if (!linkFits(existing, next, asset.amount_cents as number)) {
    throw new DomainError(
      existing.some((e) => e.mode === "all") || (mode === "all" && existing.length > 0)
        ? "Este investimento já conta para outra meta. Para usar o valor todo aqui, tire-o da outra meta antes."
        : "Essa parte passa do que o investimento vale hoje, somada às partes de outras metas.",
    );
  }
  const { error } = await admin
    .from("goal_investments")
    .upsert({ goal_id: goalId, investment_id: investmentId, mode, part_cents: next.partCents, created_by: userId }, { onConflict: "goal_id,investment_id" });
  if (error) throw new Error(`Falha ao vincular: ${error.message}`);
  await refreshGoalMilestones([goalId]);
}

/** Stops an investment from counting for a goal. Only the asset's owner does this. */
export async function unlinkInvestment(userId: string, investmentId: string, goalId: string) {
  const admin = createAdminClient();
  const { data: asset } = await admin.from("investments").select("id").eq("id", investmentId).eq("user_id", userId).maybeSingle();
  if (!asset) throw new DomainError("Investimento não encontrado.");
  await admin.from("goal_investments").delete().eq("goal_id", goalId).eq("investment_id", investmentId);
}

export async function confirmGoal(userId: string, goalId: string) {
  const { goal } = await goalForUser(userId, goalId);
  const admin = createAdminClient();
  await admin.from("goal_members").update({ confirmed_at: new Date().toISOString() }).eq("goal_id", goal.id).eq("user_id", userId).is("confirmed_at", null);
  const { data: pending } = await admin.from("goal_members").select("user_id").eq("goal_id", goal.id).is("confirmed_at", null);
  if (!pending?.length) await admin.from("goals").update({ status: "active" }).eq("id", goal.id).eq("status", "pending");
}

/**
 * Records a deposit and, for each milestone it crosses (25/50/75/100), notifies both once.
 * Returns the highest milestone reached so the screen can celebrate it.
 */
export async function contribute(userId: string, goalId: string, amountCents: number, date: string) {
  const { household, goal } = await goalForUser(userId, goalId);
  if (goal.status === "done" || goal.status === "archived") throw new DomainError("Essa meta já foi concluída.");
  const admin = createAdminClient();
  // Linked investments count too, so a deposit is measured against everything already saved.
  const savedBefore = await goalSavedCents(goal);
  const { error } = await admin.from("goal_contributions").insert({ goal_id: goal.id, user_id: userId, amount_cents: amountCents, contributed_on: date });
  if (error) throw new Error(`Falha ao guardar: ${error.message}`);
  const crossed = milestonesCrossed(goal.target_cents as number, savedBefore, savedBefore + amountCents);
  let reached: number | null = null;
  for (const percent of crossed) {
    const { error: milestoneError } = await admin.from("goal_milestones").insert({ goal_id: goal.id, percent });
    if (milestoneError) continue;
    reached = percent;
    await notify(goalAudience(household, goal), "goal_milestone", milestoneText(goal, percent, savedBefore + amountCents), `goal:${goal.id}:${percent}`);
  }
  if (crossed.includes(100)) await admin.from("goals").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", goal.id);
  return { reached };
}

// ---------- Combinados ----------

export async function createApprovalRequest(
  userId: string,
  input: { title: string; merchant: string | null; category: string | null; amountCents: number; installments: number; note: string | null },
) {
  const household = await getHousehold(userId);
  if (!household?.partner) throw new DomainError("Os combinados são entre vocês dois.");
  const { data, error } = await createAdminClient()
    .from("approval_requests")
    .insert({ household_id: household.id, requested_by: userId, title: input.title.trim(), merchant: input.merchant, category: input.category, amount_cents: input.amountCents, installments: input.installments, note: input.note })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Falha ao enviar: ${error?.message}`);
  await notify([household.partner.userId], "approval_request", `🛋️ ${household.me.name} quer combinar uma compra: ${input.title} · ${formatBRL(input.amountCents)}${input.installments > 1 ? ` em ${input.installments}x` : ""}. Responda no Prumo.`, `approval:${data.id}`);
  return data.id as string;
}

export async function respondApproval(userId: string, id: string, answer: "approved" | "talk", comment: string | null) {
  const household = await getHousehold(userId);
  if (!household?.partner) throw new DomainError("Pedido não encontrado.");
  const admin = createAdminClient();
  const { data: request } = await admin.from("approval_requests").select("id, requested_by, title, status").eq("id", id).eq("household_id", household.id).maybeSingle();
  if (!request) throw new DomainError("Pedido não encontrado.");
  if (request.requested_by === userId) throw new DomainError("Quem responde é o seu par.");
  if (request.status !== "pending") throw new DomainError("Esse pedido já foi respondido.");
  const { data: updated } = await admin
    .from("approval_requests")
    .update({ status: answer, responded_by: userId, response_note: comment, responded_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (!updated?.length) return;
  const verb = answer === "approved" ? "aprovou" : "quer conversar sobre";
  await notify([request.requested_by as string], "approval_answer", `${answer === "approved" ? "✅" : "💬"} ${household.me.name} ${verb} “${request.title}”.${comment ? ` “${comment}”` : ""}`, `approval-answer:${id}`);
}

export async function markTalked(userId: string, id: string, outcome: string | null) {
  const household = await getHousehold(userId);
  if (!household) throw new DomainError("Pedido não encontrado.");
  await createAdminClient()
    .from("approval_requests")
    .update({ status: "talked", talked_at: new Date().toISOString(), outcome_note: outcome })
    .eq("id", id)
    .eq("household_id", household.id)
    .eq("status", "talk");
}

export async function withdrawApproval(userId: string, id: string) {
  const household = await getHousehold(userId);
  if (!household) return;
  await createAdminClient().from("approval_requests").update({ status: "withdrawn" }).eq("id", id).eq("household_id", household.id).eq("requested_by", userId).eq("status", "pending");
}

export async function listApprovals(householdId: string) {
  const { data } = await createAdminClient()
    .from("approval_requests")
    .select("id, requested_by, title, merchant, category, amount_cents, installments, note, status, responded_by, response_note, responded_at, outcome_note, talked_at, created_at")
    .eq("household_id", householdId)
    .neq("status", "withdrawn")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as Array<{
    id: string; requested_by: string; title: string; merchant: string | null; category: string | null; amount_cents: number; installments: number;
    note: string | null; status: "pending" | "approved" | "talk" | "talked"; responded_by: string | null; response_note: string | null;
    responded_at: string | null; outcome_note: string | null; talked_at: string | null; created_at: string;
  }>;
}
