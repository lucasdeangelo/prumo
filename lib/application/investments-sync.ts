import "server-only";

import { todayIn } from "@/lib/domain/dates";
import { costBasis, investmentFromProvider, movementFromProvider, type Movement, type MovementType } from "@/lib/domain/investments";
import * as pluggy from "@/lib/integrations/pluggy";
import { createAdminClient } from "@/lib/supabase/admin";

type LocalInvestment = {
  id: string;
  provider_investment_id: string;
  include: boolean;
  status: string;
  deleted_at: string | null;
  name: string;
  subtype: string | null;
  issuer: string | null;
  due_date: string | null;
  value_date: string | null;
  amount_cents: number;
  invested_cents: number | null;
};

const LOCAL_COLUMNS = "id, provider_investment_id, include, status, deleted_at, name, subtype, issuer, due_date, value_date, amount_cents, invested_cents";

/**
 * Brings the investments of one connection. Provider fields are refreshed on every run; what the
 * person chose (Meu/Nosso, who sees it, bring or not) is never overwritten. Assets missing from a
 * successful answer are marked withdrawn, keeping their history and goal links. Each run also
 * stores the value of the day, since Pluggy has no historical series per asset.
 * Replays converge: every write is keyed by the provider's ids or by (asset, day).
 */
export async function syncInvestments(userId: string, itemRowId: string, pluggyItemId: string) {
  let list: pluggy.PluggyInvestment[];
  try {
    list = await pluggy.listInvestments(pluggyItemId);
  } catch (error) {
    // Product not offered for this connector or not in the subscription: nothing to bring.
    if (error instanceof pluggy.PluggyError && (error.status === 400 || error.status === 403 || error.status === 404)) {
      return { available: false, investments: 0, movements: 0 };
    }
    throw error;
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const today = todayIn();

  const { data: before, error: readError } = await admin
    .from("investments")
    .select(LOCAL_COLUMNS)
    .eq("user_id", userId)
    .eq("source", "pluggy")
    .eq("pluggy_item_id", itemRowId);
  if (readError) throw new Error(`Falha ao ler investimentos: ${readError.message}`);
  const known = new Set((before ?? []).map((r) => r.provider_investment_id as string));

  const providerRows = list.map((inv) => ({ ...investmentFromProvider(inv), user_id: userId, source: "pluggy", pluggy_item_id: itemRowId, synced_at: now }));
  let saved: LocalInvestment[] = [];
  if (providerRows.length > 0) {
    const { data, error } = await admin.from("investments").upsert(providerRows, { onConflict: "user_id,provider_investment_id" }).select(LOCAL_COLUMNS);
    if (error) throw new Error(`Falha ao salvar investimentos: ${error.message}`);
    saved = (data ?? []) as LocalInvestment[];
  }

  // Gone from the bank's answer: sold, redeemed or moved elsewhere.
  const current = new Set(list.map((inv) => inv.id));
  const gone = (before ?? []).filter((r) => !current.has(r.provider_investment_id as string) && r.status !== "withdrawn").map((r) => r.id as string);
  if (gone.length > 0) await admin.from("investments").update({ status: "withdrawn" }).eq("user_id", userId).in("id", gone);

  // The same bank authorized again in another connection: keep the first one so nothing counts twice.
  const fresh = saved.filter((r) => !known.has(r.provider_investment_id));
  if (fresh.length > 0) {
    const { data: others } = await admin
      .from("investments")
      .select("name, subtype, issuer, due_date")
      .eq("user_id", userId)
      .eq("include", true)
      .neq("status", "withdrawn")
      .neq("pluggy_item_id", itemRowId)
      .is("deleted_at", null);
    const key = (r: { name: string; subtype: string | null; issuer: string | null; due_date: string | null }) => [r.name, r.subtype, r.issuer, r.due_date].join("|");
    const taken = new Set((others ?? []).map((r) => key(r as LocalInvestment)));
    const twins = fresh.filter((r) => r.status !== "withdrawn" && taken.has(key(r))).map((r) => r.id);
    if (twins.length > 0) {
      await admin.from("investments").update({ include: false }).eq("user_id", userId).in("id", twins);
      for (const r of saved) if (twins.includes(r.id)) r.include = false;
    }
  }

  const live = saved.filter((r) => !r.deleted_at && r.include);

  // Movements: for open positions on every run, for closed ones only the first time they are seen.
  let movementCount = 0;
  for (const inv of live) {
    if (inv.status === "withdrawn" && known.has(inv.provider_investment_id)) continue;
    let txs: pluggy.PluggyInvestmentTransaction[];
    try {
      txs = await pluggy.listInvestmentTransactions(inv.provider_investment_id);
    } catch (error) {
      // One asset without history must not stop the others.
      if (error instanceof pluggy.PluggyError) continue;
      throw error;
    }
    const rows = txs.filter((tx) => tx.id && tx.date).map((tx) => ({ ...movementFromProvider(tx), user_id: userId, investment_id: inv.id }));
    if (rows.length === 0) continue;
    const { error } = await admin.from("investment_movements").upsert(rows, { onConflict: "investment_id,provider_movement_id" });
    if (error) throw new Error(`Falha ao salvar movimentações de investimento: ${error.message}`);
    movementCount += rows.length;
  }

  // When the bank does not say how much was put in, the movements tell it.
  const investedById = new Map<string, number>();
  {
    const ids = live.filter((r) => r.invested_cents === null).map((r) => r.id);
    if (ids.length > 0) {
      const { data: movements } = await admin.from("investment_movements").select("investment_id, type, movement_type, date, quantity, amount_cents").in("investment_id", ids);
      for (const id of ids) {
        const own: Movement[] = (movements ?? [])
          .filter((m) => m.investment_id === id)
          .map((m) => ({ type: m.type as MovementType, movementType: m.movement_type as Movement["movementType"], date: m.date as string, quantity: m.quantity === null ? null : Number(m.quantity), amountCents: m.amount_cents as number }));
        if (own.length === 0) continue;
        const basis = costBasis(own).investedCents;
        investedById.set(id, basis);
        await admin.from("investments").update({ invested_cents: basis }).eq("user_id", userId).eq("id", id);
      }
    }
  }

  // One value per day, on the date the bank priced it.
  const snapshots = live
    .filter((r) => r.status !== "withdrawn")
    .map((r) => ({
      user_id: userId,
      investment_id: r.id,
      on_date: r.value_date && r.value_date <= today ? r.value_date : today,
      amount_cents: r.amount_cents,
      invested_cents: r.invested_cents ?? investedById.get(r.id) ?? null,
    }));
  if (snapshots.length > 0) {
    const { error } = await admin.from("investment_snapshots").upsert(snapshots, { onConflict: "investment_id,on_date" });
    if (error) throw new Error(`Falha ao salvar a evolução dos investimentos: ${error.message}`);
  }

  return { available: true, investments: list.length, movements: movementCount };
}
