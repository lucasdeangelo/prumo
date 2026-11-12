import "server-only";

import { notFound, redirect } from "next/navigation";

import { budgetOverview, freeMoneyFor, goalsOverview, loadAccounts, loadBudgets, loadCategoryNames, loadCoupleContext, loadFacts, loadSplitRules, toOwned } from "@/lib/application/couple-data";
import { ensureHousehold, freeMoneyAllowance, getHousehold, listProposals } from "@/lib/application/household";
import { budgetSuggestion, listApprovals } from "@/lib/application/plans";
import { listPrivacyRules } from "@/lib/application/privacy";
import { loadRetro } from "@/lib/application/retro";
import { requireUser } from "@/lib/auth/session";
import { daysLeftInMonth, firstShare, sharePercentLabel } from "@/lib/domain/couple";
import { addMonths, isMonthKey, monthBounds, todayIn } from "@/lib/domain/dates";
import { centsToInput, formatBRL } from "@/lib/domain/money";
import { keptPrivateSummary, partnerAccountsView } from "@/lib/domain/visibility";
import { getServerEnv } from "@/lib/env.server";
import { listAccounts, listTags } from "@/lib/repositories/reads";
import { createAdminClient } from "@/lib/supabase/admin";

import { person } from "./shared";

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const sinceFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
const sinceDay = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
const alertDay = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "America/Sao_Paulo" });
const dayLong = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });
const UUID = /^[0-9a-f-]{36}$/i;

async function coupleOrRedirect(userId: string) {
  const household = await getHousehold(userId);
  if (!household?.partner) redirect("/couple");
  return { household, partner: household.partner };
}

const pair = <T extends { color: string }>(me: T, partner: T) => (me.color === "blue" ? [me, partner] : [partner, me]);

// ---------- /couple ----------

const KIND_LABEL: Record<string, string> = { free_money: "Dinheiro livre", approval_threshold: "Compras grandes", budget: "Orçamento do lar", split: "Divisão das contas" };

function describeProposal(kind: string, payload: Record<string, unknown>): string {
  if (kind === "approval_threshold") return payload.amountCents ? `Conversar antes acima de ${formatBRL(payload.amountCents as number)}` : "Sem limite para conversar";
  if (kind === "split") return payload.defaultSplit === "equal" ? "Dividir tudo 50/50" : "Dividir pela renda";
  if (kind === "budget") {
    const lines = (payload.lines as Array<{ amountCents: number }>) ?? [];
    return `${formatBRL(lines.reduce((s, l) => s + l.amountCents, 0))} por mês em ${lines.length} categorias`;
  }
  if (kind === "free_money") {
    const amounts = Object.values((payload.amounts as Record<string, number>) ?? {});
    return amounts.length ? `${formatBRL(amounts[0])} por mês para cada um` : "";
  }
  return "";
}

export async function couple(_: Record<string, string>, search: Record<string, string>) {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const partner = household?.partner ?? null;
  if (!household || !partner) return { paired: false as const, convite: search.convite ?? null, appUrl: getServerEnv().APP_URL ?? null };
  const [proposals, rules] = await Promise.all([listProposals(household.id), loadSplitRules(household.id)]);
  const people = pair(household.me, partner);
  const equalCategories = [...rules.entries()].filter(([, r]) => r.method === "equal").map(([c]) => c);
  return {
    paired: true as const,
    entrou: Boolean(search.entrou),
    people: people.map(person),
    since: sinceFormat.format(new Date(household.createdAt)),
    partnerName: partner.name,
    proposals: proposals.map((p) => ({ id: p.id, title: KIND_LABEL[p.kind], description: describeProposal(p.kind, p.payload), mine: p.proposed_by === user.id })),
    incomeText: household.me.incomeCents ? centsToInput(household.me.incomeCents) : "",
    pixKey: household.me.pixKey ?? "",
    defaultSplit: household.defaultSplit,
    splitNote:
      `Hoje: ${household.defaultSplit === "income" ? `pela renda (${sharePercentLabel(people[0] === household.me ? household.myShare : 1 - household.myShare)})` : "50/50"}` +
      `${equalCategories.length ? ` · 50/50 em ${equalCategories.join(", ")}` : ""}.` +
      `${household.defaultSplit === "income" && (!household.me.incomeCents || !partner.incomeCents) ? " Sem as duas rendas informadas, vale 50/50." : ""}`,
    equalCategories: equalCategories.join(", "),
  };
}

