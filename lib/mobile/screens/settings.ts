import "server-only";

import { notFound } from "next/navigation";

import { listConnections } from "@/lib/application/connections";
import { loadAccounts, loadBudgets, loadCategoryNames, loadFacts, loadSplitRules } from "@/lib/application/couple-data";
import { freeMoneyAllowance, getHousehold, listProposals } from "@/lib/application/household";
import { listPrivacyRules } from "@/lib/application/privacy";
import { requireUser } from "@/lib/auth/session";
import { sharePercentLabel } from "@/lib/domain/couple";
import { addDays, todayIn } from "@/lib/domain/dates";
import { getServerEnv } from "@/lib/env.server";
import { getWhatsappLink, listAccounts, listRules, listTags } from "@/lib/repositories/reads";
import { createAdminClient } from "@/lib/supabase/admin";
import { transactionLabel } from "@/lib/types";

import { person } from "./shared";

const since = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const hour = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

// ---------- /settings ----------

export async function settings() {
  const { user, db } = await requireUser();
  const mine = Promise.all([loadAccounts([user.id]), listPrivacyRules(user.id), listConnections(user.id), getWhatsappLink(db, user.id)]);
  mine.catch(() => {});
  const household = await getHousehold(user.id);
  const partner = household?.partner ?? null;
  const [[accounts, rules, connections, link], budgets, proposals, splitRules, freeMine] = await Promise.all([
    mine,
    household ? loadBudgets(household.id) : Promise.resolve([]),
    household ? listProposals(household.id) : Promise.resolve([]),
    household ? loadSplitRules(household.id) : Promise.resolve(new Map()),
    household ? freeMoneyAllowance(household.id, user.id, todayIn()) : Promise.resolve(null),
  ]);
  const shared = accounts.filter((a) => a.visibility !== "private").length;
  const people = household && partner ? (household.me.color === "blue" ? [household.me, partner] : [partner, household.me]) : [];
  const equalIn = [...(splitRules as Map<string, { method: string }>).entries()].filter(([, r]) => r.method === "equal").map(([c]) => c);
  return {
    email: user.email,
    couple: household && partner
      ? {
          people: people.map(person),
          since: since.format(new Date(household.createdAt)),
          partnerName: partner.name,
          budgetAlerts: household.budgetAlerts,
          approvalThresholdCents: household.approvalThresholdCents,
          splitLabel: household.defaultSplit === "income" ? `Pela renda (${sharePercentLabel(people[0] === household.me ? household.myShare : 1 - household.myShare)})` : "50/50",
          equalIn,
        }
      : null,
    sharedCount: shared,
    onlyMineCount: accounts.length - shared,
    rulesCount: rules.length,
    banksCount: new Set(connections.map((c) => c.institution)).size,
    failing: connections.filter((c) => c.state !== "ok").map((c) => c.institution),
    manual: accounts.filter((a) => a.is_manual).map((a) => ({ name: a.name, balance_cents: a.balance_cents })),
    whatsapp: link?.verified_at ? { phone: link.phone_normalized && !link.chat_id?.endsWith("@lid") ? link.phone_normalized : null } : null,
    budgetTotalCents: budgets.reduce((s: number, b: { limitCents: number }) => s + b.limitCents, 0),
    freeMineCents: freeMine,
    freeProposal: proposals.some((p: { kind: string }) => p.kind === "free_money"),
  };
}

export async function manualAccounts() {
  const { user, db } = await requireUser();
  const [accounts, household] = await Promise.all([listAccounts(db, user.id), getHousehold(user.id)]);
  return {
    partnerName: household?.partner?.name ?? null,
    manual: accounts.filter((a) => a.is_manual).map((a) => ({ id: a.id, name: a.name, visibility: a.visibility, balance_cents: a.balance_cents })),
  };
}

export async function connections() {
  const { user } = await requireUser();
  const [list, household] = await Promise.all([listConnections(user.id), getHousehold(user.id)]);
  const partner = household?.partner ?? null;
  const partnerShared = partner ? (await loadAccounts([partner.userId])).filter((a) => a.visibility !== "private" && a.pluggy_item_id) : [];
  return {
    email: user.email,
    partner: partner ? person(partner) : null,
    pluggyReady: Boolean(getServerEnv().PLUGGY_CLIENT_ID),
    connections: list.map((c) => ({
      key: `${c.id}-${c.institution}`,
      pluggyItemId: c.pluggyItemId,
      institution: c.institution,
      state: c.state,
      lastSuccessAt: c.lastSuccessAt,
      failedDate: c.lastSuccessAt ? dateFormat.format(new Date(c.lastSuccessAt)).slice(0, 5) : "—",
      consentUntil: c.consentExpiresAt ? dateFormat.format(new Date(c.consentExpiresAt)) : null,
      accounts: c.accounts.map((a) => ({ id: a.id, label: `${a.type === "CREDIT" ? `Cartão${a.card_last4 ? ` •• ${a.card_last4}` : ""}` : a.name}${!a.import_enabled ? " · não importado" : ""}`, visibility: a.visibility })),
    })),
    partnerShared: partnerShared.map((a) => ({ id: a.id, label: `${a.institution ?? a.name} · ${a.type === "CREDIT" ? `Cartão${a.card_last4 ? ` •• ${a.card_last4}` : ""}` : "Conta"}`, visibility: a.visibility })),
  };
}

