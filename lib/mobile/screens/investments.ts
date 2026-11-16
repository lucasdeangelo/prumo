import "server-only";

import { notFound } from "next/navigation";

import { findGoal, goalsOverview, lastSyncAt, type GoalOverview } from "@/lib/application/couple-data";
import { loadAssetGoals, loadGoalLinks, type AssetGoal } from "@/lib/application/goal-links";
import { getHousehold } from "@/lib/application/household";
import { investmentForViewer, loadIncome, loadInvestments, loadMovements, loadSnapshots, toPortfolioItem, type InvestmentRow } from "@/lib/application/investments";
import { valuation } from "@/lib/application/manual-investments";
import { ratesSnapshot } from "@/lib/application/market-rates";
import { requireUser } from "@/lib/auth/session";
import { addDays, monthOf, todayIn } from "@/lib/domain/dates";
import { estimateAtMaturity, ratesFromSnapshot, termsFromRow } from "@/lib/domain/fixed-income";
import {
  assetBadge,
  assetClass,
  averageMonthlyGain,
  costBasis,
  describeAsset,
  evolution,
  gain,
  gainSince,
  goalChip,
  heldSince,
  incomeLast12Months,
  isOpen,
  netIfWithdrawn,
  partnerInvestmentsView,
  portfolioSummary,
  rateText,
  type MovementType,
} from "@/lib/domain/investments";
import { centsToInput, formatBRL } from "@/lib/domain/money";
import { currentSpace } from "@/lib/space";

import { person } from "./shared";

const UUID = /^[0-9a-f-]{36}$/i;
const dateBR = (iso: string) => iso.split("-").reverse().join("/");
const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShortYear = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
const shortMonth = (d: string) => monthShortYear.format(new Date(`${d}T00:00:00Z`)).replace(". de ", "/").replace(" de ", "/");
const syncedFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

type Period = "6m" | "1a" | "tudo";
type Chip = { label: string; tone: "ours" | "mine" | "none" } | null;

/** One line of an investment list, ready to draw. */
function assetView(row: InvestmentRow, chip: Chip, owner: string | null) {
  const g = gain(row.amount_cents, row.invested_cents);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    subtype: row.subtype,
    badge: assetBadge(row.type, row.subtype),
    cls: assetClass(row.type, row.subtype),
    describe: describeAsset(row),
    amountCents: row.amount_cents,
    gain: g && row.status !== "withdrawn" ? g : null,
    withdrawn: row.status === "withdrawn",
    owner,
    chip,
  };
}
export type AssetView = ReturnType<typeof assetView>;

function goalCard(g: GoalOverview) {
  return {
    id: g.id,
    name: g.name,
    savedCents: g.savedCents,
    targetCents: g.targetCents,
    percent: g.progress.percent,
    earnedCents: g.earnedCents,
    investmentCount: g.investmentIds.length,
    deadlineLabel: g.deadline ? shortMonth(g.deadline) : null,
  };
}

// ---------- /investments ----------

