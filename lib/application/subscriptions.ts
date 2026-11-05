import "server-only";

import { addDays, todayIn } from "@/lib/domain/dates";
import { normalizeMerchant } from "@/lib/domain/normalize";
import { nextOccurrence, type Frequency } from "@/lib/domain/recurrence";
import { chargeMatchesSubscription, detectSubscriptions, type DetectableTransaction } from "@/lib/domain/subscriptions";
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
 * Stores new candidates. Existing names (active, rejected, cancelled...) are never re-suggested,
 * so running detection repeatedly is stable.
 */
export async function runSubscriptionDetection(userId: string) {
  const admin = createAdminClient();
  const candidates = detectSubscriptions(await recentDebits(userId, 400), todayIn());
  if (candidates.length === 0) return { created: 0, names: [] as string[] };

  const { data: existing } = await admin.from("subscriptions").select("normalized_name").eq("user_id", userId).is("deleted_at", null);
  const known = new Set((existing ?? []).map((s) => s.normalized_name as string));
  const tagId = await subscriptionTagId(userId);
  const rows = candidates
    .filter((c) => !known.has(c.normalizedName))
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
