import "server-only";

import { notFound } from "next/navigation";

import { billCandidates } from "@/lib/application/bills";
import {
  budgetOverview,
  cardInvoices,
  freeMoneyFor,
  goalsOverview,
  lastSyncAt,
  loadAccounts,
  loadCategoryNames,
  loadCoupleContext,
  loadFacts,
  loadSharedHistory,
  loadSharedPlans,
  partnerView,
  pendingApprovalsFor,
  toOwned,
} from "@/lib/application/couple-data";
import { getHousehold, type Household } from "@/lib/application/household";
import { overdraftFor, overdraftNow, type AccountOverdraft } from "@/lib/application/overdraft";
import { requireUser } from "@/lib/auth/session";
import { daysLeftInMonth } from "@/lib/domain/couple";
import { addDays, addMonths, isMonthKey, monthBounds, monthOf, todayIn } from "@/lib/domain/dates";
import { buildForecast, forecastTotals } from "@/lib/domain/forecast";
import { centsToInput } from "@/lib/domain/money";
import { titleCase } from "@/lib/domain/normalize";
import { monthlyEquivalentCents } from "@/lib/domain/recurrence";
import { summarizeMonth } from "@/lib/domain/summary";
import { partnerAccountsView, projectForPartner } from "@/lib/domain/visibility";
import { getTransaction, listAccounts, listBills, listSubscriptions, listTags, listTransactions } from "@/lib/repositories/reads";
import { currentSpace } from "@/lib/space";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRANSACTION_COLUMNS, transactionLabel, type Transaction } from "@/lib/types";

import { homeAnalytics, householdView, listTx, person, tagViews } from "./shared";

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const UUID = /^[0-9a-f-]{36}$/i;

function overdraftView(items: AccountOverdraft[]) {
  return items.map((o) => ({
    accountId: o.account.id,
    institution: o.account.institution,
    name: o.account.name,
    negativeDays: o.negativeDays,
    lowestCents: o.lowestCents,
    lowestDate: o.lowestDate,
    chargesCents: o.chargesCents,
    overdraftLimitCents: o.account.overdraft_limit_cents,
    overdraftUsedCents: o.account.overdraft_used_cents,
  }));
}

// ---------- /overview ----------

export async function overview() {
  const { user, db } = await requireUser();
  const today = todayIn();
  const month = monthOf(today);
  const historyStart = monthBounds(addMonths(`${month}-01`, -5).slice(0, 7)).start;
  const ctx = loadCoupleContext(user.id, month);
  ctx.catch(() => {});
  const [household, space] = await Promise.all([getHousehold(user.id), currentSpace()]);
  const me = household?.me ?? { userId: user.id, name: user.name?.split(" ")[0] ?? "Você", initial: (user.name ?? "V").charAt(0).toUpperCase(), color: "blue" as const, incomeCents: null, pixKey: null };
  const partner = household?.partner ?? null;
  const shownSpace = space === "nosso" ? "nosso" : "meu";
  const lowerMonth = monthName.format(new Date(`${month}-01T00:00:00Z`));
  const base = { space: shownSpace as "meu" | "nosso", me: person(me), partner: partner ? person(partner) : null, lowerMonth, month, today };

  if (shownSpace === "nosso") {
    if (!partner || !household) return { ...base, mode: "invite" as const };
    return { ...base, mode: "nosso" as const, nosso: await nossoHome(user.id, household, ctx, today, month, historyStart) };
  }
  return { ...base, mode: "meu" as const, meu: await meuHome(user.id, db, household, ctx, today, month, historyStart) };
}

type Ctx = Awaited<ReturnType<typeof loadCoupleContext>>;

