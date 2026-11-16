// Investments: provider mapping and the numbers the screens show. Pure functions, integer cents.
// The bank (Open Finance) gives value today and value invested; gains, average price, income and
// goal progress are computed here because Pluggy leaves amountProfit and return rates empty.

import { addDays, addMonths, daysBetween, monthOf } from "./dates";
import { decimalToCents } from "./money";

export type InvestmentStatus = "active" | "pending" | "withdrawn";
export type MovementType = "BUY" | "SELL" | "TAX" | "TRANSFER" | "INTEREST" | "AMORTIZATION" | "OTHER";

/** Structural copy of the provider fields this module reads (see lib/integrations/pluggy.ts). */
export type ProviderInvestment = {
  id: string;
  type: string;
  subtype?: string | null;
  name: string;
  code?: string | null;
  isin?: string | null;
  issuer?: string | null;
  amount?: number | null;
  balance?: number | null;
  amountOriginal?: number | null;
  taxes?: number | null;
  taxes2?: number | null;
  quantity?: number | null;
  value?: number | null;
  rate?: number | null;
  rateType?: string | null;
  fixedAnnualRate?: number | null;
  date?: string | null;
  dueDate?: string | null;
  issueDate?: string | null;
  status?: string | null;
  institution?: { name?: string | null } | null;
};

export type ProviderInvestmentMovement = {
  id: string;
  type: string;
  movementType?: string | null;
  date: string;
  quantity?: number | null;
  value?: number | null;
  amount?: number | null;
  netAmount?: number | null;
  description?: string | null;
};

const MOVEMENT_TYPES = new Set<MovementType>(["BUY", "SELL", "TAX", "TRANSFER", "INTEREST", "AMORTIZATION"]);

function cents(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : decimalToCents(value);
}

/** Provider dates are calendar dates at midnight UTC; converting the instant would shift them a day. */
function calendarDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

export function statusFromProvider(status: string | null | undefined): InvestmentStatus {
  if (status === "TOTAL_WITHDRAWAL") return "withdrawn";
  if (status === "PENDING") return "pending";
  return "active";
}

/** Provider fields of an `investments` row. Choices made in Prumo (scope, visibility, include) stay out. */
export function investmentFromProvider(inv: ProviderInvestment) {
  const taxes = inv.taxes == null && inv.taxes2 == null ? null : Math.abs(cents(inv.taxes) ?? 0) + Math.abs(cents(inv.taxes2) ?? 0);
  const invested = cents(inv.amountOriginal);
  return {
    provider_investment_id: inv.id,
    type: inv.type,
    subtype: inv.subtype || null,
    name: (inv.name || inv.subtype || inv.type).trim().slice(0, 160),
    code: inv.code || null,
    isin: inv.isin || null,
    issuer: inv.issuer || null,
    institution: inv.institution?.name || null,
    quantity: inv.quantity ?? null,
    unit_value_cents: cents(inv.value),
    amount_cents: cents(inv.amount) ?? cents(inv.balance) ?? 0,
    balance_cents: cents(inv.balance),
    invested_cents: invested === null ? null : Math.abs(invested),
    taxes_cents: taxes,
    rate: inv.rate ?? null,
    rate_type: inv.rateType || null,
    fixed_annual_rate: inv.fixedAnnualRate ?? null,
    issue_date: calendarDate(inv.issueDate),
    due_date: calendarDate(inv.dueDate),
    value_date: calendarDate(inv.date),
    status: statusFromProvider(inv.status),
  };
}