// ---------- /couple/approvals ----------

export async function approvals(_: Record<string, string>, search: Record<string, string>) {
  const { user } = await requireUser();
  const { household, partner } = await coupleOrRedirect(user.id);
  const [rows, proposals, { data: decided }] = await Promise.all([
    listApprovals(household.id),
    listProposals(household.id),
    createAdminClient().from("household_proposals").select("decided_at").eq("household_id", household.id).eq("kind", "approval_threshold").eq("status", "accepted").order("decided_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const thresholdProposal = proposals.find((p) => p.kind === "approval_threshold");
  return {
    f: search.f === "esperando" ? "esperando" : "todos",
    viewerId: user.id,
    me: person(household.me),
    people: [person(household.me), person(partner)],
    partnerName: partner.name,
    names: household.me.color === "blue" ? `${household.me.name} e ${partner.name}` : `${partner.name} e ${household.me.name}`,
    thresholdCents: household.approvalThresholdCents,
    decidedAt: decided?.decided_at ? sinceDay.format(new Date(decided.decided_at as string)) : null,
    thresholdProposal: thresholdProposal ? { mine: thresholdProposal.proposed_by === user.id, amountCents: (thresholdProposal.payload.amountCents as number | null) ?? null } : null,
    currentText: household.approvalThresholdCents ? centsToInput(household.approvalThresholdCents) : "",
    rows,
  };
}

export async function approval({ id }: Record<string, string>) {
  const { user } = await requireUser();
  const ctx = await loadCoupleContext(user.id);
  const household = ctx.household;
  if (!household?.partner) redirect("/couple");
  const row = (await listApprovals(household.id)).find((r) => r.id === id);
  if (!row) notFound();
  const requester = row.requested_by === user.id ? household.me : household.partner;
  const other = row.requested_by === user.id ? household.partner : household.me;
  const overview = await budgetOverview(household.id, ctx.facts, ctx.categories);
  const categoryLine = row.category ? overview.lines.find((l) => l.category === row.category) : undefined;
  const { data: running } = await createAdminClient()
    .from("transactions")
    .select("amount_cents, installment_number, installment_total, transaction_date")
    .in("user_id", ctx.memberIds)
    .eq("scope", "ours")
    .not("installment_total", "is", null)
    .is("deleted_at", null)
    .gte("transaction_date", ctx.month + "-01");
  return {
    row,
    mine: row.requested_by === user.id,
    meColor: household.me.color,
    requester: person(requester),
    otherName: other.name,
    waitingMe: row.status === "pending" && row.requested_by !== user.id,
    thresholdCents: household.approvalThresholdCents,
    monthlyCents: Math.round(row.amount_cents / row.installments),
    categoryLine: categoryLine ? { category: categoryLine.category, remainingCents: categoryLine.remainingCents } : null,
    runningMonthlyCents: (running ?? []).filter((r) => (r.installment_number as number) < (r.installment_total as number)).reduce((s, r) => s + (r.amount_cents as number), 0),
  };
}

export async function newApproval() {
  const { user } = await requireUser();
  const { household, partner } = await coupleOrRedirect(user.id);
  const [budgets, names] = await Promise.all([loadBudgets(household.id), loadCategoryNames([user.id])]);
  return {
    partnerName: partner.name,
    categories: [...new Set([...budgets.map((b) => b.category), ...[...names.values()].filter((t) => !t.excluded).map((t) => t.name)])].sort(),
  };
}

// ---------- /couple/budget ----------

export async function budget(_: Record<string, string>, search: Record<string, string>) {
  const { user } = await requireUser();
  const today = todayIn();
  const ctx = await loadCoupleContext(user.id);
  const household = ctx.household;
  if (!household?.partner) redirect("/couple");
  const [overview, proposals, { data: sent }] = await Promise.all([
    budgetOverview(household.id, ctx.facts, ctx.categories),
    listProposals(household.id),
    createAdminClient().from("budget_alerts_sent").select("category, threshold, sent_at").eq("household_id", household.id).eq("month", today.slice(0, 7)).order("sent_at", { ascending: false }),
  ]);
  const proposal = proposals.find((p) => p.kind === "budget");
  const lastAlert = sent?.[0];
  return {
    enviado: Boolean(search.enviado),
    meColor: household.me.color,
    month: today.slice(0, 7),
    syncedAt: ctx.syncedAt,
    partnerName: household.partner.name,
    names: pair(household.me, household.partner).map((p) => p.name).join(" e "),
    proposal: proposal ? { id: proposal.id, mine: proposal.proposed_by === user.id, lines: (proposal.payload.lines as Array<{ category: string; amountCents: number }>) ?? [] } : null,
    overview,
    days: daysLeftInMonth(today),
    lastAlert: lastAlert ? { category: lastAlert.category as string, threshold: lastAlert.threshold as number, when: alertDay.format(new Date(lastAlert.sent_at as string)) } : null,
    budgetAlerts: household.budgetAlerts,
  };
}

export async function budgetSetup() {
  const { user } = await requireUser();
  const { household, partner } = await coupleOrRedirect(user.id);
  const [current, { suggestion, averages, months }] = await Promise.all([loadBudgets(household.id), budgetSuggestion(household)]);
  const average = (category: string) => Math.round(averages.reduce((s, m) => s + (m[category] ?? 0), 0) / averages.length);
  const base = current.length ? current.map((c) => ({ category: c.category, amountCents: c.limitCents })) : suggestion;
  return {
    partnerName: partner.name,
    rows: base.map((r) => ({ ...r, hint: average(r.category) ? `Média: ${formatBRL(average(r.category))}` : "" })),
    hasSuggestion: suggestion.length > 0,
    range: `${monthName.format(new Date(`${months[0]}-01T00:00:00Z`))} a ${monthName.format(new Date(`${months[2]}-01T00:00:00Z`))}`,
    totalCents: suggestion.reduce((s, r) => s + r.amountCents, 0),
  };
}

// ---------- /couple/free-money ----------

export async function freeMoney() {
  const { user } = await requireUser();
  const { household, partner } = await coupleOrRedirect(user.id);
  const today = todayIn();
  const [mine, theirs, proposals] = await Promise.all([
    freeMoneyAllowance(household.id, household.me.userId, today),
    freeMoneyAllowance(household.id, partner.userId, today),
    listProposals(household.id),
  ]);
  const proposal = proposals.find((p) => p.kind === "free_money");
  const proposed = (proposal?.payload.amounts as Record<string, number> | undefined) ?? {};
  const from = monthBounds(addMonths(`${today.slice(0, 7)}-01`, -3).slice(0, 7)).start;
  const facts = await loadFacts([household.me.userId], from, monthBounds(addMonths(`${today.slice(0, 7)}-01`, -1).slice(0, 7)).end);
  const avgMine = Math.round(facts.filter((f) => f.free_money && f.type === "debit").reduce((s, f) => s + f.amount_cents, 0) / 3);
  const card = (who: typeof household.me, current: number | null, isMe: boolean) => ({
    person: person(who),
    isMe,
    status: proposal ? (proposal.proposed_by === who.userId ? (isMe ? "Você propôs" : `${who.name} propôs`) : `Aguardando ${who.name}`) : null,
    proposedCents: proposed[who.userId] ?? null,
    currentCents: current,
    avgCents: isMe && avgMine > 0 ? avgMine : 0,
  });
  return {
    meColor: household.me.color,
    meName: household.me.name,
    partnerName: partner.name,
    cards: [card(household.me, mine, true), card(partner, theirs, false)],
    proposal: proposal ? { id: proposal.id, mine: proposal.proposed_by === user.id } : null,
    mineText: centsToInput(proposed[household.me.userId] ?? mine ?? 60000),
    theirsText: centsToInput(proposed[partner.userId] ?? theirs ?? 60000),
    nextMonth: monthName.format(new Date(`${addMonths(`${today.slice(0, 7)}-01`, 1)}T00:00:00Z`)),
    mineCents: mine,
  };
}

// ---------- /couple/goals ----------

function goalPeople(household: NonNullable<Awaited<ReturnType<typeof getHousehold>>>) {
  return household.partner ? pair(household.me, household.partner) : [household.me];
}

export async function goals() {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const list = household ? await goalsOverview(household.id, todayIn()) : [];
  const people = household ? goalPeople(household) : [];
  const view = (g: (typeof list)[number]) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    status: g.status,
    deadlineLabel: g.deadline ? monthYear.format(new Date(`${g.deadline}T00:00:00Z`)) : null,
    savedCents: g.savedCents,
    targetCents: g.targetCents,
    byUser: g.byUser,
    progress: g.progress,
    reachLabel: g.progress.reachMonth ? monthYear.format(new Date(`${g.progress.reachMonth}-01T00:00:00Z`)) : null,
    hasDeadline: Boolean(g.deadline),
    completedLabel: g.completedAt ? monthName.format(new Date(g.completedAt)) : null,
  });
  return {
    hasPartner: Boolean(household?.partner),
    meColor: household?.me.color ?? "blue",
    people: people.map(person),
    savedCents: list.reduce((s, g) => s + g.savedCents, 0),
    open: list.filter((g) => g.status === "active" || g.status === "pending").map(view),
    done: list.filter((g) => g.status === "done").map(view),
  };
}

export async function newGoal() {
  const { user } = await requireUser();
  await ensureHousehold(user.id);
  const household = await getHousehold(user.id);
  const partner = household?.partner ?? null;
  return {
    meName: household?.me.name ?? "Você",
    partnerName: partner?.name ?? null,
    incomeShare: partner && household?.me.incomeCents && partner.incomeCents ? firstShare("income", [household.me.incomeCents, partner.incomeCents]) : null,
  };
}

export async function goal({ id }: Record<string, string>) {
  if (!UUID.test(id)) notFound();
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household) notFound();
  const found = (await goalsOverview(household.id, todayIn())).find((g) => g.id === id);
  if (!found) notFound();
  const admin = createAdminClient();
  const [{ data: contributions }, { data: milestones }] = await Promise.all([
    admin.from("goal_contributions").select("id, user_id, amount_cents, contributed_on, automatic").eq("goal_id", id).order("contributed_on", { ascending: false }).limit(50),
    admin.from("goal_milestones").select("percent, reached_at").eq("goal_id", id),
  ]);
  const people = goalPeople(household);
  const myMember = found.members.find((m) => m.user_id === user.id);
  const plan = (userId: string) => {
    const member = found.members.find((m) => m.user_id === userId);
    if (!member) return "";
    if (member.monthly_cents) return ` · ${formatBRL(member.monthly_cents)}/mês`;
    if (member.percent !== null && found.progress.neededMonthlyCents) return ` · ${formatBRL(Math.round((found.progress.neededMonthlyCents * Number(member.percent)) / 100))}/mês`;
    return "";
  };
  const timeline = [
    ...(contributions ?? []).map((c) => ({ kind: "deposit" as const, date: c.contributed_on as string, userId: c.user_id as string, cents: c.amount_cents as number, automatic: c.automatic as boolean, key: c.id as string })),
    ...(milestones ?? []).map((m) => ({ kind: "milestone" as const, date: (m.reached_at as string).slice(0, 10), percent: m.percent as number, key: `m${m.percent}` })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const suggestion = myMember?.monthly_cents ?? (found.progress.neededMonthlyCents && myMember?.percent ? Math.round((found.progress.neededMonthlyCents * Number(myMember.percent)) / 100) : 0);
  return {
    id: found.id,
    title: `${found.icon ? `${found.icon} ` : ""}${found.name}`,
    subtitle: found.deadline ? `Prazo: ${monthYear.format(new Date(`${found.deadline}T00:00:00Z`))}` : "Sem prazo",
    status: found.status,
    waitingMe: Boolean(found.status === "pending" && myMember && !myMember.confirmed_at),
    myPart: myMember?.percent !== null && myMember?.percent !== undefined ? `${Number(myMember.percent)}% do que for guardado` : `${formatBRL(myMember?.monthly_cents ?? 0)} por mês`,
    partnerName: household.partner?.name ?? "seu par",
    savedCents: found.savedCents,
    targetCents: found.targetCents,
    byUser: found.byUser,
    progress: found.progress,
    monthlyPaceCents: found.monthlyPaceCents,
    reachLabel: found.progress.reachMonth ? monthYear.format(new Date(`${found.progress.reachMonth}-01T00:00:00Z`)) : null,
    people: people.map((p) => ({ ...person(p), plan: plan(p.userId) })),
    suggestion: suggestion ? centsToInput(suggestion) : "",
    contributionCount: (contributions ?? []).length,
    timeline: timeline.map((t) => ({ ...t, dateLabel: dayLong.format(new Date(`${t.date}T00:00:00Z`)) })),
  };
}

const TITLE: Record<string, string> = { "25": "Um quarto do caminho", "50": "Metade do caminho", "75": "Falta pouco", "100": "Meta concluída" };

export async function milestone({ id, pct }: Record<string, string>) {
  if (!TITLE[pct]) notFound();
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household) notFound();
  const found = (await goalsOverview(household.id, todayIn())).find((g) => g.id === id);
  if (!found) notFound();
  const people = goalPeople(household);
  const { count: linked } = await createAdminClient()
    .from("whatsapp_links")
    .select("user_id", { count: "exact", head: true })
    .in("user_id", people.map((p) => p.userId))
    .not("verified_at", "is", null)
    .is("revoked_at", null);
  return {
    id: found.id,
    pct,
    title: TITLE[pct],
    name: found.name,
    savedCents: found.savedCents,
    months: found.monthlyPaceCents > 0 ? Math.ceil(found.progress.missingCents / found.monthlyPaceCents) : null,
    people: people.map(person),
    everyoneNotified: people.length > 1 && (linked ?? 0) >= 2,
  };
}

// ---------- /couple/retro ----------

export async function retro({ month }: Record<string, string>) {
  if (!isMonthKey(month)) notFound();
  const { user } = await requireUser();
  const { household, partner } = await coupleOrRedirect(user.id);
  const data = await loadRetro(household, month);
  const people = pair(household.me, partner);
  const nextMonth = addMonths(`${month}-01`, 1).slice(0, 7);
  return {
    month,
    name: monthName.format(new Date(`${month}-01T00:00:00Z`)),
    prevName: monthName.format(new Date(`${data.previous}-01T00:00:00Z`)),
    previous: data.previous,
    nextMonth,
    canGoNext: nextMonth < todayIn().slice(0, 7),
    me: person(household.me),
    partner: person(partner),
    people: people.map(person),
    meFirst: people[0] === household.me,
    defaultSplit: household.defaultSplit,
    totalCents: data.totalCents,
    prevTotalCents: data.prevTotalCents,
    changePercent: data.changePercent,
    biggestDrop: data.biggestDrop,
    budgetLines: data.budgetLines,
    goalLines: data.goalLines,
    goalsSavedCents: data.goalsSavedCents,
    settlement: data.settlement,
    incomeShare: data.incomeShare,
    points: data.points,
    marked: [...data.marked],
    done: data.done,
    monthSettledLabel: data.monthSettled ? sinceDay.format(new Date(data.monthSettled.settled_at)) : null,
  };
}

// ---------- /privacy ----------

export async function privacyPreview() {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household?.partner) redirect("/privacy/visibility");
  const today = todayIn();
  const month = today.slice(0, 7);
  const { start, end } = monthBounds(month);
  const [accounts, facts, categories] = await Promise.all([loadAccounts([user.id]), loadFacts([user.id], start, end), loadCategoryNames([user.id])]);
  const owned = facts.map(toOwned);
  const view = partnerAccountsView(accounts, owned, today);
  const free = await freeMoneyFor(household, user.id, facts, month);
  const categoryName = (tagId: string | null) => (tagId ? categories.get(tagId)?.name : null) ?? "Outros";
  return {
    partner: person(household.partner),
    meName: household.me.name,
    accounts: view.map((a) => ({
      id: a.id,
      name: a.name,
      visibility: a.visibility,
      balanceCents: a.balanceCents,
      monthOutCents: a.monthOutCents,
      lines: a.lines.slice(0, 8).map((line) => (line.kind === "reserved" ? line : { ...line, category: categoryName(line.tagId) })),
    })),
    freeMoney: free ? { usedCents: free.usedCents, allowanceCents: free.allowanceCents } : null,
    kept: keptPrivateSummary(accounts, owned, today),
  };
}