async function meuHome(userId: string, db: Parameters<typeof listTags>[0], household: Household | null, ctxIn: Promise<Ctx>, today: string, month: string, historyStart: string) {
  const hasPartner = Boolean(household?.partner);
  const [ctx, tags, accounts, history, bills, subscriptions, freeMoney, pending] = await Promise.all([
    ctxIn,
    listTags(db, userId),
    listAccounts(db, userId),
    listTransactions(db, userId, { from: historyStart, to: monthBounds(month).end, limit: 5000 }),
    listBills(db, userId, { status: ["pending", "overdue"] }),
    listSubscriptions(db, userId),
    household ? freeMoneyFor(household, userId, ctxIn.then((c) => c.facts), month) : Promise.resolve(null),
    household ? pendingApprovalsFor(household.id, userId) : Promise.resolve([]),
  ]);
  const mine = (t: { scope?: string }) => !hasPartner || t.scope !== "ours";
  const myHistory = history.filter(mine);
  const partnerName = household?.partner?.name ?? "seu par";
  const recentMine = myHistory.filter((t) => t.transaction_date >= monthBounds(month).start).slice(0, 3);
  const bankAccounts = accounts.filter((a) => a.balance_cents !== null && a.type !== "CREDIT");
  const balanceCents = bankAccounts.reduce((s, a) => s + (a.balance_cents ?? 0), 0);

  return {
    syncedAt: ctx.syncedAt,
    hasPartner,
    partnerName,
    freeMoney: freeMoney ? { ...freeMoney, renewsMonth: monthName.format(new Date(`${freeMoney.renewsOn}T00:00:00Z`)) } : null,
    balanceCents,
    hasBalance: bankAccounts.length > 0,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, institution: a.institution, type: a.type, card_last4: a.card_last4, visibility: a.visibility, balance_cents: a.balance_cents })),
    recentMine: hasPartner
      ? recentMine.map((t) => ({ id: t.id, label: transactionLabel(t), cents: t.amount_cents, type: t.type, date: t.transaction_date, surprise_until: t.surprise_until, free_money: t.free_money, privacy: t.privacy }))
      : [],
    pendingCount: pending.length,
    analytics: homeAnalytics({ month, today, history: myHistory, tags, bills: bills.filter(mine), subscriptions: subscriptions.filter(mine), balanceCents, hasBalance: bankAccounts.length > 0, showBalance: false }),
  };
}

async function nossoHome(userId: string, household: Household, ctxIn: Promise<Ctx>, today: string, month: string, historyStart: string) {
  const partner = household.partner!;
  const memberIds = [household.me.userId, partner.userId];
  const [ctx, budget, invoices, goals, pending, history, plans] = await Promise.all([
    ctxIn,
    budgetOverview(household.id, ctxIn.then((c) => c.facts), ctxIn.then((c) => c.categories)),
    cardInvoices(household, ctxIn.then((c) => c.accounts), today),
    goalsOverview(household.id, today),
    pendingApprovalsFor(household.id, userId),
    loadSharedHistory(memberIds, historyStart, monthBounds(month).end),
    loadSharedPlans(memberIds),
  ]);
  const shared = [
    ...ctx.accounts.filter((a) => a.user_id === userId && a.visibility !== "private").map((a) => ({ id: a.id, name: a.name, institution: a.institution, owner: household.me.name, visibility: a.visibility as "totals" | "details", balance: a.balance_cents })),
    ...partnerView(household, ctx.accounts, ctx.facts, today).map((v) => ({ id: v.id, name: v.name, institution: ctx.accounts.find((a) => a.id === v.id)?.institution ?? null, owner: partner.name, visibility: v.visibility, balance: v.balanceCents })),
  ];
  const invoice = invoices.find((i) => i.items.length + i.pending.length > 0) ?? invoices[0];
  const activeGoals = goals.filter((g) => g.status === "active").slice(0, 2);
  const previousMonth = addMonths(`${month}-01`, -1).slice(0, 7);
  const sharedBalance = shared.reduce((s, a) => s + (a.balance ?? 0), 0);

  return {
    syncedAt: ctx.syncedAt,
    budget: budget.lines.length > 0 ? { freeCents: budget.freeCents, usedCents: budget.usedCents, limitCents: budget.limitCents, daysLeft: daysLeftInMonth(today) } : null,
    pending: pending[0] ? { id: pending[0].id, title: pending[0].title, amount_cents: pending[0].amount_cents, installments: pending[0].installments } : null,
    approvalThresholdCents: household.approvalThresholdCents,
    invoice: invoice
      ? {
          cardId: invoice.card.id,
          title: `Fatura ${invoice.card.institution ?? invoice.card.name}${invoice.card.card_last4 ? ` •• ${invoice.card.card_last4}` : ""}`,
          totalCents: invoice.totalCents,
          due: invoice.period.due,
          holderIsMe: invoice.holderIsMe,
          settlement: { totalCents: invoice.settlement.totalCents, oursCents: invoice.settlement.oursCents, holderCents: invoice.settlement.holderCents, partnerCents: invoice.settlement.partnerCents, partnerOwesCents: invoice.settlement.partnerOwesCents },
        }
      : null,
    goals: activeGoals.map((g) => ({ id: g.id, name: g.name, percent: g.progress.percent, reachMonth: g.progress.reachMonth, deadline: g.deadline, savedCents: g.savedCents, targetCents: g.targetCents, byUser: g.byUser })),
    previousMonth,
    previousMonthName: monthName.format(new Date(`${previousMonth}-01T00:00:00Z`)),
    shared,
    analytics: homeAnalytics({ month, today, history, tags: plans.tags, bills: plans.bills, subscriptions: plans.subscriptions, balanceCents: sharedBalance, hasBalance: shared.some((a) => a.balance !== null) }),
  };
}

