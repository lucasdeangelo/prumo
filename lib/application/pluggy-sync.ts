import "server-only";

import { categorize } from "@/lib/domain/categorize";
import { addDays, instantToDate, todayIn } from "@/lib/domain/dates";
import { decimalToCents } from "@/lib/domain/money";
import { normalizeMerchant } from "@/lib/domain/normalize";
import * as pluggy from "@/lib/integrations/pluggy";
import { listRules, listTags } from "@/lib/repositories/reads";
import { createAdminClient } from "@/lib/supabase/admin";

import { autoReconcileBills } from "./bills";
import { applyAutoOurs } from "./cards";
import { applyRulesToRecent } from "./privacy";
import { runSubscriptionDetection } from "./subscriptions";

const INITIAL_DAYS = 365;
const OVERLAP_DAYS = 10;

/** Saves a connection created by the widget. The item must belong to this user (clientUserId). */
async function ensureItemRow(userId: string, pluggyItemId: string) {
  const item = await pluggy.getItem(pluggyItemId);
  // Connect tokens always carry clientUserId = the person; anything else is not theirs to claim.
  if (item.clientUserId !== userId) throw new pluggy.PluggyError("Conexão de outro usuário.", 403);
  const admin = createAdminClient();
  const { data: existing } = await admin.from("pluggy_items").select("id, user_id").eq("pluggy_item_id", pluggyItemId).is("deleted_at", null);
  if (existing?.some((row) => row.user_id !== userId)) throw new pluggy.PluggyError("Conexão já vinculada a outro usuário.", 409);
  if (!existing?.length) {
    const { error } = await admin.from("pluggy_items").insert({
      user_id: userId,
      pluggy_item_id: pluggyItemId,
      connector_id: item.connector ? String(item.connector.id) : null,
      institution_name: item.connector?.name ?? null,
      status: item.status,
      consent_expires_at: item.consentExpiresAt ?? null,
      execution_status: item.executionStatus ?? null,
    });
    if (error && error.code !== "23505") throw new Error(`Falha ao salvar conexão: ${error.message}`);
  }
  const { data: row } = await admin.from("pluggy_items").select("id, last_sync_at").eq("user_id", userId).eq("pluggy_item_id", pluggyItemId).is("deleted_at", null).single();
  return { item, row: row as { id: string; last_sync_at: string | null } };
}

/**
 * Step 6 of the connection flow: brings the account list (no history yet) so the person chooses
 * what to bring and who sees each one. New accounts start private ("Só eu vejo").
 */
export async function stageConnection(userId: string, pluggyItemId: string) {
  const { item, row } = await ensureItemRow(userId, pluggyItemId);
  const accounts = await pluggy.listAccounts(pluggyItemId);
  await upsertAccounts(userId, row.id, item, accounts);
  return { itemId: pluggyItemId, status: item.status, executionStatus: item.executionStatus ?? null, accountCount: accounts.length };
}

/** Kept for the older entry point: connect and import right away. */
export async function registerItem(userId: string, pluggyItemId: string) {
  await ensureItemRow(userId, pluggyItemId);
  return syncItem(userId, pluggyItemId);
}

type LocalAccount = { id: string; pluggyAccountId: string; importEnabled: boolean; partnerCard: string | null };

async function upsertAccounts(userId: string, rowId: string, item: pluggy.PluggyItemResponse, accounts: pluggy.PluggyAccount[]) {
  const admin = createAdminClient();
  const result: LocalAccount[] = [];
  for (const account of accounts) {
    const balance = account.balance === null || account.balance === undefined ? null : decimalToCents(account.balance);
    const fields = {
      name: account.marketingName || account.name,
      type: account.type,
      subtype: account.subtype,
      // Credit card balances are what is owed; store them as a negative position.
      balance_cents: balance === null ? null : account.type === "CREDIT" ? -Math.abs(balance) : balance,
      balance_synced_at: new Date().toISOString(),
      currency: account.currencyCode || "BRL",
      institution: item.connector?.name && item.connector.name !== "MeuPluggy" ? item.connector.name : institutionFromName(account.name),
      card_last4: lastFour(account.number),
      credit_limit_cents: account.creditData?.creditLimit != null ? decimalToCents(account.creditData.creditLimit) : null,
      available_limit_cents: account.creditData?.availableCreditLimit != null ? decimalToCents(account.creditData.availableCreditLimit) : null,
      bill_close_date: account.creditData?.balanceCloseDate ? account.creditData.balanceCloseDate.slice(0, 10) : null,
      bill_due_date: account.creditData?.balanceDueDate ? account.creditData.balanceDueDate.slice(0, 10) : null,
    };
    const { data: local } = await admin
      .from("accounts")
      .select("id, import_enabled, partner_card_last4")
      .eq("user_id", userId)
      .eq("pluggy_item_id", rowId)
      .eq("pluggy_account_id", account.id)
      .maybeSingle();
    if (local) {
      await admin.from("accounts").update({ ...fields, archived_at: null }).eq("user_id", userId).eq("id", local.id);
      result.push({ id: local.id as string, pluggyAccountId: account.id, importEnabled: local.import_enabled as boolean, partnerCard: (local.partner_card_last4 as string | null) ?? null });
    } else {
      const { data: created, error } = await admin
        .from("accounts")
        .insert({ ...fields, user_id: userId, pluggy_item_id: rowId, pluggy_account_id: account.id, is_manual: false })
        .select("id")
        .single();
      if (error) throw new Error(`Falha ao salvar conta bancária: ${error.message}`);
      result.push({ id: created.id as string, pluggyAccountId: account.id, importEnabled: true, partnerCard: null });
    }
  }
  return result;
}

