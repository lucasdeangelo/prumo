import "server-only";

import { notFound, redirect } from "next/navigation";

import { householdCards, loadInvoice, type InvoiceLine, type InvoiceOwner } from "@/lib/application/cards";
import { lastSyncAt } from "@/lib/application/couple-data";
import { requireUser } from "@/lib/auth/session";
import { firstShare, sharePercentLabel } from "@/lib/domain/couple";
import { daysBetween, formatDayShort, todayIn } from "@/lib/domain/dates";
import { buildPixPayload, maskPixKey } from "@/lib/domain/pix";
import { transactionLabel } from "@/lib/types";

import { person } from "./shared";

type Invoice = Awaited<ReturnType<typeof loadInvoice>>;

function addMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

const amountOf = (inv: Invoice) => Math.max(0, inv.totalCents);

// ---------- /cards ----------

export async function cards(_: Record<string, string>, search: Record<string, string>) {
  const { user } = await requireUser();
  const { household, cards: list } = await householdCards(user.id);
  const partner = household?.partner ?? null;
  const syncedAtIn = lastSyncAt([user.id, partner?.userId].filter(Boolean) as string[]);
  syncedAtIn.catch(() => {});
  if (list.length === 0) return { empty: true as const };

  const selectedCard = list.find((c) => c.id === search.card) ?? list[0];
  const asked = Math.max(-12, Number(search.m ?? 0) || 0);
  const early = asked <= 0;
  const load = (offset: number) => loadInvoice(user.id, household, selectedCard, offset);
  const [current, syncedAt, earlySelected, earlyPrevious] = await Promise.all([
    Promise.all(list.map((c) => loadInvoice(user.id, household, c, 0))),
    syncedAtIn,
    early && asked !== 0 ? load(asked) : Promise.resolve(null),
    early ? Promise.all([-1, -2].map((o) => load(o + asked))) : Promise.resolve(null),
  ]);
  const openInvoice = current.find((i) => i.card.id === selectedCard.id)!;
  const futureCount = Math.max(1, openInvoice.installmentsAhead.length);
  const offset = Math.min(futureCount, asked);
  const [selected, previous] = early
    ? [earlySelected ?? openInvoice, earlyPrevious!]
    : await Promise.all([offset === 0 ? openInvoice : load(offset), Promise.all([-1, -2].map((o) => load(o + offset)))]);

  const limit = list.reduce((s, c) => s + (c.credit_limit_cents ?? 0), 0);
  const available = list.reduce((s, c) => s + (c.available_limit_cents ?? 0), 0);
  const card = selected.card;
  const usedRatio = card.credit_limit_cents ? Math.max(0, (card.credit_limit_cents - (card.available_limit_cents ?? card.credit_limit_cents)) / card.credit_limit_cents) : null;
  const rows = [
    ...selected.lines.map((line) => ({
      kind: "fact" as const,
      key: line.fact.id,
      id: line.fact.id,
      date: line.fact.transaction_date,
      title: line.display === "reserved" ? "Compra reservada" : line.display === "category_only" ? line.category : transactionLabel(line.fact),
      category: line.category,
      installment: line.fact.installment_number && line.fact.installment_total ? `${line.fact.installment_number}/${line.fact.installment_total}` : null,
      cents: line.fact.amount_cents,
      credit: line.fact.type === "credit",
    })),
    ...selected.pendingLines.map((p) => ({
      kind: "pending" as const,
      key: `p-${p.item.id}`,
      id: p.item.id,
      date: p.item.transaction_date,
      title: p.item.description,
      category: p.category,
      installment: p.item.installment_number && p.item.installment_total ? `${p.item.installment_number}/${p.item.installment_total}` : null,
      cents: p.item.amount_cents,
      credit: p.item.type === "credit",
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return {
    empty: false as const,
    hasPartner: Boolean(partner),
    syncedAt,
    openTotalCents: current.reduce((s, i) => s + amountOf(i), 0),
    limitCents: limit,
    availableCents: available,
    selectedCardId: selectedCard.id,
    offset,
    cards: current.map((inv) => {
      const owner = (inv.card.user_id === user.id ? household?.me : partner) ?? null;
      return {
        id: inv.card.id,
        name: inv.card.institution ?? inv.card.name,
        owner: owner && partner ? person(owner) : null,
        caption: `Fatura aberta${inv.card.partner_card_last4 && partner ? ` · adicional de ${inv.card.user_id === user.id ? partner.name : household!.me.name}` : ""} · ${inv.card.card_last4 ? `•• ${inv.card.card_last4} · ` : ""}vence ${formatDayShort(inv.period.due)}`,
        amountCents: amountOf(inv),
      };
    }),
    tabs: [-1, 0, 1].map((o) => o + offset).filter((o) => o <= futureCount).map((o) => ({ offset: o, month: o === offset ? selected.period.month : addMonthKey(selected.period.month, o - offset) })),
    invoice: {
      month: selected.period.month,
      status: selected.period.status,
      amountCents: amountOf(selected),
      carriedCents: selected.carriedCents,
      paymentsCents: selected.paymentsCents,
      purchasesCents: selected.totalCents - selected.carriedCents,
      closeEstimated: selected.period.closeEstimated,
      end: selected.period.end,
      due: selected.period.due,
      usedRatio,
      cardAvailableCents: card.available_limit_cents ?? 0,
      cardId: card.id,
      rows,
      cancelled: selected.cancelledLines.map((c) => ({ id: c.id, description: c.description, amount_cents: c.amount_cents })),
      pendingCount: selected.pendingLines.length,
    },
    upcoming: offset === 0 ? openInvoice.installmentsAhead.map((cents, i) => ({ offset: i + 1, month: addMonthKey(openInvoice.period.month, i + 1), cents })).filter((u) => u.cents > 0) : [],
    previous: previous.map((inv, i) => ({ offset: offset + (i === 0 ? -1 : -2), month: inv.period.month, due: inv.period.due, settled: Boolean(inv.settled), amountCents: amountOf(inv) })),
  };
}

async function cardContext(id: string, m: string | undefined) {
  const { user } = await requireUser();
  const { household, cards: list } = await householdCards(user.id);
  if (!household?.partner) redirect("/couple");
  const card = list.find((c) => c.id === id);
  if (!card) notFound();
  const offset = Number(m ?? 0) || 0;
  const invoice = await loadInvoice(user.id, household, card, offset);
  const holder = card.user_id === user.id ? household.me : household.partner;
  const other = card.user_id === user.id ? household.partner : household.me;
  return { user, household, partner: household.partner, card, offset, invoice, holder, other };
}

// ---------- /cards/[id]/batch ----------

export async function cardBatch({ id }: Record<string, string>, search: Record<string, string>) {
  const { card, offset, invoice, holder, other } = await cardContext(id, search.m);
  return {
    cardId: card.id,
    offset,
    holder: holder.name,
    other: other.name,
    incomeShare: firstShare("income", [holder.incomeCents, other.incomeCents]),
    items: invoice.lines
      .filter((l) => l.display === "detail" && l.fact.type === "debit")
      .map((l) => ({ id: l.fact.id, label: transactionLabel(l.fact), detail: `${formatDayShort(l.fact.transaction_date)} · ${l.category}`, amountCents: l.fact.amount_cents, category: l.category })),
  };
}

// ---------- /cards/[id]/settle ----------

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

export async function cardSettle({ id }: Record<string, string>, search: Record<string, string>) {
  const { user, household, partner, card, offset, invoice, holder, other } = await cardContext(id, search.m);
  const amount = invoice.settlement.partnerOwesCents;
  const month = monthName.format(new Date(`${invoice.period.month}-01T00:00:00Z`));
  const shares = [...new Set(invoice.lines.filter((l) => l.owner === "ours").map((l) => sharePercentLabel(l.holderShare)))];
  const pix = holder.pixKey && amount > 0
    ? buildPixPayload({ key: holder.pixKey, amountCents: amount, name: holder.name, description: `Prumo fatura ${month.slice(0, 3)}`, txid: `PRUMO${invoice.period.month.replace("-", "")}` })
    : null;
  return {
    cardId: card.id,
    offset,
    me: person(household.me),
    partner: person(partner),
    holder: person(holder),
    other: person(other),
    holderIsMe: holder === household.me,
    viewerIsHolder: card.user_id === user.id,
    hasAdditional: Boolean(card.partner_card_last4),
    monthKey: invoice.period.month,
    month,
    due: invoice.period.due,
    amountCents: amount,
    totalCents: Math.max(0, invoice.totalCents),
    partnerShareOfOursCents: invoice.settlement.partnerShareOfOursCents,
    partnerPurchasesCents: invoice.holderTotals.partner,
    sharesLabel: shares.length === 1 ? shares[0] : null,
    pix,
    pixKeyMasked: holder.pixKey ? maskPixKey(holder.pixKey) : null,
    settledAt: invoice.settled ? invoice.settled.settled_at.slice(0, 10) : null,
  };
}

// ---------- /cards/[id]/split ----------

const NEXT: Record<InvoiceOwner, InvoiceOwner> = { ours: "holder", holder: "partner", partner: "ours" };

export async function cardSplit({ id }: Record<string, string>, search: Record<string, string>) {
  const { user, household, partner, card, offset, invoice, holder, other } = await cardContext(id, search.m);
  const who = (owner: InvoiceOwner) => (owner === "ours" ? null : owner === "holder" ? holder : other);
  const syncedAt = await lastSyncAt([card.user_id]);
  const groups: Array<{ owner: InvoiceOwner; title: string; total: number; lines: InvoiceLine[] }> = [
    { owner: "ours", title: `Nosso · ${sharePercentLabel(invoice.lines.find((l) => l.owner === "ours")?.holderShare ?? (holder === household.me ? household.myShare : 1 - household.myShare))}`, total: invoice.holderTotals.ours, lines: [] },
    { owner: "holder", title: `De ${holder.name}`, total: invoice.holderTotals.holder, lines: [] },
    { owner: "partner", title: `De ${other.name}${card.partner_card_last4 ? ` · adicional •• ${card.partner_card_last4}` : ""}`, total: invoice.holderTotals.partner, lines: [] },
  ];
  for (const line of invoice.lines) groups.find((g) => g.owner === line.owner)!.lines.push(line);
  const nextName = (o: InvoiceOwner) => (NEXT[o] === "ours" ? "Nosso" : NEXT[o] === "holder" ? holder.name : other.name);

  return {
    cardId: card.id,
    offset,
    me: person(household.me),
    partner: person(partner),
    holder: person(holder),
    other: person(other),
    title: `Fatura ${card.institution ?? card.name}${card.card_last4 ? ` •• ${card.card_last4}` : ""}`,
    syncedAt,
    dueIn: daysBetween(todayIn(), invoice.period.due),
    due: invoice.period.due,
    closed: invoice.period.closed,
    closeEstimated: invoice.period.closeEstimated,
    end: invoice.period.end,
    settlementTotalCents: invoice.settlement.totalCents,
    totalCents: invoice.totalCents,
    carriedCents: invoice.carriedCents,
    pendingCount: invoice.pendingLines.length,
    holderTotals: invoice.holderTotals,
    partnerOwesCents: invoice.settlement.partnerOwesCents,
    settled: Boolean(invoice.settled),
    month: invoice.period.month,
    installmentsAhead: invoice.installmentsAhead,
    installmentPurchases: invoice.lines.filter((l) => l.fact.installment_number && l.fact.installment_total && l.fact.installment_number < l.fact.installment_total).length,
    groups: groups.map((g) => ({
      owner: g.owner,
      title: g.title,
      total: g.total,
      lines: g.lines.map((line) => {
        const p = who(line.owner);
        const remaining = line.fact.installment_number && line.fact.installment_total ? line.fact.installment_total - line.fact.installment_number : 0;
        return {
          id: line.fact.id,
          title:
            (line.display === "reserved" ? `Compra reservada por ${p?.name ?? holder.name}` : line.display === "category_only" ? line.category : transactionLabel(line.fact)) +
            (line.fact.installment_number && line.fact.installment_total ? ` ${line.fact.installment_number}/${line.fact.installment_total}` : ""),
          remaining,
          date: line.fact.transaction_date,
          freeMoney: line.fact.free_money,
          category: line.category,
          categoryOnlyMine: line.display === "category_only" && line.fact.user_id === user.id,
          cents: line.fact.amount_cents,
          credit: line.fact.type === "credit",
          who: p ? person(p) : null,
          canChange: line.display !== "reserved" && (line.fact.user_id === user.id || line.owner !== "holder" || line.display === "detail"),
          next: NEXT[line.owner],
          nextName: nextName(line.owner),
        };
      }),
    })),
  };
}