// ---------- /monthly/[month] ----------

export async function monthly({ month }: Record<string, string>) {
  if (!isMonthKey(month)) notFound();
  const { user, db } = await requireUser();
  const today = todayIn();
  const current = monthOf(today);
  const { start, end, prev, next } = monthBounds(month);
  const prevBounds = monthBounds(prev);
  const [household, space] = await Promise.all([getHousehold(user.id), currentSpace()]);
  const partner = household?.partner ?? null;
  const nosso = Boolean(partner) && space === "nosso";
  const memberIds = [user.id, partner?.userId].filter(Boolean) as string[];
  const overdraftIn = nosso ? Promise.resolve([]) : overdraftFor(user.id, month);
  const syncedAtIn = month === monthOf(today) ? lastSyncAt(memberIds) : Promise.resolve(null);
  overdraftIn.catch(() => {});
  syncedAtIn.catch(() => {});

  const [tags, transactions, previous, openBills] = nosso
    ? await (async () => {
        const [plans, facts, prevFacts] = await Promise.all([loadSharedPlans(memberIds), loadSharedHistory(memberIds, start, end), loadSharedHistory(memberIds, prevBounds.start, prevBounds.end)]);
        return [plans.tags, facts, prevFacts.filter((t) => t.type === "debit"), plans.bills.filter((b) => b.due_date <= end)] as const;
      })()
    : await Promise.all([
        listTags(db, user.id),
        listTransactions(db, user.id, { from: start, to: end, limit: 3000 }).then((list) => (partner ? list.filter((t) => t.scope !== "ours") : list)),
        listTransactions(db, user.id, { from: prevBounds.start, to: prevBounds.end, type: "debit", limit: 3000, columns: "amount_cents, type, transaction_date, tag_id, scope" }).then((list) => (partner ? list.filter((t) => t.scope !== "ours") : list)),
        listBills(db, user.id, { status: ["pending", "overdue"], to: end }).then((list) => (partner ? list.filter((b) => b.scope !== "ours") : list)),
      ]);
  const monthBills = month >= current ? openBills : [];
  const summary = summarizeMonth(transactions, tags, month);
  const [overdraft, syncedAt] = await Promise.all([overdraftIn, syncedAtIn]);
  const previousSummary = summarizeMonth(previous, tags, prev);
  const isCurrent = month === current;
  const todayDay = Number(today.slice(8, 10));
  const days = Math.max(summary.daily.length, previousSummary.daily.length);
  const line = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    expenseCents: i < summary.daily.length && (!isCurrent || i < todayDay) && month <= current ? summary.daily[i].expenseCents : null,
    previousCents: i < previousSummary.daily.length ? previousSummary.daily[i].expenseCents : null,
  }));
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const toPay = monthBills.filter((b) => b.type === "payable").reduce((s, b) => s + b.amount_cents, 0);
  const toReceive = monthBills.filter((b) => b.type === "receivable").reduce((s, b) => s + b.amount_cents, 0);

  return {
    month,
    current,
    today,
    prev,
    next,
    household: householdView(household),
    nosso,
    syncedAt,
    incomeCents: summary.incomeCents,
    expenseCents: summary.expenseCents,
    netCents: summary.netCents,
    projectedCents: summary.netCents - toPay + toReceive,
    toPayCents: toPay,
    deltaPct: previousSummary.expenseCents > 0 ? Math.round(((summary.expenseCents - previousSummary.expenseCents) / previousSummary.expenseCents) * 100) : null,
    overdraft: overdraftView(overdraft),
    categoryRows: summary.expenseByTag.map((row) => ({
      tagId: row.tagId,
      name: row.tagId ? tagById.get(row.tagId)?.name ?? "Sem tag" : "Sem tag",
      color: row.tagId ? tagById.get(row.tagId)?.color ?? null : null,
      cents: row.cents,
    })),
    bills: monthBills.slice(0, 4).map((b) => ({ id: b.id, description: b.description, due_date: b.due_date, amount_cents: b.amount_cents, type: b.type })),
    line,
    transactions: transactions.map(listTx),
    tags: tagViews(tags),
  };
}

