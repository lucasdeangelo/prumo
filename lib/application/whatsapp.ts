import "server-only";

import { randomInt } from "node:crypto";

import { resolveTagHint } from "@/lib/domain/categorize";
import { addDays, formatDayShort, formatMonthLong, monthBounds, monthOf, todayIn } from "@/lib/domain/dates";
import { buildForecast, forecastTotals } from "@/lib/domain/forecast";
import { formatBRL } from "@/lib/domain/money";
import { normalizeText } from "@/lib/domain/normalize";
import { monthlyEquivalentCents } from "@/lib/domain/recurrence";
import { summarizeMonth } from "@/lib/domain/summary";
import { draftFromAi, parseMessage, type QueryKind, type TransactionDraft } from "@/lib/domain/whatsapp-intent";
import { requireServerEnv } from "@/lib/env.server";
import { hmacHex } from "@/lib/internal/auth";
import { listAccounts, listBills, listSubscriptions, listTags, listTransactions } from "@/lib/repositories/reads";
import { createAdminClient } from "@/lib/supabase/admin";
import { transactionLabel } from "@/lib/types";

import { markBillPaid } from "./bills";
import { categorizeFor, createTransaction } from "./transactions";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_TTL_MS = 15 * 60 * 1000;

function hashCode(code: string): string {
  return hmacHex(requireServerEnv("INTERNAL_API_SECRET"), `whatsapp-link:${code}`);
}

/** "5511999990001@c.us" or "11 99999-0001" -> "+5511999990001" (assumes Brazil without country code). */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/@.*$/, "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

/** Issues a single-use, 15-minute code. The user sends "vincular CODE" from their own WhatsApp. */
export async function createLinkCode(userId: string) {
  const admin = createAdminClient();
  const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  await admin.from("whatsapp_links").update({ revoked_at: new Date().toISOString(), verification_code_hash: null }).eq("user_id", userId).is("verified_at", null).is("revoked_at", null);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const { error } = await admin.from("whatsapp_links").insert({ user_id: userId, verification_code_hash: hashCode(code), verification_expires_at: expiresAt });
  if (error) throw new Error(`Falha ao gerar código: ${error.message}`);
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt };
}

export async function unlinkWhatsapp(userId: string) {
  await createAdminClient().from("whatsapp_links").update({ revoked_at: new Date().toISOString(), verification_code_hash: null }).eq("user_id", userId).is("revoked_at", null);
}

/** Binds the sender's phone to the code owner. The phone is proven by WhatsApp itself. */
export async function redeemLinkCode(phone: string, code: string, chatId?: string | null): Promise<{ ok: boolean; text: string }> {
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("whatsapp_links")
    .select("id, user_id, verification_expires_at")
    .eq("verification_code_hash", hashCode(code.toUpperCase()))
    .is("verified_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (!link || new Date(link.verification_expires_at as string).getTime() < Date.now()) {
    return { ok: false, text: "❌ Código inválido ou expirado. Gere um novo em *Ajustes → WhatsApp* no app." };
  }
  const now = new Date().toISOString();
  // A phone belongs to one account; a new verification replaces any older link on either side.
  await admin.from("whatsapp_links").update({ revoked_at: now }).eq("phone_normalized", phone).is("revoked_at", null);
  await admin.from("whatsapp_links").update({ revoked_at: now }).eq("user_id", link.user_id).not("verified_at", "is", null).is("revoked_at", null);
  const { error } = await admin
    .from("whatsapp_links")
    .update({ phone_normalized: phone, chat_id: chatId ?? null, verified_at: now, verification_code_hash: null, last_message_at: now })
    .eq("id", link.id);
  if (error) throw new Error(`Falha ao vincular: ${error.message}`);
  return { ok: true, text: "✅ WhatsApp vinculado ao Prumo!\n\n" + HELP_TEXT };
}

/** Owner of a verified link. Also records the chat id, so reminders reach links made before it existed. */
export async function userForPhone(phone: string, chatId?: string | null): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_links")
    .select("id, user_id, chat_id")
    .eq("phone_normalized", phone)
    .not("verified_at", "is", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  const update: Record<string, string> = { last_message_at: new Date().toISOString() };
  if (chatId && chatId !== data.chat_id) update.chat_id = chatId;
  await admin.from("whatsapp_links").update(update).eq("id", data.id);
  return data.user_id as string;
}

export const HELP_TEXT = [
  "*Como usar o Prumo no WhatsApp*",
  "",
  "💸 *gastei 45,90 no mercado*",
  "💰 *recebi 3500 salário*",
  "📅 *paguei 120 luz ontem* · *gastei 80 farmácia dia 28*",
  "🏷️ Use #tag para escolher: *gastei 30 uber #transporte*",
  "✅ *paguei aluguel* — quita uma conta futura pelo nome",
  "",
  "📊 *resumo* · *saldo* · *contas* · *assinaturas* · *últimas*",
].join("\n");

