import "server-only";

import { instantToDate, monthBounds, todayIn } from "@/lib/domain/dates";
import { dailyBalances, overdraftMonth, type OverdraftMonth } from "@/lib/domain/overdraft";
import { createAdminClient } from "@/lib/supabase/admin";

import { loadAccounts, type AccountRow } from "./couple-data";

export type AccountOverdraft = OverdraftMonth & {
  account: AccountRow;
  /** Limit available beyond the balance: balance + contracted limit. */
  availableCents: number | null;
};

/**
 * Overdraft use of a person's checking accounts in a month. Daily balances are rebuilt from the
 * balance the bank reported at the last sync, using only the bank's own movements (manual
 * entries on the account would bend the curve).
 */
export async function overdraftFor(userId: string, month: string): Promise<AccountOverdraft[]> {
  const accounts = (await loadAccounts([userId])).filter(
    (a) => a.type === "BANK" && a.pluggy_item_id && a.import_enabled && a.balance_cents !== null && a.balance_synced_at,
  );
  if (accounts.length === 0) return [];
  const { start } = monthBounds(month);
  const result: AccountOverdraft[] = [];
  for (const account of accounts) {
    const asOf = instantToDate(account.balance_synced_at!);
    if (asOf < start) continue;
    const { data } = await createAdminClient()
      .from("transactions")
      .select("transaction_date, type, amount_cents, provider_description")
      .eq("user_id", userId)
      .eq("account_id", account.id)
      .eq("source", "pluggy")
      .gte("transaction_date", start)
      .lte("transaction_date", asOf)
      .is("deleted_at", null)
      .limit(5000);
    const movements = (data ?? []).map((t) => ({
      date: t.transaction_date as string,
      type: t.type as "credit" | "debit",
      amount_cents: t.amount_cents as number,
      description: (t.provider_description as string | null) ?? "",
    }));
    const days = dailyBalances(account.balance_cents!, asOf, movements, start);
    const summary = overdraftMonth(days, month, movements);
    const limit = account.overdraft_limit_cents;
    if (summary.negativeDays === 0 && summary.chargesCents === 0 && !(account.overdraft_used_cents ?? 0)) continue;
    result.push({ ...summary, account, availableCents: limit !== null ? account.balance_cents! + limit : null });
  }
  return result;
}

/** Today's overdraft position of an account, for the account screen. */
export function overdraftNow(account: AccountRow) {
  if (account.type !== "BANK" || account.overdraft_limit_cents === null) return null;
  const balance = account.balance_cents ?? 0;
  const used = account.overdraft_used_cents ?? Math.max(0, -balance);
  return { limitCents: account.overdraft_limit_cents, usedCents: used, availableCents: balance + account.overdraft_limit_cents, asOf: account.balance_synced_at ?? todayIn() };
}

