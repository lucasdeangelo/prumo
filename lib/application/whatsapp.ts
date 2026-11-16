import "server-only";

import { randomInt } from "node:crypto";

import { resolveTagHint } from "@/lib/domain/categorize";
import { addDays, formatDayShort, formatMonthLong, monthBounds, monthOf, todayIn } from "@/lib/domain/dates";
import { buildForecast, forecastTotals } from "@/lib/domain/forecast";
import { formatBRL } from "@/lib/domain/money";
import { normalizeText } from "@/lib/domain/normalize";
import { monthlyEquivalentCents } from "@/lib/domain/recurrence";
import { summarizeMonth } from "@/lib/domain/summary";
import { estimateAtMaturity, ratesFromSnapshot, termsFromRow } from "@/lib/domain/fixed-income";
import { describeAsset, gain, gainSince, isOpen, netIfWithdrawn, portfolioSummary } from "@/lib/domain/investments";
import { draftFromAi, parseMessage, type QueryKind, type TransactionDraft } from "@/lib/domain/whatsapp-intent";
import { requireServerEnv } from "@/lib/env.server";
import { hmacHex } from "@/lib/internal/auth";
import { listAccounts, listBills, listSubscriptions, listTags, listTransactions } from "@/lib/repositories/reads";
import { createAdminClient } from "@/lib/supabase/admin";
import { transactionLabel } from "@/lib/types";

import { markBillPaid } from "./bills";
import { goalsOverview, type GoalOverview } from "./couple-data";
import { loadAssetGoals } from "./goal-links";
import { getHousehold } from "./household";
import { loadInvestments, loadSnapshots, toPortfolioItem, type InvestmentRow } from "./investments";
import { ratesSnapshot } from "./market-rates";
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
  "📈 *investimentos* · *investimento cdb nubank* · *metas* · *meta viagem*",
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
      if (intent.query === "investments") return { kind: "reply", text: await answerInvestments(userId, intent.arg) };
      if (intent.query === "goals") return { kind: "reply", text: await answerGoals(userId, intent.arg) };
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

// ---------- Investimentos e metas ----------

const pct = (ratio: number | null) => (ratio === null ? "" : ` (${ratio >= 0 ? "+" : "−"}${Math.abs(ratio * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`);
const signed = (cents: number) => `${cents >= 0 ? "+" : "−"}${formatBRL(Math.abs(cents))}`;
const dateBR = (iso: string) => iso.split("-").reverse().join("/");

/** Best match by name: every word typed appears in the name ("cdb nubank" → "CDB Nubank 110% CDI"). */
function byName<T extends { name: string }>(items: T[], wanted: string): T | null {
  const words = normalizeText(wanted).split(" ").filter(Boolean);
  return items.find((i) => normalizeText(i.name) === normalizeText(wanted)) ?? items.find((i) => words.every((w) => normalizeText(i.name).includes(w))) ?? null;
}

/**
 * "investimentos": the person's own assets (Meu and the ones in Nosso) and the couple's Nosso.
 * The partner's "Meu" assets never appear here, whatever their visibility.
 */
async function answerInvestments(userId: string, arg?: string): Promise<string> {
  const household = await getHousehold(userId);
  const partner = household?.partner ?? null;
  const memberIds = [userId, partner?.userId].filter(Boolean) as string[];
  const rows = (await loadInvestments(memberIds)).filter((r) => r.user_id === userId || r.scope === "ours");
  const open = rows.filter(isOpen);
  if (open.length === 0) return "ℹ️ Nenhum investimento aberto ainda. Conecte o banco ou cadastre à mão em *Investimentos* no app.";

  if (arg) {
    const row = byName(open, arg);
    if (!row) return `❓ Não achei um investimento com “${arg}”. Envie *investimentos* para ver a lista.`;
    return describeInvestment(row, row.user_id === userId ? null : (partner?.name ?? "seu par"));
  }

  const mine = open.filter((r) => r.user_id === userId && (!partner || r.scope === "mine"));
  const ours = partner ? open.filter((r) => r.scope === "ours") : [];
  const shown = [...mine, ...ours];
  const summary = portfolioSummary(shown.map(toPortfolioItem));
  const snapshots = await loadSnapshots(shown.map((r) => r.id));
  const month = gainSince(snapshots, shown.map(toPortfolioItem), `${monthOf(todayIn())}-01`);
  const goals = await loadAssetGoals(shown.map((r) => r.id));
  const goalOf = (r: InvestmentRow) => (goals.get(r.id) ?? []).find((g) => g.scope === "ours" || g.ownerId === userId)?.name;
  const line = (r: InvestmentRow) => {
    const g = gain(r.amount_cents, r.invested_cents);
    const goal = goalOf(r);
    return `• ${r.name}: ${formatBRL(r.amount_cents)}${g ? ` (${signed(g.cents)})` : ""}${goal ? ` 🎯 ${goal}` : ""}`;
  };
  return [
    "📈 *Seus investimentos*",
    "",
    `💼 Patrimônio: ${formatBRL(summary.totalCents)}`,
    `💵 Aplicado: ${formatBRL(summary.investedCents)}`,
    `${summary.gainCents >= 0 ? "📈" : "📉"} Resultado: ${signed(summary.gainCents)}${pct(summary.gainRatio)}`,
    ...(month !== null ? [`🗓️ Rendeu este mês: ${signed(month)}`] : []),
    "",
    "*Onde está:*",
    ...summary.classes.map((c) => `• ${c.label}: ${formatBRL(c.cents)} (${Math.round(c.ratio * 100)}%)`),
    "",
    ...(partner && mine.length ? ["*Meu:*", ...mine.slice(0, 8).map(line), ""] : []),
    ...(partner && ours.length ? [`*Nosso (com ${partner.name}):*`, ...ours.slice(0, 8).map(line), ""] : []),
    ...(!partner ? [...mine.slice(0, 10).map(line), ""] : []),
    "Detalhes de um: *investimento cdb nubank*. Valores brutos, antes do IR.",
  ].join("\n");
}