export function movementFromProvider(tx: ProviderInvestmentMovement) {
  const type = (MOVEMENT_TYPES.has(tx.type as MovementType) ? tx.type : "OTHER") as MovementType;
  const gross = cents(tx.amount) ?? cents(tx.netAmount) ?? 0;
  return {
    provider_movement_id: tx.id,
    type,
    movement_type: tx.movementType === "CREDIT" || tx.movementType === "DEBIT" ? tx.movementType : null,
    date: calendarDate(tx.date) ?? tx.date.slice(0, 10),
    quantity: tx.quantity ?? null,
    unit_value_cents: cents(tx.value),
    amount_cents: Math.abs(gross),
    net_amount_cents: cents(tx.netAmount),
    description: tx.description ? tx.description.slice(0, 300) : null,
  };
}

export type Movement = { type: MovementType; movementType?: "CREDIT" | "DEBIT" | null; date: string; quantity: number | null; amountCents: number };

/**
 * Cost basis from the movements, by average cost: a sale removes the average cost of what was
 * sold, not its price. Without quantities (fixed income) a withdrawal removes its amount, capped at
 * what is left, which counts the gain inside it as principal: conservative for "rendeu".
 */
export function costBasis(movements: Movement[]) {
  let invested = 0;
  let quantity = 0;
  const ordered = [...movements].sort((a, b) => a.date.localeCompare(b.date));
  for (const m of ordered) {
    const isIn = m.type === "BUY" || (m.type === "TRANSFER" && m.movementType === "CREDIT");
    const isOut = m.type === "SELL" || (m.type === "TRANSFER" && m.movementType === "DEBIT");
    if (isIn) {
      invested += m.amountCents;
      quantity += m.quantity ?? 0;
    } else if (isOut) {
      if (m.quantity && quantity > 0) {
        const sold = Math.min(m.quantity, quantity);
        invested -= Math.round((invested * sold) / quantity);
        quantity -= sold;
      } else {
        invested -= Math.min(m.amountCents, invested);
      }
    } else if (m.type === "AMORTIZATION") {
      invested -= Math.min(m.amountCents, invested);
    }
  }
  invested = Math.max(0, invested);
  const qty = Math.round(quantity * 1e8) / 1e8;
  return { investedCents: invested, quantity: qty, averagePriceCents: qty > 0 ? Math.round(invested / qty) : null };
}

/** First day money went in: when the bank only gives the asset's issue date, that is the fallback. */
export function heldSince(movements: Movement[], issueDate: string | null): string | null {
  const firstBuy = movements.filter((m) => m.type === "BUY").map((m) => m.date).sort()[0];
  return firstBuy ?? issueDate;
}

/** Gain or loss on value: today minus what was put in. Null when the cost basis is unknown. */
export function gain(amountCents: number, investedCents: number | null) {
  if (investedCents === null) return null;
  const cents = amountCents - investedCents;
  return { cents, ratio: investedCents > 0 ? cents / investedCents : null };
}

const EXEMPT = new Set(["LCI", "LCA", "CRI", "CRA", "LIG"]);

/** Brazilian regressive income tax on fixed income gains; 0 for exempt notes, null where it does not apply. */
export function incomeTaxRate(type: string, subtype: string | null, daysHeld: number): number | null {
  if (type !== "FIXED_INCOME") return null;
  if (subtype && EXEMPT.has(subtype)) return 0;
  if (daysHeld <= 180) return 0.225;
  if (daysHeld <= 360) return 0.2;
  if (daysHeld <= 720) return 0.175;
  return 0.15;
}

/**
 * "Se resgatar hoje": gross value minus the taxes the institution reports. When it reports none,
 * fixed income gets the regressive income tax estimated on the gain.
 */
export function netIfWithdrawn(input: {
  type: string;
  subtype: string | null;
  amountCents: number;
  investedCents: number | null;
  taxesCents: number | null;
  since: string | null;
  today: string;
}) {
  if (input.taxesCents !== null) return { netCents: input.amountCents - input.taxesCents, taxCents: input.taxesCents, rate: null, estimated: false };
  const g = gain(input.amountCents, input.investedCents);
  const rate = input.since ? incomeTaxRate(input.type, input.subtype, daysBetween(input.since, input.today)) : null;
  if (!g || g.cents <= 0 || rate === null) return { netCents: input.amountCents, taxCents: 0, rate, estimated: rate !== null };
  const tax = Math.round(g.cents * rate);
  return { netCents: input.amountCents - tax, taxCents: tax, rate, estimated: true };
}