/**
 * Pulls accounts and posted transactions for one item. Replays converge thanks to the
 * provider identity index; user-chosen tags are preserved by upsert_provider_transactions.
 */
export async function syncItem(userId: string, pluggyItemId: string) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("pluggy_items")
    .select("id, last_sync_at, history")
    .eq("user_id", userId)
    .eq("pluggy_item_id", pluggyItemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) throw new pluggy.PluggyError("Conexão não encontrada.", 404);

  const item = await pluggy.getItem(pluggyItemId);
  const attemptAt = new Date().toISOString();
  const healthy = item.status === "UPDATED" && !item.error;
  const history = [{ at: item.lastUpdatedAt ?? attemptAt, ok: healthy }, ...((row.history as Array<{ at: string; ok: boolean }>) ?? [])]
    .filter((h, i, all) => all.findIndex((x) => x.at.slice(0, 10) === h.at.slice(0, 10)) === i)
    .slice(0, 10);
  await admin
    .from("pluggy_items")
    .update({
      status: item.status,
      error_code: item.error?.code ?? null,
      execution_status: item.executionStatus ?? null,
      consent_expires_at: item.consentExpiresAt ?? null,
      last_attempt_at: attemptAt,
      ...(healthy ? { last_success_at: item.lastUpdatedAt ?? attemptAt } : {}),
      history,
      institution_name: item.connector?.name ?? undefined,
    })
    .eq("user_id", userId)
    .eq("id", row.id);

  const accounts = await pluggy.listAccounts(pluggyItemId);
  const locals = await upsertAccounts(userId, row.id as string, item, accounts);
  const syncStartedAt = new Date().toISOString();
  const [rules, tags] = await Promise.all([listRules(admin, userId), listTags(admin, userId)]);
  const today = todayIn();
  const from = row.last_sync_at ? addDays(instantToDate(row.last_sync_at as string), -OVERLAP_DAYS) : addDays(today, -INITIAL_DAYS);
  let imported = 0;
  const perAccount: Array<{ accountId: string; imported: number }> = [];

  for (const account of accounts) {
    const local = locals.find((l) => l.pluggyAccountId === account.id)!;
    // The person chose not to bring this account (design: "não importar").
    if (!local.importEnabled) continue;
    const txs = await pluggy.listTransactions(account.id, from, addDays(today, 1));
    // Pending items may be re-issued with another id once posted; import only posted facts.
    const rows = txs
      .filter((tx) => tx.status !== "PENDING")
      .map((tx) => {
        // The `type` field decides direction: the amount sign differs between account kinds.
        const type = tx.type === "CREDIT" ? ("credit" as const) : ("debit" as const);
        const merchant = tx.merchant?.businessName || tx.merchant?.name || null;
        const description = tx.description || tx.descriptionRaw || "";
        const category = categorize({ description, merchant, type, providerCategory: tx.category }, rules, tags);
        const cardLast4 = lastFour(tx.creditCardMetadata?.cardNumber);
        return {
          account_id: local.id,
          pluggy_transaction_id: tx.id,
          provider_reference_scope: `pluggy:${account.id}`,
          amount_cents: Math.abs(decimalToCents(tx.amount)),
          type,
          provider_description: description.slice(0, 300),
          merchant,
          normalized_merchant: normalizeMerchant(merchant || description) || null,
          transaction_date: instantToDate(tx.date),
          posted_at: tx.date,
          tag_id: category?.tagId ?? null,
          category_confidence: category?.confidence ?? null,
          category_source: category?.source ?? null,
          card_last4: cardLast4,
          installment_number: tx.creditCardMetadata?.installmentNumber ?? null,
          installment_total: tx.creditCardMetadata?.totalInstallments ?? null,
          // A purchase on the partner's additional card is theirs from the start.
          scope: local.partnerCard && cardLast4 === local.partnerCard ? "partner" : "mine",
        };
      })
      .filter((tx) => tx.amount_cents > 0);

    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await admin.rpc("upsert_provider_transactions", { p_user: userId, p_rows: rows.slice(i, i + 500) });
      if (error) throw new Error(`Falha ao importar movimentações: ${error.message}`);
      imported += Number(data ?? 0);
    }
    perAccount.push({ accountId: local.id, imported: rows.length });
  }

  await admin.from("pluggy_items").update({ last_sync_at: new Date().toISOString() }).eq("user_id", userId).eq("id", row.id);
  await applyRulesToRecent(userId, from, syncStartedAt);
  await applyAutoOurs(userId, syncStartedAt);
  await runSubscriptionDetection(userId);
  const { settled } = await autoReconcileBills(userId);
  return { accounts: accounts.length, imported, settled, status: item.status, executionStatus: item.executionStatus ?? null, perAccount };
}

