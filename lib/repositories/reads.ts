import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ACCOUNT_COLUMNS,
  BILL_COLUMNS,
  SUBSCRIPTION_COLUMNS,
  TAG_COLUMNS,
  TRANSACTION_COLUMNS,
  type Account,
  type PluggyItem,
  type Subscription,
  type Tag,
  type TagRuleRow,
  type Transaction,
  type UpcomingBill,
} from "@/lib/types";

// Every read filters by user_id explicitly. With the RLS client this is defense in depth;
// with the service-role client (bot, sync) it is the only tenant boundary, so never drop it.

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Falha ao carregar ${what}: ${result.error.message}`);
  return (result.data ?? []) as T;
}

export async function listTags(db: SupabaseClient, userId: string): Promise<Tag[]> {
  return unwrap(await db.from("tags").select(TAG_COLUMNS).eq("user_id", userId).order("name"), "tags");
}

export async function listRules(db: SupabaseClient, userId: string): Promise<TagRuleRow[]> {
  return unwrap(
    await db.from("tag_rules").select("id, pattern, pattern_type, tag_id, priority").eq("user_id", userId).order("priority", { ascending: false }),
    "regras",
  );
}

export async function listAccounts(db: SupabaseClient, userId: string, includeArchived = false): Promise<Account[]> {
  let query = db.from("accounts").select(ACCOUNT_COLUMNS).eq("user_id", userId).order("name");
  if (!includeArchived) query = query.is("archived_at", null);
  return unwrap(await query, "contas");
}

export async function listPluggyItems(db: SupabaseClient, userId: string): Promise<PluggyItem[]> {
  return unwrap(
    await db.from("pluggy_items").select("id, pluggy_item_id, institution_name, status, error_code, last_sync_at").eq("user_id", userId).is("deleted_at", null).order("created_at"),
    "conexões",
  );
}

export async function listTransactions(
  db: SupabaseClient,
  userId: string,
  filter: { from?: string; to?: string; tagId?: string | null; accountId?: string; type?: "credit" | "debit"; limit?: number; columns?: string } = {},
): Promise<Transaction[]> {
  let query = db
    .from("transactions")
    .select(filter.columns ?? TRANSACTION_COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 2000);
  if (filter.from) query = query.gte("transaction_date", filter.from);
  if (filter.to) query = query.lte("transaction_date", filter.to);
  if (filter.tagId === null) query = query.is("tag_id", null);
  else if (filter.tagId) query = query.eq("tag_id", filter.tagId);
  if (filter.accountId) query = query.eq("account_id", filter.accountId);
  if (filter.type) query = query.eq("type", filter.type);
  return unwrap(await query, "movimentações") as unknown as Transaction[];
}

export async function getTransaction(db: SupabaseClient, userId: string, id: string): Promise<Transaction | null> {
  const { data, error } = await db.from("transactions").select(TRANSACTION_COLUMNS).eq("user_id", userId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Falha ao carregar movimentação: ${error.message}`);
  return data as Transaction | null;
}

export async function listBills(db: SupabaseClient, userId: string, filter: { status?: UpcomingBill["status"][]; to?: string } = {}): Promise<UpcomingBill[]> {
  let query = db.from("upcoming_bills").select(BILL_COLUMNS).eq("user_id", userId).is("deleted_at", null).order("due_date");
  if (filter.status) query = query.in("status", filter.status);
  if (filter.to) query = query.lte("due_date", filter.to);
  return unwrap(await query, "contas futuras");
}

export async function listSubscriptions(db: SupabaseClient, userId: string): Promise<Subscription[]> {
  return unwrap(
    await db.from("subscriptions").select(SUBSCRIPTION_COLUMNS).eq("user_id", userId).is("deleted_at", null).order("name"),
    "assinaturas",
  );
}

export async function getWhatsappLink(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("whatsapp_links")
    .select("id, phone_normalized, chat_id, verified_at, verification_expires_at, last_message_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar WhatsApp: ${error.message}`);
  return data as { id: string; phone_normalized: string | null; chat_id: string | null; verified_at: string | null; verification_expires_at: string | null; last_message_at: string | null } | null;
}
