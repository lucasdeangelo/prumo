import "server-only";

import { todayIn } from "@/lib/domain/dates";
import { termsFromRow, valueFixedIncome, type RateIndex } from "@/lib/domain/fixed-income";
import { assetClass, costBasis, type Movement, type MovementType } from "@/lib/domain/investments";
import { formatBRL } from "@/lib/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";

import { loadRates } from "./market-rates";
import { linkInvestment } from "./plans";
import { DomainError } from "./transactions";

export const MANUAL_KINDS = {
  cdb: { type: "FIXED_INCOME", subtype: "CDB", label: "CDB" },
  tesouro: { type: "FIXED_INCOME", subtype: "TREASURY", label: "Tesouro" },
  lci: { type: "FIXED_INCOME", subtype: "LCI", label: "LCI/LCA" },
  acao: { type: "EQUITY", subtype: "STOCK", label: "Ações" },
  fii: { type: "EQUITY", subtype: "REAL_ESTATE_FUND", label: "FIIs" },
  etf: { type: "ETF", subtype: "ETF", label: "ETFs" },
  fundo: { type: "MUTUAL_FUND", subtype: "INVESTMENT_FUND", label: "Fundos" },
  cripto: { type: "CRYPTO", subtype: null, label: "Cripto" },
} as const;
export type ManualKind = keyof typeof MANUAL_KINDS;

/** How a manual asset is valued: by the index (fixed income), by quantity × price, or by a total typed in. */
export function valuation(type: string, subtype: string | null): "index" | "quote" | "total" {
  const cls = assetClass(type, subtype);
  if (cls === "fixed") return "index";
  if (type === "MUTUAL_FUND" || cls === "pension") return "total";
  return "quote";
}

export type ManualInput = {
  kind: ManualKind;
  scope: "mine" | "ours";
  name: string | null;
  institution: string | null;
  date: string;
  goalId: string | null;
  // Fixed income and funds
  amountCents?: number;
  index?: RateIndex;
  rate?: number | null;
  due?: string | null;
  // Stocks, ETFs, real-estate funds, crypto
  quantity?: number;
  priceCents?: number;
};

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function defaultName(input: ManualInput): string {
  const { kind } = input;
  if (kind === "tesouro") {
    const year = input.due ? ` ${input.due.slice(0, 4)}` : "";
    return input.index === "selic" ? `Tesouro Selic${year}` : input.index === "ipca" ? `Tesouro IPCA+${year}` : `Tesouro Prefixado${year}`;
  }
  if (kind === "cdb" || kind === "lci") {
    const rate = input.index === "cdi" ? `${fmt(input.rate ?? 100)}% CDI` : input.index === "ipca" ? `IPCA + ${fmt(input.rate ?? 0)}%` : input.index === "pre" ? `${fmt(input.rate ?? 0)}% a.a.` : "Selic";
    return [kind === "cdb" ? "CDB" : "LCI/LCA", input.institution, rate].filter(Boolean).join(" ");
  }
  return MANUAL_KINDS[kind].label;
}

/** Recomputes a manual asset from its movements (and the index or the last price) and stores the day's value. */
export async function revalueManual(userId: string, investmentId: string) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("investments")
    .select("id, user_id, type, subtype, rate, rate_type, fixed_annual_rate, unit_value_cents, amount_cents, status")
    .eq("id", investmentId)
    .eq("user_id", userId)
    .eq("source", "manual")
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return;
  const { data: rows } = await admin.from("investment_movements").select("type, movement_type, date, quantity, amount_cents").eq("investment_id", investmentId);
  const movements: Movement[] = (rows ?? []).map((m) => ({ type: m.type as MovementType, movementType: m.movement_type as Movement["movementType"], date: m.date as string, quantity: m.quantity === null ? null : Number(m.quantity), amountCents: m.amount_cents as number }));
  // Without movements there is nothing to rebuild the value from: keep what is stored.
  if (movements.length === 0) return;
  const basis = costBasis(movements);
  const today = todayIn();
  const how = valuation(row.type as string, row.subtype as string | null);
  let amount = row.amount_cents as number;
  if (how === "index") {
    const terms = termsFromRow({ rate: row.rate === null ? null : Number(row.rate), rate_type: row.rate_type as string | null, fixed_annual_rate: row.fixed_annual_rate === null ? null : Number(row.fixed_annual_rate) });
    const first = movements.map((m) => m.date).sort()[0] ?? today;
    amount = terms ? valueFixedIncome(movements, terms, await loadRates(first), today).amountCents : basis.investedCents;
  } else if (how === "quote") {
    amount = Math.round(basis.quantity * ((row.unit_value_cents as number | null) ?? 0));
  }
  const open = how === "quote" ? basis.quantity > 0 : amount > 0;
  await admin
    .from("investments")
    .update({
      amount_cents: open ? amount : 0,
      balance_cents: open ? amount : 0,
      invested_cents: basis.investedCents,
      quantity: how === "quote" ? basis.quantity : null,
      status: open ? "active" : "withdrawn",
      ...(how === "index" ? { value_date: today } : {}),
    })
    .eq("id", investmentId)
    .eq("user_id", userId);
  if (open) {
    await admin
      .from("investment_snapshots")
      .upsert({ user_id: userId, investment_id: investmentId, on_date: today, amount_cents: amount, invested_cents: basis.investedCents }, { onConflict: "investment_id,on_date" });
  }
}

