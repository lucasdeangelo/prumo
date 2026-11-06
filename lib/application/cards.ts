import "server-only";

import { invoiceSettlement } from "@/lib/domain/couple";
import { addMonths, todayIn } from "@/lib/domain/dates";
import { partnerMayReassign, projectForPartner, type OwnedAccount } from "@/lib/domain/visibility";
import { createAdminClient } from "@/lib/supabase/admin";

import { invoicePeriod, loadAccounts, loadCategoryNames, loadFacts, loadSplitRules, shareFor, toOwned, type AccountRow, type FactRow } from "./couple-data";
import { getHousehold, type Household } from "./household";
import { DomainError } from "./transactions";

export type InvoiceOwner = "ours" | "holder" | "partner";

/** Credit cards the viewer may see: their own, and the partner's that are not private. */
export async function householdCards(userId: string) {
  const household = await getHousehold(userId);
  const ids = [userId, household?.partner?.userId].filter(Boolean) as string[];
  const cards = (await loadAccounts(ids)).filter((a) => a.type === "CREDIT" && (a.user_id === userId || a.visibility !== "private"));
  return { household, cards };
}

export function ownerOf(fact: Pick<FactRow, "scope">): InvoiceOwner {
  return fact.scope === "ours" ? "ours" : fact.scope === "partner" ? "partner" : "holder";
}

export type InvoiceLine = {
  fact: FactRow;
  owner: InvoiceOwner;
  /** What the viewer may see of it ("detail", "category_only", "reserved"). */
  display: "detail" | "category_only" | "reserved";
  category: string;
  holderShare: number;
};

/** One card invoice (period containing `ref`, shifted by `offset` months) as the viewer may see it. */
export async function loadInvoice(viewerId: string, household: Household | null, card: AccountRow, offset = 0) {
  const today = todayIn();
  const ref = addMonths(today, offset);
  const period = invoicePeriod(card, ref);
  const [facts, categories, rules] = await Promise.all([
    loadFacts([card.user_id], period.start, period.end),
    loadCategoryNames([card.user_id]),
    household ? loadSplitRules(household.id) : Promise.resolve(new Map()),
  ]);
  const items = facts.filter((f) => f.account_id === card.id && f.transaction_date > period.start && f.transaction_date <= period.end);
  const holderIsViewer = card.user_id === viewerId;

  const lines: InvoiceLine[] = [];
  for (const fact of items) {
    const category = (fact.tag_id ? categories.get(fact.tag_id)?.name : null) ?? "Outros";
    const meShare = household ? shareFor(fact, household, rules, category, false) : 1;
    const holderShare = holderIsViewer ? meShare : 1 - meShare;
    let display: InvoiceLine["display"] = "detail";
    if (!holderIsViewer) {
      const line = projectForPartner(toOwned(fact), card, today);
      if (!line) continue;
      display = line.kind;
    }
    lines.push({ fact, owner: ownerOf(fact), display, category, holderShare });
  }

  // Totals use every fact, including what the viewer does not see, so the invoice adds up.
  const settlement = invoiceSettlement(
    items.map((fact) => {
      const category = (fact.tag_id ? categories.get(fact.tag_id)?.name : null) ?? "Outros";
      const meShare = household ? shareFor(fact, household, rules, category, false) : 1;
      return { amountCents: fact.amount_cents, type: fact.type, owner: ownerOf(fact), holderShare: holderIsViewer ? meShare : 1 - meShare };
    }),
  );
  const holderTotals = { ours: settlement.oursCents, holder: settlement.holderCents, partner: settlement.partnerCents };

  // Installments still to come, from purchases charged in this invoice.
  const ahead: number[] = [];
  for (const fact of items) {
    if (!fact.installment_number || !fact.installment_total || fact.installment_number >= fact.installment_total || fact.type !== "debit") continue;
    const remaining = fact.installment_total - fact.installment_number;
    for (let i = 0; i < remaining; i += 1) ahead[i] = (ahead[i] ?? 0) + fact.amount_cents;
  }
  const settledRow = household
    ? (await createAdminClient().from("settlements").select("amount_cents, settled_at").eq("household_id", household.id).eq("kind", "invoice").eq("reference", `${card.id}:${period.month}`).maybeSingle()).data
    : null;

  return { card, period, lines, settlement, holderTotals, holderIsViewer, installmentsAhead: ahead, settled: settledRow as { amount_cents: number; settled_at: string } | null };
}