export async function privacyRules() {
  const { user, db } = await requireUser();
  const [rules, tags, accounts, household] = await Promise.all([listPrivacyRules(user.id), listTags(db, user.id), listAccounts(db, user.id), getHousehold(user.id)]);
  const partnerName = household?.partner?.name ?? "Seu par";
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const ACTION = { category_only: "Só categoria e valor", hidden: `Ocultar de ${partnerName}`, ask_surprise: "Perguntar se é surpresa" } as const;
  return {
    partnerName,
    meColor: household?.me.color ?? "blue",
    rules: rules.map((rule) => ({
      id: rule.id,
      kind: rule.match_type === "tag" ? "Categoria" : rule.match_type === "merchant" ? "Loja contém" : "Conta",
      target: (rule.match_type === "tag" ? tagName.get(rule.tag_id ?? "") : rule.match_type === "merchant" ? `“${rule.pattern}”` : accountName.get(rule.account_id ?? "")) ?? "",
      action: ACTION[rule.action as keyof typeof ACTION],
    })),
    tags: tags.map((t) => ({ id: t.id, name: t.name })),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
  };
}

export async function privacyVisibility() {
  const { user } = await requireUser();
  const [household, accounts] = await Promise.all([getHousehold(user.id), loadAccounts([user.id])]);
  const view = (a: (typeof accounts)[number]) => ({
    id: a.id,
    name: a.name,
    institution: a.institution,
    detail: `${a.card_last4 ? `•• ${a.card_last4}` : ""}${a.card_last4 && a.balance_cents !== null ? " · " : ""}${a.balance_cents !== null ? formatBRL(Math.abs(a.balance_cents)) : ""}`,
    visibility: a.visibility,
    partner_card_last4: a.partner_card_last4,
  });
  return {
    partnerName: household?.partner?.name ?? "Seu par",
    hasPartner: Boolean(household?.partner),
    meColor: household?.me.color ?? "blue",
    empty: accounts.length === 0,
    banks: accounts.filter((a) => a.type !== "CREDIT").map(view),
    cards: accounts.filter((a) => a.type === "CREDIT").map(view),
  };
}