const SETTLED_STATUSES = new Set(["UPDATED", "LOGIN_ERROR", "OUTDATED", "WAITING_USER_INPUT"]);

/**
 * Manual "sync now": asks Pluggy to refresh the connection first, waits for it to finish, then imports.
 * MeuPluggy items refuse manual refreshes (HTTP 400) and update by themselves every 24 h, including
 * banks newly linked at meu.pluggy.ai; for them this just imports what Pluggy already has.
 */
export async function refreshAndSyncItem(userId: string, pluggyItemId: string, maxWaitMs = 50_000) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("pluggy_items")
    .select("id")
    .eq("user_id", userId)
    .eq("pluggy_item_id", pluggyItemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) throw new pluggy.PluggyError("Conexão não encontrada.", 404);

  let stillUpdating = false;
  try {
    await pluggy.refreshItem(pluggyItemId);
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const item = await pluggy.getItem(pluggyItemId);
      if (SETTLED_STATUSES.has(item.status)) break;
      if (Date.now() > deadline) {
        stillUpdating = true;
        break;
      }
    }
  } catch (error) {
    // A refresh already in progress or refused for rate limits still lets us import what exists.
    if (!(error instanceof pluggy.PluggyError) || (error.status !== undefined && error.status >= 500)) throw error;
  }
  return { ...(await syncItem(userId, pluggyItemId)), stillUpdating };
}

/** Webhook entry point: finds the owner from our own records, never from the payload alone. */
export async function syncFromWebhook(pluggyItemId: string) {
  const { data } = await createAdminClient().from("pluggy_items").select("user_id").eq("pluggy_item_id", pluggyItemId).is("deleted_at", null);
  for (const row of data ?? []) await syncItem(row.user_id as string, pluggyItemId);
}

/**
 * Stops receiving data. "Manter" keeps history (accounts archived); "Apagar" also hides its facts
 * from every screen, while goals and past settle-ups stay as they are.
 */
export async function disconnectItem(userId: string, pluggyItemId: string, options: { purge?: boolean } = {}) {
  const admin = createAdminClient();
  const { data: row } = await admin.from("pluggy_items").select("id").eq("user_id", userId).eq("pluggy_item_id", pluggyItemId).is("deleted_at", null).maybeSingle();
  if (!row) return;
  try {
    await pluggy.deleteItem(pluggyItemId);
  } catch (error) {
    if (!(error instanceof pluggy.PluggyError) || error.status !== 404) throw error;
  }
  const now = new Date().toISOString();
  // History stays: accounts are archived, transactions keep their rows.
  await admin.from("accounts").update({ archived_at: now }).eq("user_id", userId).eq("pluggy_item_id", row.id);
  if (options.purge) {
    const { data: accounts } = await admin.from("accounts").select("id").eq("user_id", userId).eq("pluggy_item_id", row.id);
    const ids = (accounts ?? []).map((a) => a.id as string);
    if (ids.length) await admin.from("transactions").update({ deleted_at: now }).eq("user_id", userId).in("account_id", ids).is("deleted_at", null);
  }
  await admin.from("pluggy_items").update({ deleted_at: now, status: "DELETED" }).eq("user_id", userId).eq("id", row.id);
}

function lastFour(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** MeuPluggy accounts carry the bank in their name ("Nu Pagamentos S.A. …"); keep a short label. */
function institutionFromName(name: string): string | null {
  const lower = name.toLowerCase();
  const known: Array<[string, string]> = [["nu pagamentos", "Nubank"], ["nubank", "Nubank"], ["inter", "Inter"], ["itaú", "Itaú"], ["itau", "Itaú"], ["bradesco", "Bradesco"], ["santander", "Santander"], ["caixa", "Caixa"], ["banco do brasil", "Banco do Brasil"], ["c6", "C6 Bank"], ["xp", "XP"], ["btg", "BTG"], ["picpay", "PicPay"], ["mercado pago", "Mercado Pago"]];
  return known.find(([key]) => lower.includes(key))?.[1] ?? null;
}
