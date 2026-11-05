import "server-only";

import { categorize, type Categorization } from "@/lib/domain/categorize";
import { normalizeMerchant } from "@/lib/domain/normalize";
import { listRules, listTags } from "@/lib/repositories/reads";
import { createAdminClient } from "@/lib/supabase/admin";

import { runSubscriptionDetection } from "./subscriptions";

export type NewTransaction = {
  type: "credit" | "debit";
  amountCents: number;
  description: string;
  date: string;
  tagId?: string | null;
  accountId?: string | null;
};

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

async function assertOwned(userId: string, table: "tags" | "accounts", id: string | null | undefined) {
  if (!id) return;
  const { data } = await createAdminClient().from(table).select("id").eq("user_id", userId).eq("id", id).maybeSingle();
  if (!data) throw new DomainError(table === "tags" ? "Tag inválida." : "Conta inválida.");
}

export async function categorizeFor(userId: string, input: { description: string; type: "credit" | "debit"; providerCategory?: string | null }): Promise<Categorization | null> {
  const admin = createAdminClient();
  const [rules, tags] = await Promise.all([listRules(admin, userId), listTags(admin, userId)]);
  return categorize(input, rules, tags);
}

/**
 * Records a manual or WhatsApp fact. `externalReference` (e.g. the WhatsApp message id) makes
 * replays converge on the first row instead of duplicating it.
 */
export async function createTransaction(
  userId: string,
  input: NewTransaction,
  origin: { source: "manual" | "whatsapp"; externalReference?: string } = { source: "manual" },
) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError("Valor inválido.");
  await assertOwned(userId, "tags", input.tagId);
  await assertOwned(userId, "accounts", input.accountId);
  const admin = createAdminClient();

  if (origin.externalReference) {
    const { data: existing } = await admin
      .from("transactions")
      .select("id, tag_id")
      .eq("user_id", userId)
      .eq("source", origin.source)
      .eq("external_reference", origin.externalReference)
      .maybeSingle();
    if (existing) return { id: existing.id as string, tagId: existing.tag_id as string | null, replayed: true, detectedSubscriptions: [] as string[] };
  }

  const category: Categorization | null = input.tagId
    ? { tagId: input.tagId, confidence: 1, source: "user" }
    : await categorizeFor(userId, { description: input.description, type: input.type });

  const { data, error } = await admin
    .from("transactions")
    .insert({
      user_id: userId,
      account_id: input.accountId ?? null,
      amount_cents: input.amountCents,
      type: input.type,
      user_description: input.description.trim().slice(0, 140),
      normalized_merchant: normalizeMerchant(input.description) || null,
      transaction_date: input.date,
      tag_id: category?.tagId ?? null,
      category_confidence: category?.confidence ?? null,
      category_source: category?.source ?? null,
      source: origin.source,
      external_reference: origin.externalReference ?? null,
      is_reviewed: origin.source === "manual",
    })
    .select("id, tag_id")
    .single();
  if (error) {
    if (error.code === "23505" && origin.externalReference) {
      return createTransaction(userId, input, origin);
    }
    throw new Error(`Falha ao salvar movimentação: ${error.message}`);
  }
  // Every new expense may reveal a subscription (e.g. a known service paid once). Detection is
  // idempotent and also links the charge to subscriptions that already exist.
  const detected = input.type === "debit" ? (await runSubscriptionDetection(userId)).names : [];
  return { id: data.id as string, tagId: data.tag_id as string | null, replayed: false, detectedSubscriptions: detected };
}

/**
 * Updates user metadata. Provider facts keep their amounts (the database refuses changes);
 * choosing a tag can teach a rule so the same merchant is tagged automatically next time.
 */
export async function updateTransaction(
  userId: string,
  id: string,
  patch: { description?: string; tagId?: string | null; amountCents?: number; date?: string; type?: "credit" | "debit" },
  options: { learnRule?: boolean } = {},
) {
  const admin = createAdminClient();
  const { data: current } = await admin
    .from("transactions")
    .select("id, source, normalized_merchant, provider_description, user_description")
    .eq("user_id", userId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!current) throw new DomainError("Movimentação não encontrada.");
  await assertOwned(userId, "tags", patch.tagId);

  const editable = current.source !== "pluggy";
  const update: Record<string, unknown> = { is_reviewed: true };
  if (patch.description !== undefined) update.user_description = patch.description.trim().slice(0, 140) || null;
  if (patch.tagId !== undefined) {
    update.tag_id = patch.tagId;
    update.category_source = "user";
    update.category_confidence = 1;
  }
  if (editable) {
    if (patch.amountCents !== undefined) update.amount_cents = patch.amountCents;
    if (patch.date !== undefined) update.transaction_date = patch.date;
    if (patch.type !== undefined) update.type = patch.type;
    if (patch.description !== undefined) update.normalized_merchant = normalizeMerchant(patch.description) || null;
  }

  const { error } = await admin.from("transactions").update(update).eq("user_id", userId).eq("id", id);
  if (error) throw new Error(`Falha ao atualizar: ${error.message}`);

  const merchant = current.normalized_merchant as string | null;
  if (options.learnRule && patch.tagId && merchant) {
    const { data: existing } = await admin.from("tag_rules").select("id").eq("user_id", userId).eq("pattern_type", "merchant").eq("pattern", merchant).maybeSingle();
    if (existing) {
      await admin.from("tag_rules").update({ tag_id: patch.tagId }).eq("user_id", userId).eq("id", existing.id);
    } else {
      await admin.from("tag_rules").insert({ user_id: userId, pattern: merchant, pattern_type: "merchant", tag_id: patch.tagId, priority: 10 });
    }
    // Re-tag past automatic categorizations of the same merchant; user choices stay untouched.
    await admin
      .from("transactions")
      .update({ tag_id: patch.tagId, category_source: "rule", category_confidence: 1 })
      .eq("user_id", userId)
      .eq("normalized_merchant", merchant)
      .or("category_source.is.null,category_source.neq.user")
      .is("deleted_at", null);
  }
}

/** Soft delete: the row is hidden from totals but kept for audit and provider replay. */
export async function deleteTransaction(userId: string, id: string) {
  const admin = createAdminClient();
  const { data: linked } = await admin.from("upcoming_bills").select("id").eq("user_id", userId).eq("matched_transaction_id", id).is("deleted_at", null).maybeSingle();
  if (linked) throw new DomainError("Esta movimentação quitou uma conta futura e não pode ser excluída.");
  const { error } = await admin.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("user_id", userId).eq("id", id);
  if (error) throw new Error(`Falha ao excluir: ${error.message}`);
}
