"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { cancelBill, createBill, markBillPaid } from "@/lib/application/bills";
import { refreshAndSyncItem } from "@/lib/application/pluggy-sync";
import { createSubscription, runSubscriptionDetection, setSubscriptionStatus } from "@/lib/application/subscriptions";
import { createTransaction, deleteTransaction, DomainError, updateTransaction } from "@/lib/application/transactions";
import { getHousehold } from "@/lib/application/household";
import { createLinkCode, unlinkWhatsapp } from "@/lib/application/whatsapp";
import { isIsoDate } from "@/lib/domain/dates";
import { parseBRL } from "@/lib/domain/money";
import { FREQUENCIES } from "@/lib/domain/recurrence";
import { ConfigurationError } from "@/lib/env.server";
import { PluggyError } from "@/lib/integrations/pluggy";
import { createAdminClient } from "@/lib/supabase/admin";

export type FormState = { error?: string; ok?: string } | undefined;

const money = z.string().transform((value, ctx) => {
  const cents = parseBRL(value);
  if (!cents) {
    ctx.addIssue({ code: "custom", message: "Informe um valor válido, ex.: 45,90" });
    return z.NEVER;
  }
  return cents;
});
const date = z.string().refine(isIsoDate, "Data inválida");
const optionalId = z.preprocess((v) => (v === "" || v === null ? null : v), z.uuid().nullable());

function fields(formData: FormData) {
  return Object.fromEntries([...formData.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
}

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos";
}

function friendly(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (error instanceof ConfigurationError) return `Integração não configurada (${error.variable}).`;
  if (error instanceof PluggyError) return error.message;
  console.error("action failed", error instanceof Error ? error.message : error);
  return "Algo deu errado. Tente novamente.";
}

function refresh() {
  revalidatePath("/", "layout");
}

// ---------- Transactions ----------

const scope = z.preprocess((v) => (v === "ours" ? "ours" : "mine"), z.enum(["mine", "ours"]));

const transactionSchema = z.object({
  type: z.enum(["credit", "debit"]),
  amount: money,
  description: z.string().trim().min(1, "Descreva a movimentação").max(140),
  date,
  tagId: optionalId,
  accountId: optionalId,
  scope,
});

export async function createTransactionAction(_: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const parsed = transactionSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  try {
    const { amount, ...rest } = parsed.data;
    await createTransaction(user.id, { ...rest, amountCents: amount });
  } catch (error) {
    return { error: friendly(error) };
  }
  refresh();
  redirect(`/monthly/${parsed.data.date.slice(0, 7)}`);
}

const updateSchema = z.object({
  id: z.uuid(),
  description: z.string().trim().max(140),
  tagId: optionalId,
  learn: z.string().optional(),
  amount: z.string().optional(),
  date: z.string().optional(),
  type: z.enum(["credit", "debit"]).optional(),
});

export async function updateTransactionAction(_: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const parsed = updateSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { id, description, tagId, learn, amount, date: day, type } = parsed.data;
  const amountCents = amount ? parseBRL(amount) : undefined;
  if (amount && !amountCents) return { error: "Valor inválido" };
  if (day && !isIsoDate(day)) return { error: "Data inválida" };
  try {
    await updateTransaction(user.id, id, { description, tagId, amountCents: amountCents ?? undefined, date: day || undefined, type }, { learnRule: learn === "on" });
  } catch (error) {
    return { error: friendly(error) };
  }
  refresh();
  return { ok: learn === "on" ? "Salvo. As próximas deste estabelecimento usarão essa tag." : "Salvo." };
}

export async function deleteTransactionAction(formData: FormData) {
  const { user } = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  try {
    await deleteTransaction(user.id, id);
  } catch (error) {
    if (error instanceof DomainError) redirect(`/transactions/${id}?erro=${encodeURIComponent(error.message)}`);
    throw error;
  }
  refresh();
  redirect("/monthly");
}

// ---------- Upcoming bills ----------

const billSchema = z.object({
  description: z.string().trim().min(1, "Descreva a conta").max(120),
  amount: money,
  type: z.enum(["payable", "receivable"]),
  dueDate: date,
  recurrenceType: z.enum(["once", ...FREQUENCIES, "custom"]),
  recurrenceInterval: z.preprocess((v) => (v === "" ? null : Number(v)), z.number().int().min(1).max(365).nullable()).optional(),
  recurrenceUnit: z.preprocess((v) => (v === "" ? null : v), z.enum(["day", "week", "month", "year"]).nullable()).optional(),
  tagId: optionalId,
  accountId: optionalId,
  notifyDaysBefore: z.coerce.number().int().min(0).max(30),
  scope,
});

export async function createBillAction(_: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const parsed = billSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { amount, ...rest } = parsed.data;
  if (rest.recurrenceType === "custom" && (!rest.recurrenceInterval || !rest.recurrenceUnit)) {
    return { error: "Informe o intervalo da recorrência personalizada." };
  }
  try {
    await createBill(user.id, { ...rest, amountCents: amount });
  } catch (error) {
    return { error: friendly(error) };
  }
  refresh();
  redirect("/upcoming");
}

export async function payBillAction(formData: FormData) {
  const { user } = await requireUser();
  const parsed = z.object({ id: z.uuid(), transactionId: optionalId.optional() }).safeParse(fields(formData));
  if (!parsed.success) return;
  try {
    await markBillPaid(user.id, parsed.data.id, parsed.data.transactionId ?? null);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
  }
  refresh();
  redirect("/upcoming");
}

export async function cancelBillAction(formData: FormData) {
  const { user } = await requireUser();
  await cancelBill(user.id, z.uuid().parse(formData.get("id")));
  refresh();
  redirect("/upcoming");
}

// ---------- Subscriptions ----------

const subscriptionSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(80),
  amount: money,
  frequency: z.enum(FREQUENCIES),
  nextChargeDate: date,
  tagId: optionalId,
  notifyDaysBefore: z.coerce.number().int().min(0).max(30),
  scope,
});

