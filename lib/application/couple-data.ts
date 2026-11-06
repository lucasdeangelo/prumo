import "server-only";

import { addMonthKey, carriedFrom, dueDateFor, isCardPayment, netCents, openBillMonth, withoutInternalPairs } from "@/lib/domain/card-invoice";
import { budgetStatus, firstShare, freeMoneyStatus, goalProgress, invoiceSettlement, type SplitMethod } from "@/lib/domain/couple";
import { addDays, addMonths, monthBounds, todayIn } from "@/lib/domain/dates";
import { partnerAccountsView, type OwnedAccount, type OwnedTransaction } from "@/lib/domain/visibility";
import { createAdminClient } from "@/lib/supabase/admin";
import { BILL_COLUMNS, SUBSCRIPTION_COLUMNS, TAG_COLUMNS, TRANSACTION_COLUMNS, transactionLabel, type Subscription, type Tag, type Transaction, type UpcomingBill } from "@/lib/types";

import { freeMoneyAllowance, getHousehold, type Household } from "./household";

// Every query below filters by the household's own member ids, never by client input.

export type FactRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  amount_cents: number;
  type: "credit" | "debit";
  transaction_date: string;
  user_description: string | null;
  provider_description: string | null;
  merchant: string | null;
  normalized_merchant: string | null;
  tag_id: string | null;
  scope: "mine" | "ours" | "partner";
  privacy: "account" | "category_only" | "hidden";
  surprise_until: string | null;
  surprise_hide_amount: boolean;
  free_money: boolean;
  card_last4: string | null;
  installment_number: number | null;
  installment_total: number | null;
  /** Invoice month reported by the bank for card purchases ("2026-12"). */
  bill_month: string | null;
  split_method: SplitMethod | null;
  split_share: number | null;
  source: string;
};

const FACT_COLUMNS =
  "id, user_id, account_id, amount_cents, type, transaction_date, user_description, provider_description, merchant, normalized_merchant, tag_id, scope, privacy, surprise_until, surprise_hide_amount, free_money, card_last4, installment_number, installment_total, bill_month, split_method, split_share, source";

export type AccountRow = OwnedAccount & {
  user_id: string;
  institution: string | null;
  subtype: string | null;
  is_manual: boolean;
  balance_synced_at: string | null;
  credit_limit_cents: number | null;
  available_limit_cents: number | null;
  bill_close_date: string | null;
  bill_due_date: string | null;
  overdraft_limit_cents: number | null;
  overdraft_used_cents: number | null;
  card_last4: string | null;
  partner_card_last4: string | null;
  pluggy_item_id: string | null;
  import_enabled: boolean;
};

const ACCOUNT_COLUMNS =
  "id, user_id, name, type, subtype, institution, visibility, balance_cents, balance_synced_at, is_manual, credit_limit_cents, available_limit_cents, bill_close_date, bill_due_date, overdraft_limit_cents, overdraft_used_cents, card_last4, partner_card_last4, pluggy_item_id, import_enabled";

export async function loadFacts(userIds: string[], from: string, to: string): Promise<FactRow[]> {
  const { data, error } = await createAdminClient()
    .from("transactions")
    .select(FACT_COLUMNS)
    .in("user_id", userIds)
    .is("deleted_at", null)
    .gte("transaction_date", from)
    .lte("transaction_date", to)
    .order("transaction_date", { ascending: false })
    .limit(6000);
  if (error) throw new Error(`Falha ao carregar movimentações: ${error.message}`);
  return (data ?? []) as FactRow[];
}

export async function loadAccounts(userIds: string[]): Promise<AccountRow[]> {
  const { data, error } = await createAdminClient().from("accounts").select(ACCOUNT_COLUMNS).in("user_id", userIds).is("archived_at", null).order("name");
  if (error) throw new Error(`Falha ao carregar contas: ${error.message}`);
  return (data ?? []) as AccountRow[];
}

/** Tag id → name across both people: the couple's shared category vocabulary. */
export async function loadCategoryNames(userIds: string[]) {
  const { data } = await createAdminClient().from("tags").select("id, name, color, excluded_from_totals").in("user_id", userIds);
  const byId = new Map((data ?? []).map((t) => [t.id as string, { name: t.name as string, color: t.color as string | null, excluded: t.excluded_from_totals as boolean }]));
  return byId;
}