// ---------- /transactions ----------

export async function newTransaction() {
  const { user, db } = await requireUser();
  const [tags, accounts, household] = await Promise.all([listTags(db, user.id), listAccounts(db, user.id), getHousehold(user.id)]);
  return {
    tags: tagViews(tags),
    accounts: accounts.filter((a) => a.is_manual).map((a) => ({ id: a.id, name: a.name })),
    today: todayIn(),
    partnerName: household?.partner?.name ?? null,
  };
}

export async function transaction({ id }: Record<string, string>, search: Record<string, string>) {
  if (!UUID.test(id)) notFound();
  const { user, db } = await requireUser();
  const [tx, tags, accounts, household] = await Promise.all([getTransaction(db, user.id, id), listTags(db, user.id), listAccounts(db, user.id, true), getHousehold(user.id)]);
  const today = todayIn();
  if (!tx) {
    if (!household?.partner) notFound();
    return { kind: "partner" as const, ...(await partnerTransaction(id, household.partner.userId, household.partner.name, today)) };
  }
  const account = accounts.find((a) => a.id === tx.account_id);
  const editableFacts = tx.source !== "pluggy";
  return {
    kind: "own" as const,
    today,
    erro: search.erro ? search.erro.slice(0, 120) : null,
    partnerName: household?.partner?.name ?? null,
    meColor: household?.me.color ?? "blue",
    accountVisibility: account?.visibility ?? null,
    accountName: account?.name ?? null,
    tagName: tx.tag_id ? tags.find((t) => t.id === tx.tag_id)?.name ?? null : null,
    tx: {
      id: tx.id,
      type: tx.type,
      amount_cents: tx.amount_cents,
      label: transactionLabel(tx),
      transaction_date: tx.transaction_date,
      source: tx.source,
      category_source: tx.category_source,
      provider_description: tx.provider_description,
      user_description: tx.user_description,
      tag_id: tx.tag_id,
      scope: tx.scope,
      privacy: tx.privacy,
      surprise_until: tx.surprise_until,
      free_money: tx.free_money,
      merchant: tx.normalized_merchant ? titleCase(tx.normalized_merchant) : null,
    },
    syncedAt: tx.source === "pluggy" ? await lastSyncAt([user.id]) : null,
    editableFacts,
    amountText: centsToInput(tx.amount_cents),
    tags: tagViews(tags),
  };
}