function nextUpdateLabel(lastSuccessAt: string | null): string | null {
  if (!lastSuccessAt) return null;
  let next = new Date(lastSuccessAt).getTime() + 24 * 3600_000;
  while (next < Date.now() - 2 * 3600_000) next += 24 * 3600_000;
  const date = new Date(next);
  const today = day.format(new Date());
  const label = day.format(date) === today ? "hoje" : day.format(date) === day.format(new Date(Date.now() + 24 * 3600_000)) ? "amanhã" : day.format(date);
  return `${label} por volta das ${hour.format(date)}`;
}

export async function connection({ itemId }: Record<string, string>) {
  const { user } = await requireUser();
  const [list, household] = await Promise.all([listConnections(user.id), getHousehold(user.id)]);
  const group = list.filter((c) => c.pluggyItemId === itemId);
  if (group.length === 0) notFound();
  const c = group[0];
  const accounts = group.flatMap((g) => g.accounts);
  const base = {
    itemId,
    institution: group.map((g) => g.institution).join(", "),
    firstInstitution: c.institution,
    partnerName: household?.partner?.name ?? null,
    state: c.state,
    lastSuccessAt: c.lastSuccessAt,
    dataUntil: c.lastSuccessAt ? day.format(new Date(c.lastSuccessAt)) : "—",
    nextUpdate: nextUpdateLabel(c.lastSuccessAt),
    consentDay: c.consentExpiresAt ? day.format(new Date(c.consentExpiresAt)) : null,
    history: c.history.slice(0, 5).map((h) => ({ at: h.at, label: dateTime.format(new Date(h.at)), ok: h.ok })),
  };
  if (c.state !== "expired") return { ...base, main: null, recent: [] };
  const main = accounts.find((a) => a.type !== "CREDIT") ?? accounts[0];
  const recent = main ? (await loadFacts([user.id], addDays(todayIn(), -60), todayIn())).filter((f) => f.account_id === main.id).slice(0, 3) : [];
  const categories = await loadCategoryNames([user.id]);
  return {
    ...base,
    main: main ? { balance_cents: main.balance_cents, visibility: main.visibility } : null,
    recent: recent.map((f) => ({ id: f.id, label: transactionLabel(f), date: f.transaction_date, category: (f.tag_id ? categories.get(f.tag_id)?.name : null) ?? "Outros", ours: f.scope === "ours", cents: f.amount_cents, type: f.type })),
  };
}

export async function disconnect({ itemId }: Record<string, string>) {
  const { user } = await requireUser();
  const [list, household] = await Promise.all([listConnections(user.id), getHousehold(user.id)]);
  const group = list.filter((c) => c.pluggyItemId === itemId);
  if (group.length === 0) notFound();
  return {
    itemId,
    name: group.map((g) => g.institution).join(", "),
    firstInstitution: group[0].institution,
    many: group.length > 1,
    partnerName: household?.partner?.name ?? null,
    hasCard: group.some((g) => g.accounts.some((a) => a.type === "CREDIT")),
    today: day.format(new Date()),
  };
}

export async function tags() {
  const { user, db } = await requireUser();
  const [household, tagList, rules] = await Promise.all([getHousehold(user.id), listTags(db, user.id), listRules(db, user.id)]);
  return {
    partnerName: household?.partner?.name ?? null,
    tags: tagList.map((t) => ({ id: t.id, name: t.name, color: t.color, excluded: t.excluded_from_totals })),
    rules: rules.map((r) => ({ id: r.id, pattern: r.pattern, pattern_type: r.pattern_type, tag_id: r.tag_id })),
  };
}

export async function whatsapp() {
  const { user, db } = await requireUser();
  const link = await getWhatsappLink(db, user.id);
  const linked = link?.verified_at ? link : null;
  return {
    linked: Boolean(linked),
    phone: linked && !linked.chat_id?.endsWith("@lid") && linked.phone_normalized ? linked.phone_normalized : null,
    botNumber: process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER ?? null,
  };
}

// ---------- /connect ----------

export async function connect(_: Record<string, string>, search: Record<string, string>) {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const item = search.item;
  let accounts: Awaited<ReturnType<typeof loadAccounts>> = [];
  if (item && /^[0-9a-f-]{36}$/i.test(item)) {
    const { data: row } = await createAdminClient().from("pluggy_items").select("id").eq("user_id", user.id).eq("pluggy_item_id", item).is("deleted_at", null).maybeSingle();
    if (row) accounts = (await loadAccounts([user.id])).filter((a) => a.pluggy_item_id === row.id);
  }
  return {
    partner: household?.partner ? person(household.partner) : null,
    validUntil: addDays(todayIn(), 365),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, institution: a.institution, type: a.type, card_last4: a.card_last4, balance_cents: a.balance_cents, import_enabled: a.import_enabled, visibility: a.visibility })),
  };
}
