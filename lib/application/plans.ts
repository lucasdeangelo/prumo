import "server-only";

import { budgetAlertsToSend, milestonesCrossed, suggestBudget } from "@/lib/domain/couple";
import { addMonths, monthBounds, todayIn } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";

import { budgetOverview, loadCategoryNames, loadFacts, sharedSpendingByCategory } from "./couple-data";
import { getHousehold, type Household } from "./household";
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
}

// ---------- Goals ----------

export async function createGoal(
  userId: string,
  input: { name: string; icon: string | null; targetCents: number; deadline: string | null; method: "percent" | "fixed"; mine: number; theirs: number },
) {
  const household = await getHousehold(userId);
  if (!household) throw new DomainError("Você ainda não tem uma casa no Prumo.");
  const admin = createAdminClient();
  const partner = household.partner;
  const { data: goal, error } = await admin
    .from("goals")
    .insert({ household_id: household.id, name: input.name.trim(), icon: input.icon, target_cents: input.targetCents, deadline: input.deadline, method: input.method, status: partner ? "pending" : "active", created_by: userId })
    .select("id")
    .single();
  if (error || !goal) throw new Error(`Falha ao criar meta: ${error?.message}`);
  const value = (v: number) => (input.method === "percent" ? { percent: v, monthly_cents: null } : { percent: null, monthly_cents: v });
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
  const { data: goal } = await createAdminClient().from("goals").select("id, household_id, name, target_cents, status").eq("id", goalId).eq("household_id", household.id).maybeSingle();
  if (!goal) throw new DomainError("Meta não encontrada.");
  return { household, goal };
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
  const { data: before } = await admin.from("goal_contributions").select("amount_cents").eq("goal_id", goal.id);
  const savedBefore = (before ?? []).reduce((s, c) => s + (c.amount_cents as number), 0);
  const { error } = await admin.from("goal_contributions").insert({ goal_id: goal.id, user_id: userId, amount_cents: amountCents, contributed_on: date });
  if (error) throw new Error(`Falha ao guardar: ${error.message}`);
  const crossed = milestonesCrossed(goal.target_cents as number, savedBefore, savedBefore + amountCents);
  let reached: number | null = null;
  for (const percent of crossed) {
    const { error: milestoneError } = await admin.from("goal_milestones").insert({ goal_id: goal.id, percent });
    if (milestoneError) continue;
    reached = percent;
    const text = percent === 100 ? `🎉 Meta “${goal.name}” concluída! Vocês guardaram ${formatBRL(goal.target_cents as number)} juntos.` : `🎯 “${goal.name}” chegou a ${percent}%: ${formatBRL(savedBefore + amountCents)} guardados juntos.`;
    await notify(both(household), "goal_milestone", text, `goal:${goal.id}:${percent}`);
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