/** Dividends, JCP, real-estate fund rent and coupons in the last 12 months. */
export function incomeLast12Months(movements: Movement[], today: string): number {
  const from = addDays(today, -365);
  return movements.filter((m) => m.type === "INTEREST" && m.date > from && m.date <= today).reduce((s, m) => s + m.amountCents, 0);
}

/** "Rende por mês, em média": gain spread over the months since the money went in (at least one). */
export function averageMonthlyGain(gainCents: number, since: string, today: string): number {
  const months = Math.max(1, daysBetween(since, today) / 30.4375);
  return Math.round(gainCents / months);
}

export type AssetClass = "fixed" | "equity" | "real_estate" | "funds" | "pension" | "crypto" | "other";

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  fixed: "Renda fixa",
  equity: "Ações e ETFs",
  real_estate: "Fundos imobiliários",
  funds: "Fundos",
  pension: "Previdência",
  crypto: "Cripto",
  other: "Outros",
};

/** Groups for "Onde está" and the Renda fixa | Variável filter. */
export function assetClass(type: string, subtype: string | null): AssetClass {
  if (type === "FIXED_INCOME") return "fixed";
  if (type === "EQUITY") return subtype === "REAL_ESTATE_FUND" ? "real_estate" : "equity";
  if (type === "ETF") return "equity";
  if (type === "MUTUAL_FUND") return "funds";
  if (type === "SECURITY") return "pension";
  if (type === "CRYPTO") return "crypto";
  return "other";
}

/** Short badge on the asset tile ("CDB", "TD", "AÇÃO", "FII"). */
export function assetBadge(type: string, subtype: string | null): string {
  const bySubtype: Record<string, string> = {
    TREASURY: "TD",
    STOCK: "AÇÃO",
    REAL_ESTATE_FUND: "FII",
    DEBENTURES: "DEB",
    STRUCTURED_NOTE: "COE",
    PGBL: "PREV",
    VGBL: "PREV",
    RETIREMENT: "PREV",
  };
  if (subtype && bySubtype[subtype]) return bySubtype[subtype];
  if (type === "FIXED_INCOME" && subtype) return subtype.slice(0, 4);
  const byType: Record<string, string> = { EQUITY: "AÇÃO", ETF: "ETF", MUTUAL_FUND: "FUND", SECURITY: "PREV", COE: "COE", CRYPTO: "CRIP" };
  return byType[type] ?? "INV";
}

// ---------- Goals ----------

export type GoalLink = {
  mode: "all" | "part";
  partCents: number | null;
  ownerId: string;
  amountCents: number;
  investedCents: number | null;
  status: InvestmentStatus;
};

export type GoalDeposit = { userId: string; amountCents: number };

/**
 * Goal progress = manual deposits + the linked share of each investment's value today.
 * A share splits into what was put in and what it earned in the same proportion as the asset.
 * Withdrawn assets stop counting; the split per person follows who owns each asset.
 */
export function goalProgress(targetCents: number, deposits: GoalDeposit[], links: GoalLink[]) {
  let contributed = 0;
  let earned = 0;
  const byUser: Record<string, number> = {};
  for (const d of deposits) {
    contributed += d.amountCents;
    byUser[d.userId] = (byUser[d.userId] ?? 0) + d.amountCents;
  }
  for (const link of links) {
    if (link.status === "withdrawn" || link.amountCents <= 0) continue;
    const counted = link.mode === "all" ? link.amountCents : Math.max(0, Math.min(link.partCents ?? 0, link.amountCents));
    const principal = link.investedCents === null ? counted : Math.round((link.investedCents * counted) / link.amountCents);
    contributed += principal;
    earned += counted - principal;
    byUser[link.ownerId] = (byUser[link.ownerId] ?? 0) + counted;
  }
  const saved = contributed + earned;
  return { savedCents: saved, contributedCents: contributed, earnedCents: earned, byUser, ratio: targetCents > 0 ? saved / targetCents : 0 };
}