export function toOwned(fact: FactRow): OwnedTransaction {
  return {
    id: fact.id,
    account_id: fact.account_id,
    amount_cents: fact.amount_cents,
    type: fact.type,
    transaction_date: fact.transaction_date,
    label: transactionLabel(fact),
    tag_id: fact.tag_id,
    scope: fact.scope,
    privacy: fact.privacy,
    surprise_until: fact.surprise_until,
    surprise_hide_amount: fact.surprise_hide_amount,
    free_money: fact.free_money,
  };
}

export async function lastSyncAt(userIds: string[]): Promise<string | null> {
  const { data } = await createAdminClient().from("pluggy_items").select("last_sync_at").in("user_id", userIds).is("deleted_at", null).order("last_sync_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.last_sync_at as string | undefined) ?? null;
}

/** Household share of the first member for a shared fact: its own split, its category rule, the default. */
export function shareFor(fact: FactRow, household: Household, rules: Map<string, { method: SplitMethod; fixedShare: number | null }>, category: string | null, firstIsOwner: boolean) {
  const incomes: [number | null, number | null] = [household.me.incomeCents, household.partner?.incomeCents ?? null];
  let share: number;
  if (fact.split_method) share = firstShare(fact.split_method, incomes, fact.split_share);
  else if (category && rules.has(category)) {
    const rule = rules.get(category)!;
    share = firstShare(rule.method, incomes, rule.fixedShare);
  } else share = household.myShare;
  // `share` is the share of "me"; callers sometimes need the owner's.
  return firstIsOwner && fact.user_id !== household.me.userId ? 1 - share : share;
}

export async function loadSplitRules(householdId: string) {
  const { data } = await createAdminClient().from("split_rules").select("category, method, fixed_share").eq("household_id", householdId);
  return new Map<string, { method: SplitMethod; fixedShare: number | null }>((data ?? []).map((r) => [r.category as string, { method: r.method as SplitMethod, fixedShare: (r.fixed_share as number | null) ?? null }]));
}

export async function loadBudgets(householdId: string) {
  const { data } = await createAdminClient().from("household_budgets").select("category, amount_cents").eq("household_id", householdId).order("amount_cents", { ascending: false });
  return (data ?? []).map((b) => ({ category: b.category as string, limitCents: b.amount_cents as number }));
}

/** Shared ("Nosso") spending of the month by category, from both people. Transfers stay out. */
export function sharedSpendingByCategory(facts: FactRow[], categories: Map<string, { name: string; excluded: boolean }>) {
  const totals: Record<string, number> = {};
  for (const fact of facts) {
    if (fact.scope !== "ours" || fact.type !== "debit") continue;
    const category = fact.tag_id ? categories.get(fact.tag_id) : undefined;
    if (category?.excluded) continue;
    const name = category?.name ?? "Outros";
    totals[name] = (totals[name] ?? 0) + fact.amount_cents;
  }
  return totals;
}

export async function budgetOverview(householdId: string, facts: FactRow[], categories: Map<string, { name: string; excluded: boolean }>) {
  const budgets = await loadBudgets(householdId);
  const spent = sharedSpendingByCategory(facts, categories);
  const lines = budgets.map((b) => budgetStatus({ category: b.category, limitCents: b.limitCents, spentCents: spent[b.category] ?? 0 }));
  const limit = lines.reduce((s, l) => s + l.limitCents, 0);
  const used = lines.reduce((s, l) => s + l.spentCents, 0);
  return { lines, limitCents: limit, usedCents: used, freeCents: limit - used };
}

export async function goalsOverview(householdId: string, today: string) {
  const admin = createAdminClient();
  const { data: goals } = await admin.from("goals").select("id, name, icon, target_cents, deadline, status, method, created_at, completed_at").eq("household_id", householdId).order("created_at");
  const ids = (goals ?? []).map((g) => g.id as string);
  const [{ data: contributions }, { data: members }] = await Promise.all([
    ids.length ? admin.from("goal_contributions").select("goal_id, user_id, amount_cents, contributed_on, automatic").in("goal_id", ids) : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ids.length ? admin.from("goal_members").select("goal_id, user_id, percent, monthly_cents, confirmed_at").in("goal_id", ids) : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const since = addMonths(`${today.slice(0, 7)}-01`, -3);
  return (goals ?? []).map((goal) => {
    const own = (contributions ?? []).filter((c) => c.goal_id === goal.id) as Array<{ user_id: string; amount_cents: number; contributed_on: string; automatic: boolean }>;
    const saved = own.reduce((s, c) => s + c.amount_cents, 0);
    const byUser: Record<string, number> = {};
    for (const c of own) byUser[c.user_id] = (byUser[c.user_id] ?? 0) + c.amount_cents;
    const recent = own.filter((c) => c.contributed_on >= since).reduce((s, c) => s + c.amount_cents, 0);
    const goalMembers = (members ?? []).filter((m) => m.goal_id === goal.id) as Array<{ user_id: string; percent: number | null; monthly_cents: number | null; confirmed_at: string | null }>;
    const plannedMonthly = goalMembers.reduce((s, m) => s + (m.monthly_cents ?? 0), 0);
    const pace = recent > 0 ? Math.round(recent / 3) : plannedMonthly;
    return {
      id: goal.id as string,
      name: goal.name as string,
      icon: goal.icon as string | null,
      targetCents: goal.target_cents as number,
      deadline: goal.deadline as string | null,
      status: goal.status as "pending" | "active" | "done" | "archived",
      completedAt: goal.completed_at as string | null,
      savedCents: saved,
      byUser,
      members: goalMembers,
      monthlyPaceCents: pace,
      progress: goalProgress({ targetCents: goal.target_cents as number, savedCents: saved, monthlyPaceCents: pace, deadline: goal.deadline as string | null, today }),
    };
  });
}

/** The shared view of every card account in the household for the open invoice. */
export async function cardInvoices(household: Household, accounts: AccountRow[], today: string) {
  const memberIds = [household.me.userId, household.partner?.userId].filter(Boolean) as string[];
  const cards = accounts.filter((a) => a.type === "CREDIT" && (a.user_id === household.me.userId || a.visibility !== "private"));
  if (cards.length === 0) return [];
  const [rules, categories, windows] = await Promise.all([
    loadSplitRules(household.id),
    loadCategoryNames(memberIds),
    Promise.all(cards.map((card) => resolveInvoice(card, 0, today))),
  ]);
  return cards.map((card, i) => {
    const { period, items, totalCents, pending } = windows[i];
    const holderIsMe = card.user_id === household.me.userId;
    const settlement = invoiceSettlement(
      items.map((f) => {
        const category = f.tag_id ? categories.get(f.tag_id)?.name ?? null : null;
        const meShare = shareFor(f, household, rules, category, false);
        return {
          amountCents: f.amount_cents,
          type: f.type,
          owner: f.scope === "ours" ? "ours" : f.scope === "partner" ? "partner" : "holder",
          holderShare: holderIsMe ? meShare : 1 - meShare,
        };
      }),
    );
    return { card, holderIsMe, period, items, pending, settlement, totalCents };
  });
}

export type PendingCardItem = {
  id: string;
  bill_month: string;
  transaction_date: string;
  description: string;
  amount_cents: number;
  type: "credit" | "debit";
  tag_id: string | null;
  card_last4: string | null;
  installment_number: number | null;
  installment_total: number | null;
  /** The store refunded the purchase; the bank still lists this installment as scheduled. */
  cancelled_by_refund: boolean;
};

export type InvoiceWindow = {
  period: {
    start: string;
    /** Close date; estimated when the bank does not report it. */
    end: string;
    due: string;
    /** Invoice month = due month ("2026-12"). */
    month: string;
    status: "closed" | "open" | "future";
    closed: boolean;
    closeEstimated: boolean;
  };
  /** Confirmed purchases, refunds and charges of this invoice, without payments. */
  items: FactRow[];
  /** Items the bank still shows as pending (open invoice, scheduled installments). */
  pending: PendingCardItem[];
  /** Scheduled installments of refunded purchases: shown, never counted. */
  cancelled: PendingCardItem[];
  paymentsCents: number;
  /** Unpaid rest of the previous invoice, rolled into this one (open invoice). */
  carriedCents: number;
  /** The bank's total for a closed invoice; otherwise what is known so far. */
  totalCents: number;
  /** Installment totals of the following invoices already scheduled by the bank. */
  ahead: Array<{ month: string; cents: number }>;
};

const PENDING_COLUMNS = "id, bill_month, transaction_date, description, amount_cents, type, tag_id, card_last4, installment_number, installment_total, cancelled_by_refund";

/**
 * One invoice of a card, `offset` months from the open one. Cards connected through Open Finance
 * use the invoice the bank assigned to each item and the bank's closed totals; manual cards use
 * the close/due dates (or the calendar month).
 */
export async function resolveInvoice(card: AccountRow, offset: number, today: string): Promise<InvoiceWindow> {
  const admin = createAdminClient();
  const [{ data: bills }, { data: latest }, { data: pendingRows }] = await Promise.all([
    admin.from("card_bills").select("bill_month, due_date, total_cents, payments_cents").eq("account_id", card.id).eq("user_id", card.user_id).order("bill_month", { ascending: false }).limit(24),
    admin.from("transactions").select("bill_month").eq("account_id", card.id).eq("user_id", card.user_id).not("bill_month", "is", null).is("deleted_at", null).order("bill_month", { ascending: false }).limit(1),
    admin.from("card_pending_items").select(PENDING_COLUMNS).eq("account_id", card.id).eq("user_id", card.user_id).order("transaction_date", { ascending: false }).limit(1000),
  ]);
  const closed = (bills ?? []) as Array<{ bill_month: string; due_date: string; total_cents: number; payments_cents: number }>;
  const latestAssigned = (latest ?? []).map((r) => r.bill_month as string);
  const pendingAndCancelled = (pendingRows ?? []) as PendingCardItem[];
  const allPending = pendingAndCancelled.filter((p) => !p.cancelled_by_refund);

  if (closed.length > 0 || latestAssigned.length > 0) {
    const open = openBillMonth(closed.map((b) => b.bill_month), latestAssigned, today);
    const month = addMonthKey(open, offset);
    const bill = closed.find((b) => b.bill_month === month) ?? null;
    const status = bill || month < open ? "closed" : month === open ? "open" : "future";
    const usualDue = card.bill_due_date ?? closed[0]?.due_date ?? null;
    const due = dueDateFor(month, bill?.due_date ?? null, usualDue);
    const { data, error } = await admin
      .from("transactions")
      .select(FACT_COLUMNS)
      .eq("account_id", card.id)
      .eq("user_id", card.user_id)
      .eq("bill_month", month)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false })
      .limit(2000);
    if (error) throw new Error(`Falha ao carregar a fatura: ${error.message}`);
    const facts = (data ?? []) as FactRow[];
    // Stale pending items of invoices already closed are ignored.
    const pendingHere = status === "closed" ? [] : allPending.filter((p) => p.bill_month === month);
    const kept = new Set(
      withoutInternalPairs(facts.filter((f) => !isCardPayment(f)).map((f) => ({ ...f, description: f.provider_description ?? f.user_description ?? "" }))).map((f) => f.id),
    );
    const factsShown = facts.filter((f) => kept.has(f.id));
    const pendingShown = withoutInternalPairs(pendingHere.filter((p) => !isCardPayment({ type: p.type, provider_description: p.description })));
    const paymentsCents =
      facts.filter((f) => isCardPayment(f)).reduce((s, f) => s + f.amount_cents, 0) +
      pendingHere.filter((p) => isCardPayment({ type: p.type, provider_description: p.description })).reduce((s, p) => s + p.amount_cents, 0);
    const previous = closed.find((b) => b.bill_month === addMonthKey(month, -1));
    const carriedCents = status === "open" ? carriedFrom(previous) : 0;
    const known = netCents(factsShown) + netCents(pendingShown);
    const totalCents = bill ? bill.total_cents : known + carriedCents;
    const ahead = new Map<string, number>();
    for (const p of allPending) {
      if (p.bill_month <= month || isCardPayment({ type: p.type, provider_description: p.description })) continue;
      ahead.set(p.bill_month, (ahead.get(p.bill_month) ?? 0) + (p.type === "debit" ? p.amount_cents : -p.amount_cents));
    }
    const closeKnown = card.bill_close_date ? alignDue(card.bill_close_date, addDays(due, -20)) : null;
    const end = closeKnown && closeKnown <= due ? closeKnown : addDays(due, -7);
    const dates = [...factsShown, ...pendingShown].map((f) => f.transaction_date);
    const start = dates.reduce((min, d) => (d < min ? d : min), addMonths(end, -1));
    return {
      period: { start, end, due, month, status, closed: status === "closed", closeEstimated: !closeKnown },
      items: factsShown,
      pending: pendingShown,
      cancelled: status === "closed" ? [] : pendingAndCancelled.filter((p) => p.cancelled_by_refund && p.bill_month === month),
      paymentsCents,
      carriedCents: bill ? bill.total_cents - known : carriedCents,
      totalCents,
      ahead: [...ahead.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, cents]) => ({ month: m, cents })),
    };
  }

  const period = invoicePeriod(card, addMonths(today, offset));
  const facts = (await loadFacts([card.user_id], period.start, period.end)).filter(
    (f) => f.account_id === card.id && f.transaction_date > period.start && f.transaction_date <= period.end,
  );
  const items = facts.filter((f) => !isCardPayment(f));
  const status = period.end < today ? "closed" : "open";
  return {
    period: { ...period, status, closed: status === "closed", closeEstimated: !card.bill_close_date },
    items,
    pending: [],
    cancelled: [],
    paymentsCents: facts.filter((f) => isCardPayment(f)).reduce((s, f) => s + f.amount_cents, 0),
    carriedCents: 0,
    totalCents: netCents(items),
    ahead: [],
  };
}