async function partnerTransaction(id: string, partnerId: string, partnerName: string, today: string) {
  const { data } = await createAdminClient().from("transactions").select(TRANSACTION_COLUMNS).eq("id", id).eq("user_id", partnerId).is("deleted_at", null).maybeSingle();
  const fact = data as unknown as Transaction | null;
  if (!fact) notFound();
  const [accounts, categories] = await Promise.all([loadAccounts([partnerId]), loadCategoryNames([partnerId])]);
  const account = accounts.find((a) => a.id === fact.account_id);
  const line = projectForPartner(
    { id: fact.id, account_id: fact.account_id, amount_cents: fact.amount_cents, type: fact.type, transaction_date: fact.transaction_date, label: transactionLabel(fact), tag_id: fact.tag_id, scope: fact.scope, privacy: fact.privacy, surprise_until: fact.surprise_until, surprise_hide_amount: fact.surprise_hide_amount, free_money: fact.free_money },
    account,
    today,
  );
  if (!line) notFound();
  const category = (line.kind !== "reserved" && line.tagId ? categories.get(line.tagId)?.name : null) ?? "Outros";
  return { partnerName, line, category, ours: fact.scope === "ours" };
}

export async function surprise({ id }: Record<string, string>) {
  if (!UUID.test(id)) notFound();
  const { user, db } = await requireUser();
  const [tx, household] = await Promise.all([getTransaction(db, user.id, id), getHousehold(user.id)]);
  if (!tx || tx.type !== "debit" || tx.scope === "ours") notFound();
  const today = todayIn();
  const short = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const year = Number(today.slice(0, 4));
  const christmas = `${today.slice(5) > "12-24" ? year + 1 : year}-12-24`;
  const inAMonth = addDays(today, 30);
  return {
    id,
    amount_cents: tx.amount_cents,
    label: transactionLabel(tx),
    date: tx.transaction_date,
    partnerName: household?.partner?.name ?? "Seu par",
    meName: household?.me.name ?? "você",
    amountText: centsToInput(tx.amount_cents),
    presets: [
      { value: christmas, label: `Natal · ${short.format(new Date(`${christmas}T00:00:00Z`))}` },
      { value: inAMonth, label: `Daqui a um mês · ${short.format(new Date(`${inAMonth}T00:00:00Z`))}` },
    ],
  };
}

// ---------- /upcoming ----------

const RANGES = [30, 90, 180] as const;

export async function upcoming(_: Record<string, string>, search: Record<string, string>) {
  const range = RANGES.find((r) => String(r) === search.dias) ?? 90;
  const { user, db } = await requireUser();
  const today = todayIn();
  const [bills, subscriptions] = await Promise.all([listBills(db, user.id, { status: ["pending", "overdue"] }), listSubscriptions(db, user.id)]);
  const items = buildForecast({ bills, subscriptions, today, to: addDays(today, range) });
  const totals = forecastTotals(items);
  const groups: Array<{ key: string; outCents: number; inCents: number; items: typeof items }> = [];
  for (const item of items) {
    const key = item.state === "overdue" ? "overdue" : monthOf(item.date);
    let group = groups.find((g) => g.key === key);
    if (!group) groups.push((group = { key, outCents: 0, inCents: 0, items: [] }));
    group.items.push(item);
  }
  for (const g of groups) Object.assign(g, forecastTotals(g.items));
  return { range, outCents: totals.outCents, inCents: totals.inCents, groups };
}

export async function newBill() {
  const { user, db } = await requireUser();
  const [tags, accounts, household] = await Promise.all([listTags(db, user.id), listAccounts(db, user.id), getHousehold(user.id)]);
  return { tags: tagViews(tags), accounts: accounts.map((a) => ({ id: a.id, name: a.name })), today: todayIn(), partnerName: household?.partner?.name ?? null };
}

export async function bill({ id }: Record<string, string>) {
  const { user, db } = await requireUser();
  const found = (await listBills(db, user.id)).find((b) => b.id === id);
  if (!found) notFound();
  const open = found.status === "pending" || found.status === "overdue";
  const candidates = open ? await billCandidates(user.id, found) : [];
  return {
    bill: found,
    open,
    late: open && found.due_date < todayIn(),
    candidates: candidates.map((c) => ({ transactionId: c.transactionId, label: transactionLabel(c.transaction), date: c.transaction.transaction_date, amount_cents: c.transaction.amount_cents })),
  };
}

// ---------- /subscriptions ----------