export async function investments(_: Record<string, string>, search: Record<string, string>) {
  const period: Period = search.periodo === "1a" || search.periodo === "tudo" ? search.periodo : "6m";
  const { user } = await requireUser();
  const [household, space] = await Promise.all([getHousehold(user.id), currentSpace()]);
  const today = todayIn();
  const me = household?.me ?? { userId: user.id, name: user.name?.split(" ")[0] ?? "Você", initial: (user.name ?? "V").charAt(0).toUpperCase(), color: "blue" as const };
  const partner = household?.partner ?? null;
  const memberIds = [user.id, partner?.userId].filter(Boolean) as string[];
  const [rows, syncedAt, ourGoals, myGoals] = await Promise.all([
    loadInvestments(memberIds),
    lastSyncAt(memberIds),
    household ? goalsOverview(household.id, today) : Promise.resolve([]),
    household ? goalsOverview(household.id, today, { ownerId: user.id }) : Promise.resolve([]),
  ]);
  const assetGoals = await loadAssetGoals(rows.map((r) => r.id));
  const inCoupleGoals = new Set([...assetGoals].filter(([, l]) => l.some((g) => g.scope === "ours")).map(([id]) => id));
  const chip = (r: InvestmentRow) => goalChip(assetGoals.get(r.id) ?? [], user.id, r.user_id, isOpen(r));
  const ownerName = (r: InvestmentRow) => (partner ? (r.user_id === partner.userId ? partner.name : me.name) : null);

  const shown = space === "nosso" ? "nosso" : "meu";
  const base = { space: shown, me: person(me), partner: partner ? person(partner) : null, period, syncedAt };

  if (shown === "nosso") {
    if (!partner) return { ...base, mode: "invite" as const };
    const ours = rows.filter((r) => r.scope === "ours");
    const open = ours.filter(isOpen);
    const partnerMine = rows.filter((r) => r.user_id === partner.userId && r.scope === "mine");
    const mine = rows.filter((r) => r.user_id === user.id && r.scope === "mine");
    const view = partnerInvestmentsView(partnerMine.map(toPortfolioItem), inCoupleGoals);
    const summary = portfolioSummary(ours.map(toPortfolioItem));
    const [snapshots, income] = await Promise.all([loadSnapshots(open.map((r) => r.id)), loadIncome(open.map((r) => r.id), addDays(today, -365))]);
    const openGoals = ourGoals.filter((g) => g.status === "active" || g.status === "pending");
    const linked = new Set(openGoals.flatMap((g) => g.investmentIds));
    const free = open.filter((r) => !linked.has(r.id));
    return {
      ...base,
      mode: "nosso" as const,
      summary,
      monthLabel: monthShortYear.format(new Date(`${monthOf(today)}-01T00:00:00Z`)).split(" ")[0].replace(".", ""),
      monthGainCents: gainSince(snapshots, ours.map(toPortfolioItem), `${monthOf(today)}-01`),
      incomeCents: income,
      points: evolution(snapshots, today, period),
      goals: openGoals.map(goalCard),
      free: free.length ? { cents: free.reduce((s, r) => s + r.amount_cents, 0), names: free.slice(0, 3).map((r) => r.name).join(", ") + (free.length > 3 ? "…" : "") } : null,
      assets: open.map((r) => assetView(r, chip(r), ownerName(r))),
      withdrawn: ours.filter((r) => !isOpen(r)).map((r) => assetView(r, null, ownerName(r))),
      outside: {
        myTotalCents: portfolioSummary(mine.map(toPortfolioItem)).totalCents,
        partnerTotalCents: view.totalCents,
        partnerShares: view.assets.length > 0,
        shared: partnerMine.filter((r) => view.assets.some((a) => a.id === r.id)).map((r) => assetView(r, chip(r), partner.name)),
      },
    };
  }

  const mine = rows.filter((r) => r.user_id === user.id && (!partner || r.scope === "mine"));
  const open = mine.filter(isOpen);
  const summary = portfolioSummary(mine.map(toPortfolioItem));
  const snapshots = await loadSnapshots(open.map((r) => r.id));
  const seen = partnerInvestmentsView(mine.map(toPortfolioItem), inCoupleGoals);
  const seenText = !partner
    ? null
    : seen.totalCents === null
      ? `Só eu vejo · ${partner.name} não vê seus investimentos`
      : seen.assets.length > 0
        ? `${partner.name} vê ${formatBRL(seen.totalCents)} e ${seen.assets.length === 1 ? "1 ativo" : `${seen.assets.length} ativos`} com detalhes`
        : `Só totais · ${partner.name} vê ${formatBRL(seen.totalCents)}, não os ativos`;
  return {
    ...base,
    mode: "meu" as const,
    seenText,
    summary,
    points: evolution(snapshots, today, period),
    myGoals: myGoals.filter((g) => g.status === "active").map(goalCard),
    assets: open.map((r) => assetView(r, chip(r), null)),
    withdrawn: mine.filter((r) => !isOpen(r)).map((r) => assetView(r, null, null)),
  };
}

// ---------- /investments/:id ----------

function movementLabel(type: MovementType, fixed: boolean): string {
  const labels: Record<MovementType, string> = { BUY: fixed ? "Aplicação" : "Compra", SELL: fixed ? "Resgate" : "Venda", INTEREST: fixed ? "Juros" : "Proventos", TAX: "Imposto", TRANSFER: "Transferência", AMORTIZATION: "Amortização", OTHER: "Outro" };
  return labels[type];
}

type Line = { label: string; note?: string; cents?: number; text?: string; sign?: "+" | "−" | "≈" | "±"; tone?: "up" | "down"; strong?: boolean };

