import "server-only";

import { addDays, todayIn } from "@/lib/domain/dates";
import type { RecurrenceType, RecurrenceUnit } from "@/lib/domain/recurrence";
import { findBillMatches } from "@/lib/domain/reconcile";
import { createAdminClient } from "@/lib/supabase/admin";
import { BILL_COLUMNS, transactionLabel, type Transaction, type UpcomingBill } from "@/lib/types";

import { DomainError } from "./transactions";

export type NewBill = {
  description: string;
  amountCents: number;
  type: "payable" | "receivable";
  dueDate: string;
  recurrenceType: RecurrenceType;
  recurrenceInterval?: number | null;
  recurrenceUnit?: RecurrenceUnit | null;
  tagId?: string | null;
  accountId?: string | null;
  notifyDaysBefore: number;
};

export async function createBill(userId: string, input: NewBill) {
  const admin = createAdminClient();
  for (const [table, id] of [["tags", input.tagId], ["accounts", input.accountId]] as const) {
    if (!id) continue;
    const { data } = await admin.from(table).select("id").eq("user_id", userId).eq("id", id).maybeSingle();
    if (!data) throw new DomainError("Referência inválida.");
  }
  const { error } = await admin.from("upcoming_bills").insert({
    user_id: userId,
    description: input.description.trim().slice(0, 120),
    amount_cents: input.amountCents,
    type: input.type,
    due_date: input.dueDate,
    recurrence_type: input.recurrenceType,
    recurrence_interval: input.recurrenceType === "custom" ? input.recurrenceInterval : null,
    recurrence_unit: input.recurrenceType === "custom" ? input.recurrenceUnit : null,
    tag_id: input.tagId ?? null,
    account_id: input.accountId ?? null,
    notify_days_before: input.notifyDaysBefore,
  });
  if (error) throw new Error(`Falha ao salvar conta: ${error.message}`);
}

/** Atomic and idempotent (see mark_bill_paid). Optionally links an existing fact instead of creating one. */
export async function markBillPaid(userId: string, billId: string, transactionId?: string | null, source = "app") {
  const { data, error } = await createAdminClient().rpc("mark_bill_paid", {
    p_user: userId,
    p_bill: billId,
    p_transaction: transactionId ?? null,
    p_paid_on: todayIn(),
    p_source: source,
  });
  if (error) {
    if (error.code === "23505") throw new DomainError("Essa movimentação já quitou outra conta.");
    if (error.code === "P0002") throw new DomainError("Conta não encontrada.");
    throw new Error(`Falha ao pagar conta: ${error.message}`);
  }
  return data as { already_paid: boolean; transaction_id: string | null; next_bill_id?: string | null };
}

export async function cancelBill(userId: string, billId: string) {
  const { error } = await createAdminClient()
    .from("upcoming_bills")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("id", billId)
    .in("status", ["pending", "overdue"]);
  if (error) throw new Error(`Falha ao cancelar: ${error.message}`);
}

/** Transactions that could settle the bill, best first, for the "it was this one" picker. */
export async function billCandidates(userId: string, bill: UpcomingBill) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("transactions")
    .select("id, amount_cents, type, transaction_date, user_description, provider_description, merchant")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("transaction_date", addDays(bill.due_date, -10))
    .lte("transaction_date", addDays(bill.due_date, 10));
  const { data: used } = await admin.from("upcoming_bills").select("matched_transaction_id").eq("user_id", userId).not("matched_transaction_id", "is", null);
  const txs = (data ?? []) as Array<Pick<Transaction, "id" | "amount_cents" | "type" | "transaction_date" | "user_description" | "provider_description" | "merchant">>;
  const { candidates } = findBillMatches(
    bill,
    txs.map((t) => ({ ...t, description: transactionLabel(t) })),
    new Set((used ?? []).map((u) => u.matched_transaction_id as string)),
  );
  const byId = new Map(txs.map((t) => [t.id, t]));
  return candidates.slice(0, 5).map((c) => ({ ...c, transaction: byId.get(c.transactionId)! }));
}

/**
 * After an import, settles pending bills that have exactly one strong match.
 * Ambiguous bills are left for the user. Re-running is safe (mark_bill_paid is idempotent).
 */
export async function autoReconcileBills(userId: string) {
  const admin = createAdminClient();
  const today = todayIn();
  const { data: bills } = await admin
    .from("upcoming_bills")
    .select(BILL_COLUMNS)
    .eq("user_id", userId)
    .in("status", ["pending", "overdue"])
    .is("deleted_at", null)
    .lte("due_date", addDays(today, 10));
  let settled = 0;
  for (const bill of (bills ?? []) as UpcomingBill[]) {
    const options = await billCandidates(userId, bill);
    const strong = options.filter((o) => o.score >= 0.9);
    if (strong.length !== 1) continue;
    try {
      await markBillPaid(userId, bill.id, strong[0].transactionId, "reconciliation");
      settled += 1;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
    }
  }
  return { settled };
}