/** Changes whose a purchase is ("Nosso", the holder's or the partner's). Either person may do it for lines they see. */
export async function setInvoiceOwner(viewerId: string, factId: string, owner: InvoiceOwner, split?: { method: "equal" | "income" | "fixed"; share?: number | null }) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("transactions")
    .select("id, user_id, account_id, amount_cents, type, transaction_date, user_description, provider_description, merchant, tag_id, scope, privacy, surprise_until, surprise_hide_amount, free_money")
    .eq("id", factId)
    .is("deleted_at", null)
    .maybeSingle();
  const fact = data as FactRow | null;
  if (!fact) throw new DomainError("Compra não encontrada.");
  const household = await getHousehold(viewerId);
  const isHolder = fact.user_id === viewerId;
  const isPartner = household?.partner?.userId === fact.user_id;
  if (!isHolder && !isPartner) throw new DomainError("Compra não encontrada.");
  if (isPartner) {
    // Moving a purchase to Nosso shows it in full, so the partner may only move what they already see
    // in full: never "category only", hidden, surprises, free money or a private/totals-only account.
    const { data: card } = fact.account_id
      ? await admin.from("accounts").select("id, name, visibility, balance_cents, type").eq("id", fact.account_id).eq("user_id", fact.user_id).maybeSingle()
      : { data: null };
    if (!partnerMayReassign(toOwned(fact), (card as OwnedAccount | null) ?? undefined, todayIn())) throw new DomainError("Compra não encontrada.");
  }
  const scope = owner === "ours" ? "ours" : owner === "partner" ? "partner" : "mine";
  const update: Record<string, unknown> = { scope };
  if (scope !== "mine") Object.assign(update, { privacy: "account", surprise_until: null, surprise_hide_amount: false, free_money: false });
  if (split) Object.assign(update, { split_method: split.method, split_share: split.method === "fixed" ? split.share ?? 0.5 : null });
  await admin.from("transactions").update(update).eq("id", factId).eq("user_id", fact.user_id);
}

/** "Usar sempre para Mercado": future purchases of the category enter as Nosso with this split. */
export async function setAutoOurs(userId: string, category: string, method: "equal" | "income" | "fixed", share: number | null) {
  const household = await getHousehold(userId);
  if (!household) return;
  await createAdminClient()
    .from("split_rules")
    .upsert({ household_id: household.id, category, method, fixed_share: method === "fixed" ? share : null, auto_ours: true }, { onConflict: "household_id,category" });
}

/** Applies "auto Nosso" categories to card purchases created since an instant (after an import). */
export async function applyAutoOurs(userId: string, createdSince: string) {
  const household = await getHousehold(userId);
  if (!household?.partner) return 0;
  const admin = createAdminClient();
  const { data: rules } = await admin.from("split_rules").select("category").eq("household_id", household.id).eq("auto_ours", true);
  const categories = new Set((rules ?? []).map((r) => r.category as string));
  if (categories.size === 0) return 0;
  const { data: tags } = await admin.from("tags").select("id, name").eq("user_id", userId);
  const tagIds = (tags ?? []).filter((t) => categories.has(t.name as string)).map((t) => t.id as string);
  if (tagIds.length === 0) return 0;
  const { data: cards } = await admin.from("accounts").select("id").eq("user_id", userId).eq("type", "CREDIT");
  const cardIds = (cards ?? []).map((c) => c.id as string);
  if (cardIds.length === 0) return 0;
  const { data } = await admin
    .from("transactions")
    .update({ scope: "ours" })
    .eq("user_id", userId)
    .eq("scope", "mine")
    .eq("privacy", "account")
    .is("surprise_until", null)
    .eq("free_money", false)
    .in("tag_id", tagIds)
    .in("account_id", cardIds)
    .gte("created_at", createdSince)
    .select("id");
  return data?.length ?? 0;
}

/** Records that the invoice settle-up was paid (the app never moves money). Idempotent per card and month. */
export async function recordInvoiceSettlement(viewerId: string, cardId: string, month: string, amountCents: number) {
  const household = await getHousehold(viewerId);
  if (!household?.partner) throw new DomainError("O acerto é entre vocês dois.");
  const admin = createAdminClient();
  const { data: card } = await admin.from("accounts").select("id, user_id").eq("id", cardId).maybeSingle();
  if (!card || (card.user_id !== viewerId && card.user_id !== household.partner.userId)) throw new DomainError("Cartão não encontrado.");
  const holder = card.user_id as string;
  const other = holder === viewerId ? household.partner.userId : viewerId;
  const { error } = await admin.from("settlements").insert({
    household_id: household.id,
    kind: "invoice",
    reference: `${cardId}:${month}`,
    from_user: other,
    to_user: holder,
    amount_cents: amountCents,
    settled_by: viewerId,
  });
  if (error && error.code !== "23505") throw new Error(`Falha ao registrar acerto: ${error.message}`);
}