/**
 * Whether one more link fits an investment: "Tudo" excludes any other link, and the parts together
 * cannot exceed its value today.
 */
export function linkFits(existing: Array<Pick<GoalLink, "mode" | "partCents">>, next: Pick<GoalLink, "mode" | "partCents">, amountCents: number): boolean {
  if (existing.some((l) => l.mode === "all")) return false;
  if (next.mode === "all") return existing.length === 0;
  const part = next.partCents ?? 0;
  if (part <= 0) return false;
  const used = existing.reduce((s, l) => s + (l.partCents ?? 0), 0);
  return used + part <= amountCents;
}

/**
 * "No ritmo atual, completa em": average of the deposits of the last 6 months over what is missing.
 * No projected yield, so it errs on the late side. Null when nothing was put in lately.
 */
export function completionMonth(remainingCents: number, recentDeposits: Array<{ date: string; amountCents: number }>, today: string, months = 6): string | null {
  if (remainingCents <= 0) return monthOf(today);
  const from = addMonths(today, -months);
  const total = recentDeposits.filter((d) => d.date > from && d.date <= today).reduce((s, d) => s + d.amountCents, 0);
  const monthly = total / months;
  if (monthly <= 0) return null;
  return monthOf(addMonths(today, Math.ceil(remainingCents / monthly)));
}

// ---------- Portfolio ----------

export type PortfolioItem = {
  id: string;
  ownerId: string;
  type: string;
  subtype: string | null;
  amountCents: number;
  investedCents: number | null;
  status: InvestmentStatus;
  scope: "mine" | "ours";
  visibility: "private" | "totals" | "details";
};

/** Open positions only: withdrawn assets keep their history but leave the totals. */
export function isOpen(item: Pick<PortfolioItem, "status">): boolean {
  return item.status !== "withdrawn";
}

/** "Meu patrimônio": total, put in, gains and losses apart, and where the money is. */
export function portfolioSummary(items: PortfolioItem[]) {
  const open = items.filter(isOpen);
  let total = 0;
  let invested = 0;
  let gains = 0;
  let losses = 0;
  const byClass = new Map<AssetClass, number>();
  for (const item of open) {
    total += item.amountCents;
    // Without a cost basis the asset adds to both sides: no gain is claimed for it.
    invested += item.investedCents ?? item.amountCents;
    const g = gain(item.amountCents, item.investedCents);
    if (g && g.cents > 0) gains += g.cents;
    if (g && g.cents < 0) losses += g.cents;
    const cls = assetClass(item.type, item.subtype);
    byClass.set(cls, (byClass.get(cls) ?? 0) + item.amountCents);
  }
  const classes = [...byClass.entries()]
    .map(([cls, cents]) => ({ cls, label: ASSET_CLASS_LABEL[cls], cents, ratio: total > 0 ? cents / total : 0 }))
    .sort((a, b) => b.cents - a.cents);
  return {
    count: open.length,
    totalCents: total,
    investedCents: invested,
    gainCents: total - invested,
    gainRatio: invested > 0 ? (total - invested) / invested : null,
    gainsCents: gains,
    lossesCents: losses,
    classes,
  };
}

/**
 * What a person may see of the partner's investments outside Nosso. "Só eu vejo" does not exist
 * for them, not even inside a total; "Só totais" adds to the total only; "Com detalhes" also shows
 * the asset. Anything dropped here never leaves the server.
 */
