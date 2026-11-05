import "server-only";

import { addDays, formatDayShort, todayIn } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";

type Pending = { user_id: string; type: string; dedupe_key: string; text: string };

/**
 * Queues WhatsApp reminders for bills and subscription charges that are inside their notice window.
 * Each reminder has a stable dedupe key, so running this every minute enqueues it once.
 */
export async function enqueueDueNotifications(now = new Date()) {
  const admin = createAdminClient();
  const today = todayIn("America/Sao_Paulo", now);
  const { data: links } = await admin
    .from("whatsapp_links")
    .select("user_id")
    .not("verified_at", "is", null)
    .is("revoked_at", null);
  const users = [...new Set((links ?? []).map((l) => l.user_id as string))];
  if (users.length === 0) return { queued: 0 };

  const pending: Pending[] = [];
  const { data: bills } = await admin
    .from("upcoming_bills")
    .select("id, user_id, description, amount_cents, type, due_date, notify_days_before")
    .in("user_id", users)
    .in("status", ["pending", "overdue"])
    .is("deleted_at", null)
    .gte("due_date", addDays(today, -1))
    .lte("due_date", addDays(today, 30));
  for (const bill of bills ?? []) {
    const verb = bill.type === "payable" ? "pagar" : "receber";
    const amount = formatBRL(bill.amount_cents as number);
    if (bill.due_date === addDays(today, -1)) {
      pending.push({ user_id: bill.user_id, type: "bill_due", dedupe_key: `bill_overdue:${bill.id}:${bill.due_date}`, text: `⚠️ *${bill.description}* (${amount}) venceu ontem e ainda está em aberto.\nJá pagou? Marque no app ou responda *paguei ${bill.description}*.` });
    } else if (bill.due_date >= today && bill.due_date <= addDays(today, bill.notify_days_before as number)) {
      const when = bill.due_date === today ? "vence *hoje*" : `vence em ${formatDayShort(bill.due_date as string)}`;
      pending.push({ user_id: bill.user_id, type: "bill_due", dedupe_key: `bill_due:${bill.id}:${bill.due_date}`, text: `🔔 Conta a ${verb}: *${bill.description}* — ${amount}, ${when}.` });
    }
  }

  const { data: subs } = await admin
    .from("subscriptions")
    .select("id, user_id, name, amount_cents, next_charge_date, notify_days_before")
    .in("user_id", users)
    .eq("status", "active")
    .is("deleted_at", null)
    .gte("next_charge_date", today)
    .lte("next_charge_date", addDays(today, 30));
  for (const sub of subs ?? []) {
    if ((sub.next_charge_date as string) > addDays(today, sub.notify_days_before as number)) continue;
    pending.push({
      user_id: sub.user_id,
      type: "subscription_charge",
      dedupe_key: `sub:${sub.id}:${sub.next_charge_date}`,
      text: `🔁 Assinatura *${sub.name}* deve cobrar ${formatBRL(sub.amount_cents as number)} em ${formatDayShort(sub.next_charge_date as string)}.`,
    });
  }

  let queued = 0;
  for (const item of pending) {
    const { error } = await admin.from("notification_outbox").insert({
      user_id: item.user_id,
      channel: "whatsapp",
      type: item.type,
      payload: { text: item.text },
      scheduled_for: now.toISOString(),
      dedupe_key: item.dedupe_key,
    });
    if (!error) queued += 1;
    else if (error.code !== "23505") throw new Error(`Falha ao enfileirar aviso: ${error.message}`);
  }
  return { queued };
}

/** Leases ready WhatsApp messages and resolves the destination phone of each owner. */
export async function claimWhatsappNotifications(limit = 10) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_notifications", { p_channel: "whatsapp", p_limit: limit, p_lease_seconds: 120 });
  if (error) throw new Error(`Falha ao reservar avisos: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; user_id: string; payload: { text?: string } }>;
  if (rows.length === 0) return [];
  const { data: links } = await admin
    .from("whatsapp_links")
    .select("user_id, phone_normalized, chat_id")
    .in("user_id", [...new Set(rows.map((r) => r.user_id))])
    .not("verified_at", "is", null)
    .is("revoked_at", null);
  const targets = new Map((links ?? []).map((l) => [l.user_id as string, { phone: l.phone_normalized as string, chatId: (l.chat_id as string | null) ?? null }]));

  const ready: Array<{ id: string; phone: string; chatId: string | null; text: string }> = [];
  for (const row of rows) {
    const target = targets.get(row.user_id);
    if (!target?.phone || !row.payload?.text) {
      await admin.from("notification_outbox").update({ status: "failed", attempts: 5, last_error: "Sem WhatsApp vinculado" }).eq("id", row.id);
      continue;
    }
    ready.push({ id: row.id, phone: target.phone, chatId: target.chatId, text: row.payload.text });
  }
  return ready;
}

/** Confirms delivery or schedules a retry with backoff (5, 10, 15, 20 minutes). */
export async function ackNotification(id: string, ok: boolean, errorMessage?: string) {
  const admin = createAdminClient();
  if (ok) {
    await admin.from("notification_outbox").update({ status: "sent", sent_at: new Date().toISOString(), leased_until: null }).eq("id", id).eq("status", "processing");
    return;
  }
  const { data } = await admin.from("notification_outbox").select("attempts").eq("id", id).maybeSingle();
  const attempts = (data?.attempts as number | undefined) ?? 1;
  await admin
    .from("notification_outbox")
    .update({
      status: "failed",
      leased_until: null,
      last_error: (errorMessage ?? "erro").slice(0, 300),
      scheduled_for: new Date(Date.now() + attempts * 5 * 60 * 1000).toISOString(),
    })
    .eq("id", id)
    .eq("status", "processing");
}