export async function subscriptions(_: Record<string, string>, search: Record<string, string>) {
  const { user, db } = await requireUser();
  const household = await getHousehold(user.id);
  const partner = household?.partner ?? null;
  const ours = Boolean(partner) && search.aba === "nossas";
  const memberIds = [user.id, partner?.userId].filter(Boolean) as string[];
  const [subs, syncedAt] = await Promise.all([
    ours ? loadSharedPlans(memberIds).then((p) => p.subscriptions) : listSubscriptions(db, user.id).then((list) => list.filter((s) => !partner || s.scope !== "ours")),
    lastSyncAt(memberIds),
  ]);
  const view = (s: (typeof subs)[number]) => ({
    id: s.id,
    name: s.name,
    amount_cents: s.amount_cents,
    frequency: s.frequency,
    next_charge_date: s.next_charge_date,
    status: s.status,
    detection_confidence: s.detection_confidence,
    editable: !(s.user_id && s.user_id !== user.id),
  });
  return {
    ours,
    hasPartner: Boolean(partner),
    meName: household?.me.name ?? null,
    partnerName: partner?.name ?? null,
    syncedAt,
    monthlyCents: subs.filter((s) => s.status === "active").reduce((sum, s) => sum + monthlyEquivalentCents(s.amount_cents, s.frequency), 0),
    activeCount: subs.filter((s) => s.status === "active").length,
    candidates: subs.filter((s) => s.status === "candidate").map(view),
    active: subs.filter((s) => s.status === "active" || s.status === "paused").map(view),
    past: subs.filter((s) => s.status === "cancelled").map(view),
  };
}

export async function newSubscription() {
  const { user, db } = await requireUser();
  const [tags, household] = await Promise.all([listTags(db, user.id), getHousehold(user.id)]);
  return { tags: tagViews(tags), today: todayIn(), partnerName: household?.partner?.name ?? null };
}

// ---------- /accounts/[id] ----------

export async function account({ id }: Record<string, string>) {
  if (!UUID.test(id)) notFound();
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const memberIds = [user.id, household?.partner?.userId].filter(Boolean) as string[];
  const found = (await loadAccounts(memberIds)).find((a) => a.id === id);
  if (!found) notFound();
  const mine = found.user_id === user.id;
  if (!mine && found.visibility === "private") notFound();
  const today = todayIn();
  const { start, end } = monthBounds(today.slice(0, 7));
  const [facts, categories, syncedAt] = await Promise.all([loadFacts([found.user_id], start, end), loadCategoryNames([found.user_id]), lastSyncAt([found.user_id])]);
  const own = facts.filter((f) => f.account_id === id).map(toOwned);
  const overdraft = mine ? overdraftNow(found) : null;
  const overdraftMonthItems = mine ? (await overdraftFor(user.id, today.slice(0, 7))).filter((o) => o.account.id === id) : [];
  const ownerName = mine ? household?.me.name ?? "Você" : household!.partner!.name;
  const view = mine
    ? { lines: own.map((t) => ({ kind: "detail" as const, id: t.id, label: t.label, tagId: t.tag_id, amountCents: t.amount_cents, type: t.type, date: t.transaction_date, scope: t.scope })), monthOutCents: own.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount_cents, 0) }
    : partnerAccountsView([found], own, today)[0];
  const categoryName = (tagId: string | null) => (tagId ? categories.get(tagId)?.name : null) ?? "Outros";
  return {
    mine,
    today,
    ownerName,
    account: { id: found.id, name: found.name, institution: found.institution, balance_cents: found.balance_cents, visibility: found.visibility },
    overdraft,
    overdraftMonth: overdraftView(overdraftMonthItems),
    syncedAt,
    monthOutCents: view.monthOutCents,
    lines: view.lines.map((line) => (line.kind === "reserved" ? line : { ...line, category: categoryName(line.tagId) })),
  };
}

// ---------- /help/updates ----------

export async function helpUpdates() {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  return { at: await lastSyncAt([user.id, household?.partner?.userId].filter(Boolean) as string[]), partnerName: household?.partner?.name ?? null };
}