/** "Novo investimento · cadastre à mão": the asset, its first movement, its value today and, optionally, a goal. */
export async function createManualInvestment(userId: string, input: ManualInput): Promise<string> {
  const kind = MANUAL_KINDS[input.kind];
  const how = valuation(kind.type, kind.subtype);
  const today = todayIn();
  if (input.date > today) throw new DomainError("A data não pode estar no futuro.");
  if (how === "quote" && (!input.quantity || input.quantity <= 0 || !input.priceCents || input.priceCents <= 0)) throw new DomainError("Informe a quantidade e o preço pago.");
  if (how !== "quote" && (!input.amountCents || input.amountCents <= 0)) throw new DomainError("Informe o valor aplicado.");
  if (how === "index" && input.index !== "selic" && (input.rate === null || input.rate === undefined || input.rate <= 0)) throw new DomainError("Informe a rentabilidade.");
  if (input.due && input.due <= input.date) throw new DomainError("O vencimento precisa ser depois da data da aplicação.");

  const amount = how === "quote" ? Math.round((input.quantity ?? 0) * (input.priceCents ?? 0)) : (input.amountCents ?? 0);
  const terms =
    how !== "index"
      ? { rate: null, rate_type: null, fixed_annual_rate: null }
      : input.index === "cdi"
        ? { rate: input.rate, rate_type: "CDI", fixed_annual_rate: null }
        : input.index === "selic"
          ? { rate: input.rate ?? 100, rate_type: "SELIC", fixed_annual_rate: null }
          : input.index === "ipca"
            ? { rate: null, rate_type: "IPCA", fixed_annual_rate: input.rate }
            : { rate: null, rate_type: null, fixed_annual_rate: input.rate };

  const admin = createAdminClient();
  const name = (input.name?.trim() || defaultName(input)).slice(0, 160);
  const { data: created, error } = await admin
    .from("investments")
    .insert({
      user_id: userId,
      source: "manual",
      type: kind.type,
      subtype: kind.subtype,
      name,
      code: how === "quote" ? name.toUpperCase().slice(0, 20) : null,
      institution: input.institution?.trim() || null,
      quantity: how === "quote" ? input.quantity : null,
      unit_value_cents: how === "quote" ? input.priceCents : null,
      amount_cents: amount,
      invested_cents: amount,
      ...terms,
      issue_date: input.date,
      due_date: how === "index" ? (input.due ?? null) : null,
      value_date: input.date,
      status: "active",
      scope: input.scope,
      // Manual assets follow the same default as connected ones: the partner sees the total.
      visibility: "totals",
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(`Falha ao salvar investimento: ${error?.message}`);
  const id = created.id as string;
  const { error: movementError } = await admin
    .from("investment_movements")
    .insert({ user_id: userId, investment_id: id, type: "BUY", movement_type: "CREDIT", date: input.date, quantity: how === "quote" ? input.quantity : null, unit_value_cents: how === "quote" ? input.priceCents : null, amount_cents: amount });
  if (movementError) {
    await admin.from("investments").delete().eq("id", id).eq("user_id", userId);
    throw new Error(`Falha ao salvar a aplicação: ${movementError.message}`);
  }
  await revalueManual(userId, id);
  if (input.goalId) await linkInvestment(userId, id, input.goalId, "all", null);
  return id;
}

export type MovementInput =
  | { kind: "aporte" | "resgate"; amountCents: number; date: string }
  | { kind: "compra" | "venda"; quantity: number; priceCents: number; date: string }
  | { kind: "cotacao"; priceCents: number }
  | { kind: "valor"; amountCents: number };

/** Aporte, resgate, compra, venda or a new price for an asset typed by hand. Connected ones come from the bank. */
export async function recordManualMovement(userId: string, investmentId: string, input: MovementInput) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("investments")
    .select("id, type, subtype, amount_cents, quantity, status, value_date")
    .eq("id", investmentId)
    .eq("user_id", userId)
    .eq("source", "manual")
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) throw new DomainError("Investimento não encontrado.");
  const how = valuation(row.type as string, row.subtype as string | null);
  const today = todayIn();

  if (input.kind === "cotacao") {
    if (how !== "quote" || input.priceCents <= 0) throw new DomainError("Informe a cotação.");
    await admin.from("investments").update({ unit_value_cents: input.priceCents, value_date: today }).eq("id", investmentId).eq("user_id", userId);
    return revalueManual(userId, investmentId);
  }
  if (input.kind === "valor") {
    if (how !== "total" || input.amountCents < 0) throw new DomainError("Informe o valor atual.");
    await admin.from("investments").update({ amount_cents: input.amountCents, value_date: today }).eq("id", investmentId).eq("user_id", userId);
    return revalueManual(userId, investmentId);
  }
  if (input.date > today) throw new DomainError("A data não pode estar no futuro.");

  if (input.kind === "aporte" || input.kind === "resgate") {
    if (how === "quote") throw new DomainError("Para este investimento, registre compra ou venda.");
    if (input.amountCents <= 0) throw new DomainError("Informe o valor.");
    if (input.kind === "resgate" && input.amountCents > (row.amount_cents as number)) throw new DomainError(`O resgate passa do valor de hoje (${formatBRL(row.amount_cents as number)}).`);
    await admin.from("investment_movements").insert({
      user_id: userId,
      investment_id: investmentId,
      type: input.kind === "aporte" ? "BUY" : "SELL",
      movement_type: input.kind === "aporte" ? "CREDIT" : "DEBIT",
      date: input.date,
      amount_cents: input.amountCents,
    });
    // A fund typed by total moves its value by the same amount.
    if (how === "total") {
      const delta = input.kind === "aporte" ? input.amountCents : -input.amountCents;
      await admin.from("investments").update({ amount_cents: Math.max(0, (row.amount_cents as number) + delta) }).eq("id", investmentId).eq("user_id", userId);
    }
    return revalueManual(userId, investmentId);
  }

  if (input.kind !== "compra" && input.kind !== "venda") return;
  if (how !== "quote") throw new DomainError("Para este investimento, registre aporte ou resgate.");
  if (input.quantity <= 0 || input.priceCents <= 0) throw new DomainError("Informe a quantidade e o preço.");
  const held = row.quantity === null ? 0 : Number(row.quantity);
  if (input.kind === "venda" && input.quantity > held + 1e-9) throw new DomainError(`A venda passa da quantidade que você tem (${held.toLocaleString("pt-BR", { maximumFractionDigits: 8 })}).`);
  await admin.from("investment_movements").insert({
    user_id: userId,
    investment_id: investmentId,
    type: input.kind === "compra" ? "BUY" : "SELL",
    movement_type: input.kind === "compra" ? "CREDIT" : "DEBIT",
    date: input.date,
    quantity: input.quantity,
    unit_value_cents: input.priceCents,
    amount_cents: Math.round(input.quantity * input.priceCents),
  });
  // The trade price is the newest price known unless a later quote was typed.
  if (!row.value_date || input.date >= (row.value_date as string)) {
    await admin.from("investments").update({ unit_value_cents: input.priceCents, value_date: input.date }).eq("id", investmentId).eq("user_id", userId);
  }
  return revalueManual(userId, investmentId);
}