/** Invoice window: from the last close date (exclusive) to the next close date (inclusive). */
export function invoicePeriod(card: Pick<AccountRow, "bill_close_date" | "bill_due_date">, today: string) {
  if (!card.bill_close_date) {
    // Without a close date from the bank, the invoice is the calendar month.
    const { start, end } = monthBounds(today.slice(0, 7));
    return { start: addDays(start, -1), end, due: card.bill_due_date ? alignDue(card.bill_due_date, end) : end, month: today.slice(0, 7) };
  }
  let end = card.bill_close_date;
  while (end < today) end = addMonths(end, 1);
  while (addMonths(end, -1) >= today) end = addMonths(end, -1);
  const start = addMonths(end, -1);
  const due = card.bill_due_date ? alignDue(card.bill_due_date, end) : end;
  return { start, end, due, month: end.slice(0, 7) };
}

function alignDue(due: string, close: string): string {
  let aligned = due;
  while (aligned < close) aligned = addMonths(aligned, 1);
  while (addMonths(aligned, -1) >= close) aligned = addMonths(aligned, -1);
  return aligned;
}

export async function freeMoneyFor(household: Household, userId: string, facts: FactRow[], month: string) {
  const allowance = await freeMoneyAllowance(household.id, userId, monthBounds(month).end);
  if (allowance === null) return null;
  const used = facts.filter((f) => f.user_id === userId && f.free_money && f.type === "debit").reduce((s, f) => s + f.amount_cents, 0);
  return freeMoneyStatus(allowance, used, month);
}

