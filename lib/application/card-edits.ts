import "server-only";

import { cardItemFingerprint, findEdit, type CardEdit, type CardItemLike } from "@/lib/domain/card-edits";
import { addDays, todayIn } from "@/lib/domain/dates";
import { createAdminClient } from "@/lib/supabase/admin";

import { getHousehold } from "./household";
import { DomainError } from "./transactions";

export type CardItemScope = "mine" | "ours" | "partner";

const EDIT_COLUMNS = "id, provider_transaction_id, fingerprint, tag_id, user_description, scope";

export type PendingCardRow = {
  id: string;
  account_id: string;
  provider_transaction_id: string;
  bill_month: string;
  transaction_date: string;
  description: string;
  user_description: string | null;
  amount_cents: number;
  type: "credit" | "debit";
  tag_id: string | null;
  scope: CardItemScope;
  edited: boolean;
  card_last4: string | null;
  installment_number: number | null;
  installment_total: number | null;
};

/** One pending purchase of the viewer's own card (only the card holder edits pending items). */
export async function loadPendingItem(userId: string, accountId: string, providerId: string): Promise<PendingCardRow | null> {
  const { data } = await createAdminClient()
    .from("card_pending_items")
    .select("id, account_id, provider_transaction_id, bill_month, transaction_date, description, user_description, amount_cents, type, tag_id, scope, edited, card_last4, installment_number, installment_total")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("provider_transaction_id", providerId)
    .eq("cancelled_by_refund", false)
    .maybeSingle();
  return (data as PendingCardRow | null) ?? null;
}

/**
 * Saves the person's tag, description and owner for a pending card purchase. It shows at once in
 * the invoice and is carried to the confirmed transaction when the bank posts it.
 */
export async function editPendingItem(
  userId: string,
  input: { accountId: string; providerId: string; tagId: string | null; description: string | null; scope: CardItemScope },
) {
  const admin = createAdminClient();
  const item = await loadPendingItem(userId, input.accountId, input.providerId);
  if (!item) throw new DomainError("Compra não encontrada. A fatura pode ter sido atualizada; abra de novo.");
  if (input.tagId) {
    const { data: tag } = await admin.from("tags").select("id").eq("user_id", userId).eq("id", input.tagId).maybeSingle();
    if (!tag) throw new DomainError("Tag inválida.");
  }
  if (input.scope !== "mine") {
    const household = await getHousehold(userId);
    if (!household?.partner) throw new DomainError("Só dá para dividir depois de convidar seu par.");
  }
  const description = input.description?.replace(/\s+/g, " ").trim().slice(0, 120) || null;
  const now = new Date().toISOString();
  const { error } = await admin.from("card_item_edits").upsert(
    {
      user_id: userId,
      account_id: input.accountId,
      provider_transaction_id: input.providerId,
      fingerprint: cardItemFingerprint(item),
      tag_id: input.tagId,
      user_description: description,
      scope: input.scope,
      applied_at: null,
      updated_at: now,
    },
    { onConflict: "account_id,provider_transaction_id" },
  );
  if (error) throw new Error(`Falha ao salvar a edição: ${error.message}`);
  await admin
    .from("card_pending_items")
    .update({ tag_id: input.tagId, user_description: description, scope: input.scope, edited: true })
    .eq("user_id", userId)
    .eq("id", item.id);
}

async function openEdits(userId: string, accountId: string): Promise<CardEdit[]> {
  const { data } = await createAdminClient().from("card_item_edits").select(EDIT_COLUMNS).eq("user_id", userId).eq("account_id", accountId).is("applied_at", null);
  return (data ?? []) as CardEdit[];
}

/** Sync: puts the person's edits on the new pending snapshot before it is saved. */
export async function withPendingEdits<R extends CardItemLike & { provider_transaction_id: string; tag_id: string | null }>(
  userId: string,
  accountId: string,
  rows: R[],
): Promise<Array<R & { user_description: string | null; scope: CardItemScope; edited: boolean }>> {
  const edits = await openEdits(userId, accountId);
  return rows.map((row) => {
    const edit = edits.length ? findEdit(edits, row.provider_transaction_id, row) : null;
    if (!edit) return { ...row, user_description: null, scope: "mine" as const, edited: false };
    return { ...row, tag_id: edit.tag_id, user_description: edit.user_description, scope: edit.scope ?? "mine", edited: true };
  });
}

/**
 * Sync, after confirmed transactions are saved: an edit whose purchase the bank has now posted is
 * written on that transaction (tag as the person's choice, description, owner) and closed.
 */
export async function applyEditsToPosted(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("card_item_edits").select(`${EDIT_COLUMNS}, account_id`).eq("user_id", userId).is("applied_at", null);
  const edits = (data ?? []) as Array<CardEdit & { account_id: string }>;
  const now = new Date().toISOString();
  const byAccount = new Map<string, typeof edits>();
  for (const edit of edits) byAccount.set(edit.account_id, [...(byAccount.get(edit.account_id) ?? []), edit]);

  for (const [accountId, accountEdits] of byAccount) {
    const { data: posted } = await admin
      .from("transactions")
      .select("id, pluggy_transaction_id, transaction_date, amount_cents, type, installment_number, provider_description")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .gte("transaction_date", addDays(todayIn(), -120))
      .is("deleted_at", null)
      .limit(5000);
    const facts = (posted ?? []) as Array<{ id: string; pluggy_transaction_id: string | null; transaction_date: string; amount_cents: number; type: "credit" | "debit"; installment_number: number | null; provider_description: string | null }>;
    const remaining = [...accountEdits];
    for (const fact of facts) {
      if (remaining.length === 0) break;
      const edit = findEdit(remaining, fact.pluggy_transaction_id ?? "", { ...fact, description: fact.provider_description ?? "" });
      if (!edit) continue;
      remaining.splice(remaining.indexOf(edit), 1);
      const update: Record<string, unknown> = {};
      if (edit.tag_id) Object.assign(update, { tag_id: edit.tag_id, category_source: "user", category_confidence: 1 });
      if (edit.user_description) update.user_description = edit.user_description;
      if (edit.scope) {
        update.scope = edit.scope;
        if (edit.scope !== "mine") Object.assign(update, { privacy: "account", surprise_until: null, surprise_hide_amount: false, free_money: false });
      }
      if (Object.keys(update).length) await admin.from("transactions").update(update).eq("user_id", userId).eq("id", fact.id);
      await admin.from("card_item_edits").update({ applied_at: now }).eq("user_id", userId).eq("id", edit.id);
    }
  }

  // Applied edits are kept a while for support; unmatched ones expire with their purchase.
  await admin.from("card_item_edits").delete().eq("user_id", userId).lt("applied_at", addDays(todayIn(), -60));
  await admin.from("card_item_edits").delete().eq("user_id", userId).is("applied_at", null).lt("created_at", addDays(todayIn(), -400));
}