async function describeInvestment(row: InvestmentRow, ownerName: string | null): Promise<string> {
  const today = todayIn();
  const g = gain(row.amount_cents, row.invested_cents);
  const lines = [`📈 *${row.name}*`, describeAsset(row), "", `💼 Valor hoje: ${formatBRL(row.amount_cents)}`];
  if (row.invested_cents !== null) lines.push(`💵 Aplicado: ${formatBRL(row.invested_cents)}`);
  if (g) lines.push(`${g.cents >= 0 ? "📈" : "📉"} Resultado: ${signed(g.cents)}${pct(g.ratio)}`);
  if (row.type === "FIXED_INCOME") {
    const net = netIfWithdrawn({ type: row.type, subtype: row.subtype, amountCents: row.amount_cents, investedCents: row.invested_cents, taxesCents: row.taxes_cents, since: row.issue_date, today });
    lines.push(`🏦 Se resgatar hoje: ${formatBRL(net.netCents)}${net.estimated && net.taxCents > 0 ? " (IR estimado)" : ""}`);
    const terms = termsFromRow(row);
    if (terms && row.due_date && row.due_date > today) {
      const rates = await ratesSnapshot().catch(() => null);
      if (rates) {
        const e = estimateAtMaturity({ amountCents: row.amount_cents, investedCents: row.invested_cents ?? row.amount_cents, since: row.issue_date ?? today, today, due: row.due_date, terms, rates: ratesFromSnapshot(rates), type: row.type, subtype: row.subtype });
        lines.push(`📅 No vencimento (${dateBR(row.due_date)}): ≈ ${formatBRL(e.netCents)}${e.taxRate > 0 ? ", já descontado o IR" : ""}`);
      }
    }
  } else if (row.unit_value_cents !== null && row.quantity) {
    lines.push(`🏷️ Cotação: ${formatBRL(row.unit_value_cents)} × ${row.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })}`);
  }
  lines.push("", row.source === "manual" ? (ownerName ? `Cadastrado no Prumo por ${ownerName}.` : "Cadastrado por você no Prumo.") : "Valor informado pelo banco.", "O Prumo mostra os números, não recomenda comprar ou vender.");
  return lines.join("\n");
}

/** "metas": the couple's goals and the person's own (never the partner's personal ones). */
async function answerGoals(userId: string, arg?: string): Promise<string> {
  const household = await getHousehold(userId);
  if (!household) return "ℹ️ Nenhuma meta ainda. Crie uma em *Investimentos → Minhas metas* no app.";
  const today = todayIn();
  const [ours, mine] = await Promise.all([goalsOverview(household.id, today), goalsOverview(household.id, today, { ownerId: userId })]);
  const open = (g: GoalOverview) => g.status === "active" || g.status === "pending";
  const mineOpen = mine.filter(open);
  const oursOpen = ours.filter(open);
  const all = [...mineOpen, ...oursOpen];
  if (all.length === 0) return "ℹ️ Nenhuma meta em andamento. Crie uma em *Investimentos → Minhas metas* no app.";
  const shortMonth = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
  const line = (g: GoalOverview) =>
    `• ${g.icon ? `${g.icon} ` : ""}${g.name}: ${formatBRL(g.savedCents)} de ${formatBRL(g.targetCents)} (${g.progress.percent}%)${g.earnedCents > 0 ? ` · rendeu ${formatBRL(g.earnedCents)}` : ""}${g.deadline ? ` · ${shortMonth.format(new Date(`${g.deadline}T00:00:00Z`))}` : ""}`;

  if (arg) {
    const g = byName(all, arg);
    if (!g) return `❓ Não achei uma meta com “${arg}”. Envie *metas* para ver a lista.`;
    const reach = g.progress.reachMonth ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${g.progress.reachMonth}-01T00:00:00Z`)) : null;
    return [
      `🎯 *${g.name}*${g.scope === "mine" ? " (só sua)" : household.partner ? " (do casal)" : ""}`,
      "",
      `💰 Guardado: ${formatBRL(g.savedCents)} de ${formatBRL(g.targetCents)} (${g.progress.percent}%)`,
      ...(g.investmentIds.length ? [`💵 Aplicado: ${formatBRL(g.contributedCents)} · rendeu ${signed(g.earnedCents)}`, `📈 ${g.investmentIds.length === 1 ? "1 investimento conta" : `${g.investmentIds.length} investimentos contam`} para ela`] : []),
      ...(g.status === "pending" ? ["⏳ Aguardando confirmação do casal"] : []),
      ...(reach && g.status === "active" ? [`🗓️ No ritmo atual, chega lá em ${reach}`] : []),
      ...(g.status === "active" && g.progress.extraMonthlyCents > 0 ? [`➕ Para chegar no prazo: +${formatBRL(g.progress.extraMonthlyCents)} por mês`] : []),
    ].join("\n");
  }

  return [
    "🎯 *Metas*",
    ...(mineOpen.length ? ["", household.partner ? "*Só suas:*" : "*Suas:*", ...mineOpen.map(line)] : []),
    ...(oursOpen.length ? ["", household.partner ? `*Do casal (com ${household.partner.name}):*` : "*Da casa:*", ...oursOpen.map(line)] : []),
    "",
    "Detalhes de uma: *meta viagem*.",
  ].join("\n");
}
