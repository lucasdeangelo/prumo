"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getHousehold, propose } from "@/lib/application/household";
import { confirmGoal, contribute, createApprovalRequest, createGoal, markTalked, respondApproval, setBudgetAlerts, withdrawApproval } from "@/lib/application/plans";
import { markRetroPoint, recordMonthSettlement } from "@/lib/application/retro";
import { DomainError } from "@/lib/application/transactions";
import { addMonths, isIsoDate, todayIn } from "@/lib/domain/dates";
import { parseBRL } from "@/lib/domain/money";

export type PlanState = { error?: string; ok?: string } | undefined;

function friendly(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  console.error("plan action failed", error instanceof Error ? error.message : error);
  return "Algo deu errado. Tente novamente.";
}

// ---------- Budget ----------

export async function proposeBudgetAction(_: PlanState, formData: FormData): Promise<PlanState> {
  const { user } = await requireUser();
  const categories = formData.getAll("category").map(String);
  const amounts = formData.getAll("amount").map(String);
  const lines: Array<{ category: string; amountCents: number }> = [];
  for (let i = 0; i < categories.length; i += 1) {
    const category = categories[i].trim();
    if (!category) continue;
    const cents = parseBRL(amounts[i] ?? "");
    if (!cents) continue;
    if (lines.some((l) => l.category.toLowerCase() === category.toLowerCase())) return { error: `“${category}” aparece duas vezes.` };
    lines.push({ category: category.slice(0, 30), amountCents: cents });
  }
  if (lines.length === 0) return { error: "Defina ao menos uma categoria com valor." };
  try {
    await propose(user.id, "budget", { lines });
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath("/", "layout");
  redirect("/couple/budget?enviado=1");
}

export async function toggleBudgetAlertsAction(formData: FormData) {
  const { user } = await requireUser();
  await setBudgetAlerts(user.id, formData.get("enabled") === "1");
  revalidatePath("/couple/budget");
  redirect("/couple/budget");
}

// ---------- Goals ----------

const goalSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à meta").max(60),
  icon: z.string().max(4).optional(),
  target: z.string(),
  deadline: z.string().optional(),
  method: z.enum(["percent", "fixed"]),
  mine: z.string().optional(),
  theirs: z.string().optional(),
});