export type ProposedAction =
  | { kind: "transaction"; draft: TransactionDraft; tagId: string | null }
  | { kind: "pay_bill"; billId: string };

export type InterpretResult =
  | { kind: "reply"; text: string }
  | { kind: "confirm"; text: string; action: ProposedAction }
  | { kind: "needs_ai" };

async function describeDraft(userId: string, draft: TransactionDraft): Promise<{ text: string; tagId: string | null }> {
  const tags = await listTags(createAdminClient(), userId);
  const tagId = resolveTagHint(draft.tagHint, tags) ?? (await categorizeFor(userId, { description: draft.description, type: draft.type }))?.tagId ?? null;
  const tagName = tags.find((t) => t.id === tagId)?.name ?? "sem tag";
  const title = draft.type === "credit" ? "💰 *Confirmar entrada*" : "💸 *Confirmar saída*";
  const text = [
    title,
    "",
    `*Valor:* ${formatBRL(draft.amountCents)}`,
    `*Descrição:* ${draft.description}`,
    `*Tag:* ${tagName}`,
    `*Data:* ${formatDayShort(draft.date)}`,
    "",
    "Responda ✅ *sim* para salvar ou ❌ *nao* para cancelar.",
  ].join("\n");
  return { text, tagId };
}

/** Turns a message (or a validated AI draft) into a reply or a proposal. Never writes. */
export async function interpret(userId: string, text: string, aiOutput?: unknown): Promise<InterpretResult> {
  const today = todayIn();
  if (aiOutput !== undefined) {
    const draft = draftFromAi(aiOutput, today);
    if (!draft) return { kind: "reply", text: "❓ Não entendi. Tente: *gastei 45,90 no mercado* ou envie *ajuda*." };
    const { text: confirmation, tagId } = await describeDraft(userId, draft);
    return { kind: "confirm", text: confirmation, action: { kind: "transaction", draft, tagId } };
  }

  const intent = parseMessage(text, today);
  switch (intent.kind) {
    case "help":
      return { kind: "reply", text: HELP_TEXT };
    case "link":
      return { kind: "reply", text: "ℹ️ Este WhatsApp já está vinculado." };
    case "query":
      return { kind: "reply", text: await answerQuery(userId, intent.query) };
    case "transaction": {
      const { text: confirmation, tagId } = await describeDraft(userId, intent.draft);
      return { kind: "confirm", text: confirmation, action: { kind: "transaction", draft: intent.draft, tagId } };
    }
    case "needs_ai":
      return { kind: "needs_ai" };
    case "unknown": {
      const bill = await findBillByName(userId, text);
      if (bill) {
        return {
          kind: "confirm",
          text: `✅ *Quitar conta*\n\n*${bill.description}* — ${formatBRL(bill.amount_cents)}, vencimento ${formatDayShort(bill.due_date)}.\n\nResponda *sim* para marcar como paga ou *nao* para cancelar.`,
          action: { kind: "pay_bill", billId: bill.id },
        };
      }
      return { kind: "reply", text: "❓ Não entendi. Envie *ajuda* para ver os comandos." };
    }
  }
}

async function findBillByName(userId: string, text: string) {
  const normalized = normalizeText(text);
  const match = /^(?:paguei|pago|quitei|recebi)\s+(?:a |o |conta de |conta do |conta da )?(.+)$/.exec(normalized);
  if (!match) return null;
  const wanted = match[1].trim();
  const bills = await listBills(createAdminClient(), userId, { status: ["pending", "overdue"], to: addDays(todayIn(), 31) });
  const found = bills.filter((b) => normalizeText(b.description).includes(wanted) || wanted.includes(normalizeText(b.description)));
  return found.length >= 1 ? found[0] : null;
}

/** Performs a confirmed proposal. The WhatsApp message id makes retries idempotent. */
export async function execute(userId: string, action: ProposedAction, messageId: string): Promise<string> {
  if (action.kind === "pay_bill") {
    const result = await markBillPaid(userId, action.billId, null, "whatsapp");
    return result.already_paid ? "ℹ️ Essa conta já estava paga." : "✅ Conta marcada como paga.";
  }
  const { draft } = action;
  const tags = await listTags(createAdminClient(), userId);
  // A #tag chosen by the user is kept as the user's choice; otherwise categorize again so the
  // stored source says "automatic" (the deterministic result matches what was confirmed).
  const tagId = draft.tagHint && action.tagId && tags.some((t) => t.id === action.tagId) ? action.tagId : null;
  const result = await createTransaction(
    userId,
    { type: draft.type, amountCents: draft.amountCents, description: draft.description, date: draft.date, tagId },
    { source: "whatsapp", externalReference: `wa:${messageId}` },
  );
  if (result.replayed) return "ℹ️ Essa movimentação já tinha sido salva.";
  const { start, end } = monthBounds(monthOf(todayIn()));
  const month = await listTransactions(createAdminClient(), userId, { from: start, to: end, type: "debit", columns: "amount_cents, type, transaction_date, tag_id" });
  const summary = summarizeMonth(month, tags, monthOf(todayIn()));
  const saved = `✅ Salvo! ${draft.type === "credit" ? "Entrada" : "Saída"} de ${formatBRL(draft.amountCents)}.\n📉 Gastos no mês: ${formatBRL(summary.expenseCents)}`;
  const hint = result.detectedSubscriptions.length
    ? `\n\n🔁 *${result.detectedSubscriptions.join(", ")}* parece assinatura. Confirme em *Assinaturas* no app para entrar nas contas futuras e nos avisos.`
    : "";
  return saved + hint;
}