export function partnerInvestmentsView(items: PortfolioItem[]) {
  const shown = items.filter((i) => isOpen(i) && i.scope === "mine" && i.visibility !== "private");
  return {
    totalCents: shown.length > 0 ? shown.reduce((s, i) => s + i.amountCents, 0) : null,
    assets: shown.filter((i) => i.visibility === "details"),
  };
}

export type Snapshot = { investmentId: string; date: string; amountCents: number; investedCents: number | null };

/**
 * Sum of the assets on each date, carrying each asset's last known value forward. A date shows
 * only once some asset already had a value on or before it.
 */
export function portfolioSeries(snapshots: Snapshot[], dates: string[]) {
  const byAsset = new Map<string, Snapshot[]>();
  for (const s of [...snapshots].sort((a, b) => a.date.localeCompare(b.date))) {
    const list = byAsset.get(s.investmentId) ?? [];
    list.push(s);
    byAsset.set(s.investmentId, list);
  }
  const points: Array<{ date: string; amountCents: number; investedCents: number }> = [];
  for (const date of dates) {
    let amount = 0;
    let invested = 0;
    let any = false;
    for (const list of byAsset.values()) {
      let last: Snapshot | undefined;
      for (const s of list) {
        if (s.date > date) break;
        last = s;
      }
      if (!last) continue;
      any = true;
      amount += last.amountCents;
      invested += last.investedCents ?? last.amountCents;
    }
    if (any) points.push({ date, amountCents: amount, investedCents: invested });
  }
  return points;
}

/**
 * Dates for the evolution chart: the end of each month in the period and today. When the history
 * is shorter than two of those, each day with a value is a point instead.
 */
export function seriesDates(snapshots: Snapshot[], today: string, months: number | "all") {
  const first = snapshots.map((s) => s.date).sort()[0];
  if (!first) return [];
  const startMonth = months === "all" ? monthOf(first) : monthOf(addMonths(today, -(months - 1)));
  const dates: string[] = [];
  for (let m = startMonth; m < monthOf(today); m = monthOf(addMonths(`${m}-01`, 1))) {
    dates.push(addDays(`${monthOf(addMonths(`${m}-01`, 1))}-01`, -1));
  }
  dates.push(today);
  const covered = dates.filter((d) => d >= first);
  if (covered.length >= 2) return covered;
  const from = `${startMonth}-01`;
  return [...new Set(snapshots.map((s) => s.date).filter((d) => d >= from && d <= today))].sort();
}

/**
 * "Rendeu em <mês>": change of gain since the start of the month. Assets first seen inside the
 * month count from their first value, so money put in is never taken as yield.
 */
export function gainSince(snapshots: Snapshot[], items: Array<Pick<PortfolioItem, "id" | "amountCents" | "investedCents" | "status">>, from: string): number | null {
  let total = 0;
  let any = false;
  for (const item of items.filter(isOpen)) {
    if (item.investedCents === null) continue;
    const own = snapshots.filter((s) => s.investmentId === item.id && s.investedCents !== null).sort((a, b) => a.date.localeCompare(b.date));
    const base = [...own].reverse().find((s) => s.date < from) ?? own[0];
    if (!base) continue;
    any = true;
    total += item.amountCents - item.investedCents - (base.amountCents - (base.investedCents ?? base.amountCents));
  }
  return any ? total : null;
}

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Chart points with their axis label: month names for monthly points, "dd/mm" for daily ones. */
export function evolution(snapshots: Snapshot[], today: string, period: "6m" | "1a" | "tudo") {
  const dates = seriesDates(snapshots, today, period === "6m" ? 6 : period === "1a" ? 12 : "all");
  const points = portfolioSeries(snapshots, dates);
  const monthly = dates.slice(0, -1).every((d) => addDays(d, 1).endsWith("-01")) && dates.length > 1;
  return points.map((p) => ({
    ...p,
    label: monthly ? MONTH_SHORT[Number(p.date.slice(5, 7)) - 1] : `${p.date.slice(8, 10)}/${p.date.slice(5, 7)}`,
  }));
}