export async function investment({ id }: Record<string, string>, search: Record<string, string>) {
  if (!UUID.test(id)) notFound();
  const period: Period = search.periodo === "1a" || search.periodo === "tudo" ? search.periodo : "6m";
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const found = await investmentForViewer(user.id, household, id);
  if (!found) notFound();
  const { row, owner } = found;
  const today = todayIn();
  const [movements, snapshots, assetGoals, ourGoals, myGoals] = await Promise.all([
    loadMovements(row.id),
    loadSnapshots([row.id]),
    loadAssetGoals([row.id]).then((m) => m.get(row.id) ?? []),
    household ? goalsOverview(household.id, today) : Promise.resolve([]),
    household ? goalsOverview(household.id, today, { ownerId: user.id }) : Promise.resolve([]),
  ]);
  const fixed = assetClass(row.type, row.subtype) === "fixed";
  const withdrawn = row.status === "withdrawn";
  const g = gain(row.amount_cents, row.invested_cents);
  const since = heldSince(movements, row.issue_date);
  const partner = household?.partner ?? null;
  const me = household?.me ?? null;
  const rates = fixed && row.due_date && !withdrawn ? await ratesSnapshot().catch(() => null) : null;

  const lines: Line[] = [];
  const signed = (cents: number): Pick<Line, "cents" | "sign" | "tone"> => ({ cents: Math.abs(cents), sign: cents >= 0 ? "+" : "−", tone: cents >= 0 ? "up" : "down" });
  if (fixed) {
    const net = netIfWithdrawn({ type: row.type, subtype: row.subtype, amountCents: row.amount_cents, investedCents: row.invested_cents, taxesCents: row.taxes_cents, since, today });
    const exempt = row.subtype === "LCI" || row.subtype === "LCA";
    if (row.invested_cents !== null) lines.push({ label: "Valor aplicado", cents: row.invested_cents });
    if (g) lines.push({ label: "Rendimento bruto", ...signed(g.cents) });
    if (exempt) lines.push({ label: "Imposto de renda", text: "Isento" });
    else if (net.taxCents > 0 || !net.estimated) lines.push({ label: net.estimated && net.rate !== null ? "IR estimado" : "IR e IOF informados pelo banco", note: net.estimated && net.rate !== null ? `(${(net.rate * 100).toLocaleString("pt-BR")}%)` : undefined, cents: net.taxCents, sign: "−" });
    lines.push({ label: "Se resgatar hoje", cents: net.netCents, strong: true });
    if (g && since && g.cents > 0) lines.push({ label: "Rende por mês, em média", cents: averageMonthlyGain(g.cents, since, today), sign: "≈" });
    const rate = rateText(row);
    if (rate) lines.push({ label: "Taxa contratada", text: rate });
    if (row.due_date) lines.push({ label: "Vencimento", text: dateBR(row.due_date) });
    const terms = termsFromRow(row);
    if (rates && terms && row.due_date && row.due_date > today) {
      const e = estimateAtMaturity({ amountCents: row.amount_cents, investedCents: row.invested_cents ?? row.amount_cents, since: since ?? today, today, due: row.due_date, terms, rates: ratesFromSnapshot(rates), type: row.type, subtype: row.subtype });
      lines.push({ label: "No vencimento", note: e.taxRate > 0 ? "(estimativa, já descontado o IR)" : "(estimativa)", cents: e.netCents, sign: "≈" });
    }
  } else {
    const income = incomeLast12Months(movements, today);
    const basis = movements.length ? costBasis(movements) : null;
    const quantity = row.quantity ?? basis?.quantity ?? null;
    if (row.invested_cents !== null) lines.push({ label: "Total investido", cents: row.invested_cents });
    if (quantity) lines.push({ label: "Quantidade", text: quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 }) });
    if (row.invested_cents !== null && quantity) lines.push({ label: "Preço médio", cents: Math.round(row.invested_cents / quantity) });
    if (row.unit_value_cents !== null) lines.push({ label: `Cotação${row.value_date ? ` em ${dateBR(row.value_date).slice(0, 5)}` : ""}`, cents: row.unit_value_cents });
    if (g) lines.push({ label: "Variação da cotação", ...signed(g.cents) });
    if (income > 0) lines.push({ label: "Dividendos e JCP (12 meses)", ...signed(income) });
    if (g) lines.push({ label: "Resultado com proventos", ...signed(g.cents + income), strong: true, note: row.invested_cents ? `${((g.cents + income) / row.invested_cents * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : undefined });
  }

  const chip =
    row.scope === "ours"
      ? { text: `Nosso · ${[me?.name, partner?.name].filter(Boolean).join(" e ")} veem`, tone: "ours" as const }
      : !owner
        ? { text: `De ${partner?.name ?? "seu par"} · com detalhes`, tone: "partner" as const }
        : partner
          ? { text: row.visibility === "private" ? "Meu · só você vê" : row.visibility === "totals" ? `Meu · ${partner.name} vê só o total` : `Meu · ${partner.name} vê os detalhes`, tone: "mine" as const }
          : null;

  const goalsAll = [...ourGoals, ...myGoals];
  const goalCards = assetGoals
    .filter((l) => l.scope === "ours" || l.ownerId === user.id)
    .flatMap((l: AssetGoal) => {
      const goal = goalsAll.find((o) => o.id === l.goalId);
      if (!goal) return [];
      return [{
        goalId: goal.id,
        scope: l.scope,
        name: goal.name,
        percent: goal.progress.percent,
        savedCents: goal.savedCents,
        targetCents: goal.targetCents,
        deadlineLabel: goal.deadline ? monthYear.format(new Date(`${goal.deadline}T00:00:00Z`)) : null,
        partCents: l.mode === "part" ? l.partCents : null,
        maturesBefore: Boolean(row.due_date && goal.deadline && row.due_date <= goal.deadline && !withdrawn) ? dateBR(row.due_date!) : null,
      }];
    });

  const footer: string[] = [];
  if (row.source === "pluggy" && row.synced_at) footer.push(`Atualizado pelo banco em ${syncedFormat.format(new Date(row.synced_at)).replace(", ", " às ")}`);
  if (row.source === "pluggy" && row.value_date) footer.push(`Valor informado pelo banco para ${dateBR(row.value_date)}. Valores brutos, antes do IR.`);
  if (row.source === "manual")
    footer.push(
      `Cadastrado por você. ${fixed ? `Valor calculado pelo Prumo com as taxas do Banco Central${row.value_date ? ` até ${dateBR(row.value_date)}` : ""}.` : row.value_date ? `${row.type === "MUTUAL_FUND" ? "Valor" : "Cotação"} informado por você em ${dateBR(row.value_date)}.` : ""} Valores brutos, antes do IR.`,
    );

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    subtype: row.subtype,
    badge: assetBadge(row.type, row.subtype),
    cls: assetClass(row.type, row.subtype),
    subtitle: `${fixed ? "Renda fixa" : "Renda variável"} · ${describeAsset(row)}`,
    fixed,
    withdrawn,
    amountCents: row.amount_cents,
    gain: g && !withdrawn ? g : null,
    gainCaption: fixed ? "rendimento bruto" : "desde a compra",
    hasBasis: row.invested_cents !== null,
    chip,
    period,
    points: evolution(snapshots, today, period),
    loss: Boolean(g && g.cents < 0 && !withdrawn),
    lines,
    noAdvice: fixed ? null : `${g && g.cents < 0 ? "A perda só se realiza se você vender. " : ""}O Prumo mostra os números, não recomenda comprar ou vender.`,
    movements: movements.map((m) => ({ id: m.id, label: movementLabel(m.type, fixed), dateLabel: dateBR(m.date), quantity: m.quantity, unit: row.subtype === "STOCK" ? "ações" : fixed ? "" : "cotas", amountCents: m.amountCents })),
    appliedOn: movements.length === 0 && row.issue_date && row.invested_cents !== null ? { date: dateBR(row.issue_date), cents: row.invested_cents } : null,
    goalCards,
    owner,
    canLink: owner && !withdrawn,
    manual: row.source === "manual" ? { valuation: valuation(row.type, row.subtype), open: !withdrawn } : null,
    preferences: owner ? { scope: row.scope, visibility: row.visibility, partnerName: partner?.name ?? null } : null,
    footer,
  };
}

// ---------- /investments/:id/link ----------

export async function investmentLink({ id }: Record<string, string>, search: Record<string, string>) {
  if (!UUID.test(id)) notFound();
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const found = await investmentForViewer(user.id, household, id);
  if (!found || !found.owner || found.row.status === "withdrawn") notFound();
  const { row } = found;
  const today = todayIn();
  const [ours, mine, current] = await Promise.all([
    household ? goalsOverview(household.id, today) : Promise.resolve([]),
    household ? goalsOverview(household.id, today, { ownerId: user.id }) : Promise.resolve([]),
    loadAssetGoals([row.id]).then((m) => m.get(row.id) ?? []),
  ]);
  const open = (g: GoalOverview) => g.status === "active" || g.status === "pending";
  const choice = (g: GoalOverview) => ({ id: g.id, name: g.name, caption: `${formatBRL(g.savedCents)} de ${formatBRL(g.targetCents)} · ${g.deadline ? shortMonth(g.deadline) : "sem prazo"}`, scope: g.scope });
  const partner = household?.partner ?? null;
  const sharesAlready = row.scope === "ours" || row.visibility === "details" || current.some((g) => g.scope === "ours");
  return {
    asset: { id: row.id, name: row.name, badge: assetBadge(row.type, row.subtype), cls: assetClass(row.type, row.subtype), amountCents: row.amount_cents },
    current: current.map((g) => ({ goalId: g.goalId, name: g.name, scope: g.scope, mode: g.mode, partCents: g.partCents })),
    mine: mine.filter(open).map(choice),
    ours: ours.filter(open).map(choice),
    preselected: search.meta && UUID.test(search.meta) ? search.meta : null,
    shareNote: partner && !sharesAlready ? `Numa meta do casal, ${partner.name} passa a ver este investimento e o valor dele. Hoje ${row.visibility === "totals" ? "vê só o seu total" : "não vê seus investimentos"}.` : null,
    fromGoal: search.voltar === "meta" && search.meta && UUID.test(search.meta) ? search.meta : null,
  };
}

// ---------- /investments/:id/movement ----------

export async function investmentMovement({ id }: Record<string, string>, search: Record<string, string>) {
  if (!UUID.test(id)) notFound();
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const found = await investmentForViewer(user.id, household, id);
  if (!found || !found.owner || found.row.source !== "manual" || found.row.status === "withdrawn") notFound();
  const { row } = found;
  const how = valuation(row.type, row.subtype);
  const allowed = how === "quote" ? ["compra", "venda", "cotacao"] : how === "total" ? ["aporte", "resgate", "valor"] : ["aporte", "resgate"];
  return {
    asset: { id: row.id, name: row.name, type: row.type, subtype: row.subtype, amountCents: row.amount_cents, quantity: how === "quote" ? row.quantity : null },
    kind: allowed.includes(search.tipo ?? "") ? search.tipo! : allowed[0],
    today: todayIn(),
    currentPrice: row.unit_value_cents !== null ? centsToInput(row.unit_value_cents) : "",
    currentAmount: centsToInput(row.amount_cents),
  };
}

// ---------- /investments/new ----------

export async function newInvestment() {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const today = todayIn();
  const [ours, mine, rates] = await Promise.all([
    household ? goalsOverview(household.id, today) : Promise.resolve([]),
    household ? goalsOverview(household.id, today, { ownerId: user.id }) : Promise.resolve([]),
    ratesSnapshot().catch(() => ({ cdiDaily: null, selicDaily: null, ipca12: null, cdiAnnual: null })),
  ]);
  const open = (g: GoalOverview) => g.status === "active" || g.status === "pending";
  return {
    partnerName: household?.partner?.name ?? null,
    goals: { mine: mine.filter(open).map((g) => ({ id: g.id, label: g.name })), ours: ours.filter(open).map((g) => ({ id: g.id, label: g.name })) },
    rates,
    today,
  };
}

// ---------- /couple/goals/:id/investments ----------

export async function goalInvestments({ id }: Record<string, string>) {
  if (!UUID.test(id)) notFound();
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household) notFound();
  const goal = await findGoal(household.id, user.id, id, todayIn());
  if (!goal) notFound();
  const mine = (await loadInvestments([user.id])).filter(isOpen);
  const goalsByAsset = await loadAssetGoals(mine.map((r) => r.id));
  return {
    goal: { id: goal.id, name: goal.name },
    assets: mine.map((r) => {
      const list = goalsByAsset.get(r.id) ?? [];
      const elsewhere = list.filter((g) => g.goalId !== goal.id).map((g) => g.name);
      return { ...assetView(r, null, null), status: list.some((g) => g.goalId === goal.id) ? "Já conta para esta meta" : elsewhere.length ? `Conta para ${elsewhere.join(", ")}` : "Sem meta" };
    }),
  };
}

/** Linked investments of a goal, for the goal screen in the app. */
export async function goalLinkedAssets(goalId: string, memberIds: string[], names: Map<string, string>) {
  const [links, rows] = await Promise.all([loadGoalLinks([goalId]), loadInvestments(memberIds)]);
  const ids = new Set(links.filter((l) => l.status !== "withdrawn").map((l) => l.investmentId));
  return rows
    .filter((r) => ids.has(r.id))
    .map((r) => {
      const link = links.find((l) => l.investmentId === r.id);
      const note = [names.size > 1 ? `De ${names.get(r.user_id) ?? ""}` : null, link?.mode === "part" && link.partCents ? `conta ${formatBRL(Math.min(link.partCents, r.amount_cents))} para a meta` : null].filter(Boolean).join(" · ");
      return { ...assetView(r, null, null), note: note || null };
    });
}
