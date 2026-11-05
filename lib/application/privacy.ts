import "server-only";

import { addDays, isIsoDate, todayIn } from "@/lib/domain/dates";
import { applyPrivacyRules, type PrivacyRule } from "@/lib/domain/visibility";
import { createAdminClient } from "@/lib/supabase/admin";
import { transactionLabel } from "@/lib/types";

import { DomainError } from "./transactions";

// Privacy changes never notify the partner and never leave a "hidden" marker (design decision 03).

export async function setAccountVisibility(userId: string, accountId: string, visibility: "private" | "totals" | "details") {
  const { data, error } = await createAdminClient().from("accounts").update({ visibility }).eq("user_id", userId).eq("id", accountId).select("id");
  if (error) throw new Error(`Falha ao salvar visibilidade: ${error.message}`);
  if (!data?.length) throw new DomainError("Conta não encontrada.");
}

export async function setAccountImport(userId: string, accountId: string, importEnabled: boolean) {
  await createAdminClient().from("accounts").update({ import_enabled: importEnabled }).eq("user_id", userId).eq("id", accountId);
}

/** Whose a fact is and what the partner sees of it. Marking it "Nosso" shares it in full. */
export async function setTransactionPrivacy(
  userId: string,
  id: string,
  patch: { scope?: "mine" | "ours"; privacy?: "account" | "category_only" | "hidden"; freeMoney?: boolean },
) {
  const update: Record<string, unknown> = {};
  if (patch.scope) {
    update.scope = patch.scope;
    if (patch.scope === "ours") Object.assign(update, { privacy: "account", surprise_until: null, surprise_hide_amount: false, free_money: false });
  }
  if (patch.privacy && patch.scope !== "ours") update.privacy = patch.privacy;
  if (patch.freeMoney !== undefined && patch.scope !== "ours") update.free_money = patch.freeMoney;
  const { data, error } = await createAdminClient().from("transactions").update(update).eq("user_id", userId).eq("id", id).is("deleted_at", null).select("id");
  if (error) throw new Error(`Falha ao salvar: ${error.message}`);
  if (!data?.length) throw new DomainError("Movimentação não encontrada.");
}

/** Keeps a gift private until a date; after it the item appears normally. */
export async function setSurprise(userId: string, id: string, until: string | null, hideAmount: boolean) {
  if (until !== null && (!isIsoDate(until) || until <= todayIn() || until > addDays(todayIn(), 400))) {
    throw new DomainError("Escolha uma data futura, em até um ano.");
  }
  const { data, error } = await createAdminClient()
    .from("transactions")
    .update({ surprise_until: until, surprise_hide_amount: until ? hideAmount : false, scope: "mine" })
    .eq("user_id", userId)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`Falha ao salvar surpresa: ${error.message}`);
  if (!data?.length) throw new DomainError("Movimentação não encontrada.");
}

export async function listPrivacyRules(userId: string) {
  const { data } = await createAdminClient().from("privacy_rules").select("id, match_type, tag_id, account_id, pattern, action, created_at").eq("user_id", userId).order("created_at");
  return (data ?? []) as Array<PrivacyRule & { id: string; created_at: string }>;
}

export async function createPrivacyRule(
  userId: string,
  rule: { matchType: "tag" | "merchant" | "account"; tagId?: string | null; accountId?: string | null; pattern?: string | null; action: "category_only" | "hidden" | "ask_surprise" },
  applyToLastDays: number | null,
) {
  const admin = createAdminClient();
  for (const [table, id] of [["tags", rule.tagId], ["accounts", rule.accountId]] as const) {
    if (!id) continue;
    const { data } = await admin.from(table).select("id").eq("user_id", userId).eq("id", id).maybeSingle();
    if (!data) throw new DomainError("Referência inválida.");
  }
  const { error } = await admin.from("privacy_rules").insert({
    user_id: userId,
    match_type: rule.matchType,
    tag_id: rule.matchType === "tag" ? rule.tagId : null,
    account_id: rule.matchType === "account" ? rule.accountId : null,
    pattern: rule.matchType === "merchant" ? rule.pattern?.trim().toLowerCase() : null,
    action: rule.action,
  });
  if (error) throw new Error(`Falha ao criar regra: ${error.message}`);
  if (applyToLastDays) await applyRulesToRecent(userId, addDays(todayIn(), -applyToLastDays));
}

export async function deletePrivacyRule(userId: string, id: string) {
  await createAdminClient().from("privacy_rules").delete().eq("user_id", userId).eq("id", id);
}

/**
 * Applies the owner's rules to their facts since a date (or created since an instant, after an import).
 * Only facts still on the account default are touched, so a per-item choice is never overridden.
 */
export async function applyRulesToRecent(userId: string, sinceDate: string, createdSince?: string) {
  const admin = createAdminClient();
  const rules = await listPrivacyRules(userId);
  if (rules.length === 0) return 0;
  let query = admin
    .from("transactions")
    .select("id, account_id, tag_id, user_description, provider_description, merchant")
    .eq("user_id", userId)
    .eq("scope", "mine")
    .eq("privacy", "account")
    .is("deleted_at", null)
    .gte("transaction_date", sinceDate)
    .limit(5000);
  if (createdSince) query = query.gte("created_at", createdSince);
  const { data } = await query;
  let changed = 0;
  for (const tx of data ?? []) {
    const { privacy } = applyPrivacyRules({ tag_id: tx.tag_id, account_id: tx.account_id, label: transactionLabel(tx) }, rules);
    if (privacy !== "account") {
      await admin.from("transactions").update({ privacy }).eq("user_id", userId).eq("id", tx.id);
      changed += 1;
    }
  }
  return changed;
}
