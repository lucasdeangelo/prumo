import "server-only";

import { addDays, todayIn } from "@/lib/domain/dates";
import { normalizeMerchant } from "@/lib/domain/normalize";
import { nextOccurrence, type Frequency } from "@/lib/domain/recurrence";
import { chargeMatchesSubscription, detectSubscriptions, merchantIsSubscription, taggedOutsideList, type DetectableTransaction, type TaggedCharge, type TaggedOutside } from "@/lib/domain/subscriptions";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBSCRIPTION_COLUMNS, type Subscription } from "@/lib/types";

async function subscriptionTagId(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("tags").select("id").eq("user_id", userId).eq("name", "Assinaturas").maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function recentDebits(userId: string, days: number): Promise<DetectableTransaction[]> {
  const { data, error } = await createAdminClient()
    .from("transactions")
    .select("id, type, amount_cents, transaction_date, normalized_merchant")
    .eq("user_id", userId)
    .eq("type", "debit")
    .is("deleted_at", null)
    .gte("transaction_date", addDays(todayIn(), -days))
    .limit(5000);
  if (error) throw new Error(`Falha ao ler movimentações: ${error.message}`);
  return (data ?? []) as DetectableTransaction[];
}

/**
 * Card purchases the bank still shows as pending (the open invoice): a charge from this month is
 * often only there. Installments are left out, they repeat monthly without being subscriptions.
 */
async function pendingCardDebits(userId: string, days: number): Promise<DetectableTransaction[]> {
  const { data } = await createAdminClient()
    .from("card_pending_items")
    .select("id, amount_cents, transaction_date, description, user_description, installment_total")
    .eq("user_id", userId)
    .eq("type", "debit")
    .eq("cancelled_by_refund", false)
    .gte("transaction_date", addDays(todayIn(), -days))
    .limit(2000);
  return ((data ?? []) as Array<{ id: string; amount_cents: number; transaction_date: string; description: string; user_description: string | null; installment_total: number | null }>)
    .filter((p) => !p.installment_total || p.installment_total <= 1)
    .map((p) => ({ id: `pending:${p.id}`, type: "debit" as const, amount_cents: p.amount_cents, transaction_date: p.transaction_date, normalized_merchant: normalizeMerchant(p.user_description ?? p.description) || null }));
}

/**
 * Stores new candidates. Existing names (active, rejected, cancelled...) are never re-suggested,
 * so running detection repeatedly is stable.
 */
export async function runSubscriptionDetection(userId: string) {
  const admin = createAdminClient();
  const [posted, pending] = await Promise.all([recentDebits(userId, 400), pendingCardDebits(userId, 75)]);
  const candidates = detectSubscriptions([...posted, ...pending], todayIn());
  if (candidates.length === 0) return { created: 0, names: [] as string[] };

  const { data: existing } = await admin.from("subscriptions").select("normalized_name").eq("user_id", userId).is("deleted_at", null);
  const knownNames = (existing ?? []).map((s) => s.normalized_name as string);
  // "anthropic claude sub" is the "claude" already in the list, active or not.
  const isKnown = (name: string) => knownNames.some((known) => merchantIsSubscription(name, known));
  const tagId = await subscriptionTagId(userId);
  const rows = candidates
    .filter((c) => !isKnown(c.normalizedName))
    .map((c) => ({
      user_id: userId,
      name: c.name,
      normalized_name: c.normalizedName,
      amount_cents: c.amountCents,
      frequency: c.frequency,
      next_charge_date: c.nextChargeDate,
      tag_id: tagId,
      status: "candidate",
      is_auto_detected: true,
      detection_confidence: c.confidence,
    }));
  if (rows.length === 0) return { created: 0, names: [] as string[] };
  // The unique (user_id, normalized_name) index makes a concurrent run lose with 23505, which is fine.
  let created = 0;
  const names: string[] = [];
  for (const row of rows) {
    const { error } = await admin.from("subscriptions").insert(row);
    if (!error) {
      created += 1;
      names.push(row.name);
    }
    else if (error.code !== "23505") throw new Error(`Falha ao salvar sugestão: ${error.message}`);
  }
  await linkSubscriptionCharges(userId);
  return { created, names };
}

/** Records charges in subscription history and moves next_charge_date past the latest charge. */
export async function linkSubscriptionCharges(userId: string) {
  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("user_id", userId)
    .in("status", ["active", "candidate"])
    .is("deleted_at", null);
  if (!subs || subs.length === 0) return;
  const debits = await recentDebits(userId, 120);
  const today = todayIn();

  for (const sub of subs as Subscription[]) {
    const charges = debits.filter((tx) => chargeMatchesSubscription(tx, sub));
    if (charges.length === 0) continue;
    const history = charges.map((tx) => ({
      user_id: userId,
      subscription_id: sub.id,
      transaction_id: tx.id,
      amount_cents: tx.amount_cents,
      charged_at: tx.transaction_date,
    }));
    const { data: present } = await admin.from("subscription_history").select("transaction_id").eq("user_id", userId).eq("subscription_id", sub.id);
    const seen = new Set((present ?? []).map((h) => h.transaction_id as string));
    const fresh = history.filter((h) => !seen.has(h.transaction_id));
    for (const row of fresh) {
      const { error } = await admin.from("subscription_history").insert(row);
      if (error && error.code !== "23505") throw new Error(`Falha no histórico da assinatura: ${error.message}`);
    }

    const latest = charges.reduce((a, b) => (a.transaction_date > b.transaction_date ? a : b));
    if (sub.frequency !== "custom" && sub.frequency !== "once") {
      let next = nextOccurrence(latest.transaction_date, sub.frequency as Frequency);
      while (next < today) next = nextOccurrence(next, sub.frequency as Frequency);
      const update: Record<string, unknown> = {};
      if (next !== sub.next_charge_date) update.next_charge_date = next;
      if (latest.amount_cents !== sub.amount_cents) {
        update.amount_cents = latest.amount_cents;
        update.last_amount_change_at = new Date().toISOString();
      }
      if (Object.keys(update).length > 0) await admin.from("subscriptions").update(update).eq("user_id", userId).eq("id", sub.id);
    }
  }
}

export async function createSubscription(
  userId: string,
  input: { name: string; amountCents: number; frequency: Frequency; nextChargeDate: string; tagId?: string | null; notifyDaysBefore: number; scope?: "mine" | "ours" },
) {
  const admin = createAdminClient();
  const normalized = normalizeMerchant(input.name) || input.name.toLowerCase().trim();
  const tagId = input.tagId ?? (await subscriptionTagId(userId));
  if (input.tagId) {
    const { data } = await admin.from("tags").select("id").eq("user_id", userId).eq("id", input.tagId).maybeSingle();
    if (!data) throw new Error("Tag inválida.");
  }
  const { data: existing } = await admin.from("subscriptions").select("id").eq("user_id", userId).eq("normalized_name", normalized).is("deleted_at", null).maybeSingle();
  const row = {
    name: input.name.trim(),
    amount_cents: input.amountCents,
    frequency: input.frequency,
    next_charge_date: input.nextChargeDate,
    tag_id: tagId,
    status: "active",
    notify_days_before: input.notifyDaysBefore,
    scope: input.scope ?? "mine",
  };
  // Adding a service the detector already suggested (or the user rejected) turns that row active.
  const { error } = existing
    ? await admin.from("subscriptions").update(row).eq("user_id", userId).eq("id", existing.id)
    : await admin.from("subscriptions").insert({ ...row, user_id: userId, normalized_name: normalized, is_auto_detected: false });
  if (error) throw new Error(`Falha ao salvar assinatura: ${error.message}`);
  await linkSubscriptionCharges(userId);
}

export async function setSubscriptionStatus(userId: string, id: string, status: "active" | "rejected" | "cancelled" | "paused") {
  const { error } = await createAdminClient().from("subscriptions").update({ status }).eq("user_id", userId).eq("id", id).is("deleted_at", null);
  if (error) throw new Error(`Falha ao atualizar assinatura: ${error.message}`);
}

// ---------- Tagged "Assinaturas" but not in the list ----------

const TAGGED_WINDOW_DAYS = 120;

/**
 * Merchants with recent charges the person tagged "Assinaturas" that the list does not have
 * (confirmed transactions and the open card invoice). The couple's ("Nosso") charges are left to
 * the shared list.
 */
export async function loadTaggedOutside(userId: string): Promise<TaggedOutside[]> {
  const tagId = await subscriptionTagId(userId);
  if (!tagId) return [];
  const admin = createAdminClient();
  const since = addDays(todayIn(), -TAGGED_WINDOW_DAYS);
  const [{ data: posted }, { data: pending }, { data: subs }] = await Promise.all([
    admin
      .from("transactions")
      .select("amount_cents, transaction_date, normalized_merchant, user_description, provider_description, scope")
      .eq("user_id", userId)
      .eq("tag_id", tagId)
      .eq("type", "debit")
      .is("deleted_at", null)
      .gte("transaction_date", since)
      .limit(2000),
    admin
      .from("card_pending_items")
      .select("amount_cents, transaction_date, description, user_description, scope, installment_total")
      .eq("user_id", userId)
      .eq("tag_id", tagId)
      .eq("type", "debit")
      .eq("cancelled_by_refund", false)
      .gte("transaction_date", since)
      .limit(2000),
    admin.from("subscriptions").select("normalized_name").eq("user_id", userId).is("deleted_at", null),
  ]);
  const charges: TaggedCharge[] = [
    ...((posted ?? []) as Array<{ amount_cents: number; transaction_date: string; normalized_merchant: string | null; user_description: string | null; provider_description: string | null; scope: string }>)
      .filter((t) => t.scope !== "ours")
      .map((t) => ({ key: t.normalized_merchant || normalizeMerchant(t.user_description ?? t.provider_description ?? ""), amount_cents: t.amount_cents, date: t.transaction_date })),
    ...((pending ?? []) as Array<{ amount_cents: number; transaction_date: string; description: string; user_description: string | null; scope: string; installment_total: number | null }>)
      .filter((p) => p.scope !== "ours" && (!p.installment_total || p.installment_total <= 1))
      .map((p) => ({ key: normalizeMerchant(p.user_description ?? p.description), amount_cents: p.amount_cents, date: p.transaction_date })),
  ];
  return taggedOutsideList(charges, (subs ?? []).map((s) => s.normalized_name as string));
}

/**
 * "Adicionar" turns a tagged merchant into an active monthly subscription (the person can change
 * it after); "Não é assinatura" records it as rejected so it leaves this section for good.
 * The values come from the person's own charges, never from the form.
 */
export async function decideTaggedMerchant(userId: string, key: string, decision: "add" | "ignore"): Promise<string | null> {
  const entry = (await loadTaggedOutside(userId)).find((t) => t.key === key);
  if (!entry) return null;
  const today = todayIn();
  let next = nextOccurrence(entry.lastDate, "monthly");
  while (next < today) next = nextOccurrence(next, "monthly");
  const { error } = await createAdminClient().from("subscriptions").insert({
    user_id: userId,
    name: entry.name,
    normalized_name: entry.key,
    amount_cents: entry.amountCents,
    frequency: "monthly",
    next_charge_date: next,
    tag_id: await subscriptionTagId(userId),
    status: decision === "add" ? "active" : "rejected",
    is_auto_detected: false,
    scope: "mine",
  });
  // A concurrent decision on the same name (23505) already did the job.
  if (error && error.code !== "23505") throw new Error(`Falha ao salvar assinatura: ${error.message}`);
  if (decision === "add") await linkSubscriptionCharges(userId);
  return entry.name;
}
