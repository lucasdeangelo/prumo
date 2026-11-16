import "server-only";

import type { Household } from "@/lib/application/household";
import { DomainError } from "@/lib/application/transactions";
import type { Movement, MovementType, PortfolioItem, Snapshot } from "@/lib/domain/investments";
import { createAdminClient } from "@/lib/supabase/admin";

export type InvestmentRow = {
  id: string;
  user_id: string;
  source: "pluggy" | "manual";
  pluggy_item_id: string | null;
  type: string;
  subtype: string | null;
  name: string;
  code: string | null;
  issuer: string | null;
  institution: string | null;
  quantity: number | null;
  unit_value_cents: number | null;
  amount_cents: number;
  balance_cents: number | null;
  invested_cents: number | null;
  taxes_cents: number | null;
  rate: number | null;
  rate_type: string | null;
  fixed_annual_rate: number | null;
  issue_date: string | null;
  due_date: string | null;
  value_date: string | null;
  status: "active" | "pending" | "withdrawn";
  scope: "mine" | "ours";
  visibility: "private" | "totals" | "details";
  include: boolean;
  synced_at: string | null;
};

const COLUMNS =
  "id, user_id, source, pluggy_item_id, type, subtype, name, code, issuer, institution, quantity, unit_value_cents, amount_cents, balance_cents, invested_cents, taxes_cents, rate, rate_type, fixed_annual_rate, issue_date, due_date, value_date, status, scope, visibility, include, synced_at";

function normalize(row: Record<string, unknown>): InvestmentRow {
  const r = row as InvestmentRow;
  return {
    ...r,
    quantity: r.quantity === null ? null : Number(r.quantity),
    rate: r.rate === null ? null : Number(r.rate),
    fixed_annual_rate: r.fixed_annual_rate === null ? null : Number(r.fixed_annual_rate),
  };
}

export function toPortfolioItem(row: InvestmentRow): PortfolioItem {
  return {
    id: row.id,
    ownerId: row.user_id,
    type: row.type,
    subtype: row.subtype,
    amountCents: row.amount_cents,
    investedCents: row.invested_cents,
    status: row.status,
    scope: row.scope,
    visibility: row.visibility,
  };
}

/**
 * Investments of these people, brought ones only (the person may exclude an asset).
 * Read with the service role: callers decide what the partner may see (partnerInvestmentsView).
 */
export async function loadInvestments(userIds: string[]): Promise<InvestmentRow[]> {
  const { data, error } = await createAdminClient()
    .from("investments")
    .select(COLUMNS)
    .in("user_id", userIds)
    .eq("include", true)
    .is("deleted_at", null)
    .order("amount_cents", { ascending: false });
  if (error) throw new Error(`Falha ao ler investimentos: ${error.message}`);
  return (data ?? []).map(normalize);
}

/** Assets of one connection, including the ones the person chose not to bring. */
export async function loadConnectionInvestments(userId: string, itemRowIds: string[]): Promise<InvestmentRow[]> {
  if (itemRowIds.length === 0) return [];
  const { data } = await createAdminClient()
    .from("investments")
    .select(COLUMNS)
    .eq("user_id", userId)
    .in("pluggy_item_id", itemRowIds)
    .is("deleted_at", null)
    .order("status")
    .order("amount_cents", { ascending: false });
  return (data ?? []).map(normalize);
}

export async function loadSnapshots(investmentIds: string[]): Promise<Snapshot[]> {
  if (investmentIds.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("investment_snapshots")
    .select("investment_id, on_date, amount_cents, invested_cents")
    .in("investment_id", investmentIds)
    .order("on_date")
    .limit(20000);
  if (error) throw new Error(`Falha ao ler a evolução: ${error.message}`);
  return (data ?? []).map((s) => ({ investmentId: s.investment_id as string, date: s.on_date as string, amountCents: s.amount_cents as number, investedCents: (s.invested_cents as number | null) ?? null }));
}

export async function loadMovements(investmentId: string): Promise<Array<Movement & { id: string; description: string | null }>> {
  const { data } = await createAdminClient()
    .from("investment_movements")
    .select("id, type, movement_type, date, quantity, amount_cents, description")
    .eq("investment_id", investmentId)
    .order("date", { ascending: false })
    .limit(500);
  return (data ?? []).map((m) => ({
    id: m.id as string,
    type: m.type as MovementType,
    movementType: m.movement_type as Movement["movementType"],
    date: m.date as string,
    quantity: m.quantity === null ? null : Number(m.quantity),
    amountCents: m.amount_cents as number,
    description: (m.description as string | null) ?? null,
  }));
}

/**
 * One investment as this person may see it: their own, one marked Nosso by the partner, or one the
 * partner shares "Com detalhes". Anything else does not exist for them.
 */
export async function investmentForViewer(userId: string, household: Household | null, id: string) {
  const { data } = await createAdminClient().from("investments").select(COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) return null;
  const row = normalize(data);
  if (row.user_id === userId) return { row, owner: true };
  const partnerId = household?.partner?.userId;
  if (!partnerId || row.user_id !== partnerId || !row.include) return null;
  if (row.scope === "ours" || (row.visibility === "details" && row.status !== "withdrawn")) return { row, owner: false };
  return null;
}

/** The owner's choices for one asset: Meu or Nosso, what the partner sees, bring it or not. */
export async function setInvestmentPreference(
  userId: string,
  id: string,
  patch: { scope?: "mine" | "ours"; visibility?: "private" | "totals" | "details"; include?: boolean },
) {
  const { data, error } = await createAdminClient().from("investments").update(patch).eq("user_id", userId).eq("id", id).is("deleted_at", null).select("id");
  if (error) throw new Error(`Falha ao salvar o investimento: ${error.message}`);
  if (!data?.length) throw new DomainError("Investimento não encontrado.");
}

/** Dividends, JCP, rent and coupons received by these assets since a date. */
export async function loadIncome(investmentIds: string[], from: string): Promise<number> {
  if (investmentIds.length === 0) return 0;
  const { data } = await createAdminClient()
    .from("investment_movements")
    .select("amount_cents")
    .in("investment_id", investmentIds)
    .eq("type", "INTEREST")
    .gt("date", from)
    .limit(5000);
  return (data ?? []).reduce((s, m) => s + (m.amount_cents as number), 0);
}