export async function createGoalAction(_: PlanState, formData: FormData): Promise<PlanState> {
  const { user } = await requireUser();
  const parsed = goalSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const target = parseBRL(d.target);
  if (!target) return { error: "Informe o valor-alvo." };
  const deadline = d.deadline ? `${d.deadline.slice(0, 7)}-01` : null;
  if (deadline && (!isIsoDate(deadline) || deadline <= todayIn())) return { error: "O prazo precisa ser um mês futuro." };
  let mine = 0;
  let theirs = 0;
  if (d.method === "percent") {
    mine = Number(d.mine ?? 50);
    theirs = Number(d.theirs ?? 100 - mine);
    if (!Number.isFinite(mine) || !Number.isFinite(theirs) || Math.round(mine + theirs) !== 100) return { error: "Os percentuais precisam somar 100%." };
  } else {
    mine = parseBRL(d.mine ?? "") ?? 0;
    theirs = parseBRL(d.theirs ?? "") ?? 0;
    if (mine + theirs <= 0) return { error: "Informe quanto cada um guarda por mês." };
  }
  let id: string;
  try {
    id = await createGoal(user.id, { name: d.name, icon: d.icon || null, targetCents: target, deadline, method: d.method, mine, theirs });
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath("/", "layout");
  redirect(`/couple/goals/${id}`);
}

export async function confirmGoalAction(formData: FormData) {
  const { user } = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  await confirmGoal(user.id, id);
  revalidatePath("/", "layout");
  redirect(`/couple/goals/${id}`);
}

export async function contributeAction(_: PlanState, formData: FormData): Promise<PlanState> {
  const { user } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Meta inválida." };
  const cents = parseBRL(String(formData.get("amount") ?? ""));
  if (!cents) return { error: "Informe quanto você guardou." };
  let reached: number | null = null;
  try {
    ({ reached } = await contribute(user.id, id.data, cents, todayIn()));
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath("/", "layout");
  redirect(reached ? `/couple/goals/${id.data}/milestone/${reached}` : `/couple/goals/${id.data}`);
}

// ---------- Combinados ----------

export async function proposeThresholdAction(_: PlanState, formData: FormData): Promise<PlanState> {
  const { user } = await requireUser();
  const raw = String(formData.get("amount") ?? "").trim();
  const cents = raw ? parseBRL(raw) : null;
  if (raw && !cents) return { error: "Valor inválido." };
  try {
    const { applied } = await propose(user.id, "approval_threshold", { amountCents: cents });
    revalidatePath("/", "layout");
    return { ok: applied ? "Combinado salvo." : "Enviado. Muda quando seu par confirmar." };
  } catch (error) {
    return { error: friendly(error) };
  }
}

const requestSchema = z.object({
  title: z.string().trim().min(1, "O que você quer comprar?").max(80),
  merchant: z.string().trim().max(60).optional(),
  category: z.string().trim().max(30).optional(),
  amount: z.string(),
  installments: z.coerce.number().int().min(1).max(48).default(1),
  note: z.string().trim().max(280).optional(),
});

export async function requestApprovalAction(_: PlanState, formData: FormData): Promise<PlanState> {
  const { user } = await requireUser();
  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const cents = parseBRL(parsed.data.amount);
  if (!cents) return { error: "Informe o valor." };
  let id: string;
  try {
    id = await createApprovalRequest(user.id, {
      title: parsed.data.title,
      merchant: parsed.data.merchant || null,
      category: parsed.data.category || null,
      amountCents: cents,
      installments: parsed.data.installments,
      note: parsed.data.note || null,
    });
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath("/", "layout");
  redirect(`/couple/approvals/${id}`);
}

export async function respondApprovalAction(formData: FormData) {
  const { user } = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  const answer = formData.get("answer") === "approved" ? "approved" : "talk";
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 280) || null;
  try {
    await respondApproval(user.id, id, answer, comment);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
  }
  revalidatePath("/", "layout");
  redirect("/couple/approvals");
}

export async function markTalkedAction(formData: FormData) {
  const { user } = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  await markTalked(user.id, id, String(formData.get("outcome") ?? "").trim().slice(0, 280) || null);
  revalidatePath("/couple/approvals");
  redirect("/couple/approvals");
}

export async function withdrawApprovalAction(formData: FormData) {
  const { user } = await requireUser();
  await withdrawApproval(user.id, z.uuid().parse(formData.get("id")));
  revalidatePath("/couple/approvals");
  redirect("/couple/approvals");
}

// ---------- Free money ----------

export async function proposeFreeMoneyAction(_: PlanState, formData: FormData): Promise<PlanState> {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household?.partner) return { error: "O dinheiro livre é combinado entre vocês dois." };
  const same = formData.get("same") === "on";
  const mine = parseBRL(String(formData.get("mine") ?? ""));
  const theirs = same ? mine : parseBRL(String(formData.get("theirs") ?? ""));
  if (!mine || !theirs) return { error: "Informe os valores por mês." };
  const effectiveFrom = addMonths(`${todayIn().slice(0, 7)}-01`, 1);
  try {
    await propose(user.id, "free_money", { amounts: { [household.me.userId]: mine, [household.partner.userId]: theirs }, effectiveFrom });
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath("/", "layout");
  return { ok: `Proposta enviada para ${household.partner.name}.` };
}

// ---------- Look back ----------

export async function markRetroPointAction(formData: FormData) {
  const { user } = await requireUser();
  const month = z.string().regex(/^\d{4}-\d{2}$/).parse(formData.get("month"));
  await markRetroPoint(user.id, month, String(formData.get("key") ?? ""));
  revalidatePath(`/couple/retro/${month}`);
  redirect(`/couple/retro/${month}/talk`);
}

export async function finishRetroAction(formData: FormData) {
  const { user } = await requireUser();
  const month = z.string().regex(/^\d{4}-\d{2}$/).parse(formData.get("month"));
  await markRetroPoint(user.id, month, "__done__");
  revalidatePath("/", "layout");
  redirect(`/couple/retro/${month}`);
}

export async function settleMonthAction(formData: FormData) {
  const { user } = await requireUser();
  const month = z.string().regex(/^\d{4}-\d{2}$/).parse(formData.get("month"));
  try {
    await recordMonthSettlement(user.id, month);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
  }
  revalidatePath(`/couple/retro/${month}`);
  redirect(`/couple/retro/${month}`);
}