export async function createSubscriptionAction(_: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const parsed = subscriptionSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { amount, ...rest } = parsed.data;
  try {
    await createSubscription(user.id, { ...rest, amountCents: amount });
  } catch (error) {
    return { error: friendly(error) };
  }
  refresh();
  redirect("/subscriptions");
}

export async function subscriptionStatusAction(formData: FormData) {
  const { user } = await requireUser();
  const parsed = z.object({ id: z.uuid(), status: z.enum(["active", "rejected", "cancelled", "paused"]) }).safeParse(fields(formData));
  if (!parsed.success) return;
  await setSubscriptionStatus(user.id, parsed.data.id, parsed.data.status);
  refresh();
}

export async function detectSubscriptionsAction(): Promise<FormState> {
  const { user } = await requireUser();
  try {
    const { created } = await runSubscriptionDetection(user.id);
    refresh();
    return { ok: created ? `${created} nova(s) sugestão(ões) encontrada(s).` : "Nenhuma assinatura nova encontrada." };
  } catch (error) {
    return { error: friendly(error) };
  }
}

// ---------- Tags and rules ----------

export async function createTagAction(_: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const parsed = z
    .object({ name: z.string().trim().min(1, "Informe o nome").max(30), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#52514e"), excluded: z.string().optional() })
    .safeParse(fields(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { error } = await createAdminClient().from("tags").insert({
    user_id: user.id,
    name: parsed.data.name,
    color: parsed.data.color,
    excluded_from_totals: parsed.data.excluded === "on",
  });
  if (error) return { error: error.code === "23505" ? "Já existe uma tag com esse nome." : "Falha ao criar tag." };
  const partnerId = (await getHousehold(user.id))?.partner?.userId;
  if (partnerId) {
    await createAdminClient().from("tags").insert({ user_id: partnerId, name: parsed.data.name, color: parsed.data.color, excluded_from_totals: parsed.data.excluded === "on" });
  }
  refresh();
  return { ok: partnerId ? "Tag criada para os dois." : "Tag criada." };
}

export async function createRuleAction(_: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const parsed = z
    .object({ pattern: z.string().trim().min(2, "Texto muito curto").max(60), tagId: z.uuid("Escolha uma tag"), patternType: z.enum(["contains", "exact", "merchant", "description"]) })
    .safeParse(fields(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const admin = createAdminClient();
  const { data: tag } = await admin.from("tags").select("id").eq("user_id", user.id).eq("id", parsed.data.tagId).maybeSingle();
  if (!tag) return { error: "Tag inválida." };
  const { error } = await admin.from("tag_rules").insert({
    user_id: user.id,
    pattern: parsed.data.pattern.toLowerCase(),
    pattern_type: parsed.data.patternType,
    tag_id: parsed.data.tagId,
    priority: 20,
  });
  if (error) return { error: "Falha ao criar regra." };
  // The same rule for the partner, pointing to their tag with the same name.
  const partnerId = (await getHousehold(user.id))?.partner?.userId;
  if (partnerId) {
    const { data: mine } = await admin.from("tags").select("name").eq("user_id", user.id).eq("id", parsed.data.tagId).maybeSingle();
    const { data: theirs } = mine ? await admin.from("tags").select("id").eq("user_id", partnerId).eq("name", mine.name).maybeSingle() : { data: null };
    if (theirs) {
      await admin.from("tag_rules").insert({ user_id: partnerId, pattern: parsed.data.pattern.toLowerCase(), pattern_type: parsed.data.patternType, tag_id: theirs.id, priority: 20 });
    }
  }
  refresh();
  return { ok: partnerId ? "Regra criada para os dois. Vale para as próximas importações." : "Regra criada. Vale para as próximas importações." };
}

export async function deleteRuleAction(formData: FormData) {
  const { user } = await requireUser();
  await createAdminClient().from("tag_rules").delete().eq("user_id", user.id).eq("id", z.uuid().parse(formData.get("id")));
  refresh();
}

// ---------- Accounts and Pluggy ----------

export async function createManualAccountAction(_: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const parsed = z.object({ name: z.string().trim().min(1, "Informe o nome").max(60), balance: z.string().optional() }).safeParse(fields(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const balance = parsed.data.balance ? parseBRL(parsed.data.balance) : null;
  const { error } = await createAdminClient().from("accounts").insert({
    user_id: user.id,
    name: parsed.data.name,
    type: "MANUAL",
    is_manual: true,
    balance_cents: balance,
    balance_synced_at: balance === null ? null : new Date().toISOString(),
  });
  if (error) return { error: "Falha ao criar conta." };
  refresh();
  return { ok: "Conta criada." };
}

export async function archiveAccountAction(formData: FormData) {
  const { user } = await requireUser();
  await createAdminClient().from("accounts").update({ archived_at: new Date().toISOString() }).eq("user_id", user.id).eq("id", z.uuid().parse(formData.get("id"))).eq("is_manual", true);
  refresh();
}



export async function pluggySyncAction(_: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const id = z.uuid().safeParse(formData.get("itemId"));
  if (!id.success) return { error: "Conexão inválida." };
  try {
    const result = await refreshAndSyncItem(user.id, id.data);
    refresh();
    const settled = result.settled ? `, ${result.settled} conta(s) quitada(s)` : "";
    const pending = result.stillUpdating ? " O banco ainda está atualizando; sincronize de novo em alguns minutos." : "";
    return { ok: `Sincronizado: ${result.accounts} conta(s), ${result.imported} movimentação(ões) nova(s)${settled}.${pending}` };
  } catch (error) {
    return { error: friendly(error) };
  }
}


// ---------- WhatsApp ----------

export async function whatsappCodeAction(): Promise<{ code?: string; expiresAt?: string; error?: string }> {
  const { user } = await requireUser();
  try {
    return await createLinkCode(user.id);
  } catch (error) {
    return { error: friendly(error) };
  }
}

export async function whatsappUnlinkAction() {
  const { user } = await requireUser();
  await unlinkWhatsapp(user.id);
  refresh();
}