async function answerQuery(userId: string, query: QueryKind): Promise<string> {
  const admin = createAdminClient();
  const today = todayIn();
  const month = monthOf(today);

  if (query === "summary") {
    const { start, end } = monthBounds(month);
    const [txs, tags] = await Promise.all([listTransactions(admin, userId, { from: start, to: end }), listTags(admin, userId)]);
    const s = summarizeMonth(txs, tags, month);
    const top = s.expenseByTag.slice(0, 5).map((row) => `• ${tags.find((t) => t.id === row.tagId)?.name ?? "Sem tag"}: ${formatBRL(row.cents)}`);
    return [`📊 *Resumo de ${formatMonthLong(month)}*`, "", `💰 Entradas: ${formatBRL(s.incomeCents)}`, `💸 Saídas: ${formatBRL(s.expenseCents)}`, `🟰 Saldo do mês: ${formatBRL(s.netCents)}`, ...(top.length ? ["", "*Maiores gastos:*", ...top] : [])].join("\n");
  }

  if (query === "balance") {
    const accounts = await listAccounts(admin, userId);
    const withBalance = accounts.filter((a) => a.balance_cents !== null);
    if (withBalance.length === 0) return "ℹ️ Nenhuma conta com saldo. Conecte um banco em *Ajustes* no app.";
    const total = withBalance.reduce((sum, a) => sum + (a.balance_cents ?? 0), 0);
    return ["🏦 *Saldos informados pelos bancos*", "", ...withBalance.map((a) => `• ${a.name}: ${formatBRL(a.balance_cents ?? 0)}`), "", `*Total:* ${formatBRL(total)}`].join("\n");
  }

  if (query === "upcoming") {
    const [bills, subs] = await Promise.all([listBills(admin, userId, { status: ["pending", "overdue"] }), listSubscriptions(admin, userId)]);
    const items = buildForecast({ bills, subscriptions: subs, today, to: addDays(today, 30) }).filter((i) => i.state !== "predicted" || i.kind === "subscription");
    if (items.length === 0) return "🎉 Nada a pagar nos próximos 30 dias.";
    const lines = items.slice(0, 15).map((i) => `${i.state === "overdue" ? "⚠️" : i.direction === "in" ? "💰" : "•"} ${formatDayShort(i.date)} — ${i.description}: ${formatBRL(i.amountCents)}`);
    return ["📅 *Próximos 30 dias*", "", ...lines, "", `*A pagar:* ${formatBRL(forecastTotals(items).outCents)}`].join("\n");
  }

  if (query === "subscriptions") {
    const subs = (await listSubscriptions(admin, userId)).filter((s) => s.status === "active");
    if (subs.length === 0) return "ℹ️ Nenhuma assinatura ativa.";
    const monthly = subs.reduce((sum, s) => sum + monthlyEquivalentCents(s.amount_cents, s.frequency), 0);
    return ["🔁 *Assinaturas ativas*", "", ...subs.map((s) => `• ${s.name}: ${formatBRL(s.amount_cents)}${s.next_charge_date ? ` (próx. ${formatDayShort(s.next_charge_date)})` : ""}`), "", `*Por mês:* ${formatBRL(monthly)}`].join("\n");
  }

  const recent = await listTransactions(admin, userId, { limit: 8 });
  if (recent.length === 0) return "ℹ️ Nenhuma movimentação ainda.";
  return ["🧾 *Últimas movimentações*", "", ...recent.map((t) => `${t.type === "credit" ? "💰" : "💸"} ${formatDayShort(t.transaction_date)} ${transactionLabel(t)}: ${formatBRL(t.amount_cents)}`)].join("\n");
}

/** Prompt for the small local model. Kept short so a 1B model stays fast and on-format. */
export const AI_SYSTEM_PROMPT = `Extraia UMA movimentação financeira da mensagem e responda APENAS JSON válido, sem markdown:
{"tipo":"saida"|"entrada","valor":number,"descricao":string,"categoria":string|null,"data":"YYYY-MM-DD"|null}
Use "saida" para gastos/pagamentos e "entrada" para recebimentos. "valor" em reais, ponto decimal. "descricao" curta (até 5 palavras). Não invente valores.`;
