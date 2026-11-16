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