/** Removes an asset typed by hand from every screen and goal (history kept in the database). */
export async function deleteManualInvestment(userId: string, investmentId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("investments").update({ deleted_at: new Date().toISOString() }).eq("id", investmentId).eq("user_id", userId).eq("source", "manual").is("deleted_at", null).select("id");
  if (!data?.length) throw new DomainError("Investimento não encontrado.");
  await admin.from("goal_investments").delete().eq("investment_id", investmentId);
}

/**
 * Scheduled (with the bank sync, every 15 min; work happens once a day): fixed income typed by
 * hand earns the day's index, and every open manual asset gets the day's value for the charts.
 */
export async function revalueAllManual() {
  const admin = createAdminClient();
  const today = todayIn();
  const { data: rows } = await admin.from("investments").select("id, user_id").eq("source", "manual").eq("include", true).is("deleted_at", null).neq("status", "withdrawn");
  if (!rows?.length) return { revalued: 0 };
  const { data: done } = await admin.from("investment_snapshots").select("investment_id").eq("on_date", today).in("investment_id", rows.map((r) => r.id as string));
  const fresh = new Set((done ?? []).map((d) => d.investment_id as string));
  let revalued = 0;
  for (const row of rows) {
    if (fresh.has(row.id as string)) continue;
    try {
      await revalueManual(row.user_id as string, row.id as string);
      revalued += 1;
    } catch (error) {
      console.error("manual revalue failed", error instanceof Error ? error.message : error);
    }
  }
  return { revalued };
}