export async function pendingApprovalsFor(householdId: string, userId: string) {
  const { data } = await createAdminClient()
    .from("approval_requests")
    .select("id, requested_by, title, amount_cents, installments, note, created_at")
    .eq("household_id", householdId)
    .eq("status", "pending")
    .neq("requested_by", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Array<{ id: string; requested_by: string; title: string; amount_cents: number; installments: number; note: string | null; created_at: string }>;
}

/** Everything both screens of the household home need. */
export async function loadCoupleContext(userId: string, month = todayIn().slice(0, 7)) {
  const household = await getHousehold(userId);
  const memberIds = household ? ([household.me.userId, household.partner?.userId].filter(Boolean) as string[]) : [userId];
  const { start, end } = monthBounds(month);
  const [facts, accounts, categories, syncedAt] = await Promise.all([
    loadFacts(memberIds, start, end),
    loadAccounts(memberIds),
    loadCategoryNames(memberIds),
    lastSyncAt(memberIds),
  ]);
  return { household, memberIds, month, facts, accounts, categories, syncedAt };
}

export function partnerView(household: Household, accounts: AccountRow[], facts: FactRow[], today: string) {
  if (!household.partner) return [];
  const partnerId = household.partner.userId;
  return partnerAccountsView(
    accounts.filter((a) => a.user_id === partnerId),
    facts.filter((f) => f.user_id === partnerId).map(toOwned),
    today,
  );
}

/** Shared ("Nosso") history of both people, in the shape the home and month widgets use. */
export async function loadSharedHistory(memberIds: string[], from: string, to: string) {
  const { data, error } = await createAdminClient()
    .from("transactions")
    .select(TRANSACTION_COLUMNS)
    .in("user_id", memberIds)
    .eq("scope", "ours")
    .is("deleted_at", null)
    .gte("transaction_date", from)
    .lte("transaction_date", to)
    .order("transaction_date", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`Falha ao carregar o que é de vocês: ${error.message}`);
  return (data ?? []) as unknown as Transaction[];
}

export async function loadSharedPlans(memberIds: string[]) {
  const admin = createAdminClient();
  const [{ data: bills }, { data: subs }, { data: tags }] = await Promise.all([
    admin.from("upcoming_bills").select(BILL_COLUMNS).in("user_id", memberIds).eq("scope", "ours").is("deleted_at", null).in("status", ["pending", "overdue"]).order("due_date"),
    admin.from("subscriptions").select(SUBSCRIPTION_COLUMNS).in("user_id", memberIds).eq("scope", "ours").is("deleted_at", null).order("name"),
    admin.from("tags").select(TAG_COLUMNS).in("user_id", memberIds).order("name"),
  ]);
  return { bills: (bills ?? []) as UpcomingBill[], subscriptions: (subs ?? []) as Subscription[], tags: (tags ?? []) as Tag[] };
}
