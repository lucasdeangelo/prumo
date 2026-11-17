/**
 * Accounts grouped by bank for the home screen: one row per institution, with each product
 * (conta, poupança, cartão) as a small link inside it. An account without an institution joins
 * the bank of its connection; a manual one without an institution stays on its own row.
 */

import { normalizeText } from "./normalize";

export type GroupableAccount = {
  id: string;
  name: string;
  type: string | null;
  subtype: string | null;
  balance_cents: number | null;
  pluggy_item_id: string | null;
  institution: string | null;
  card_last4: string | null;
  visibility: "private" | "totals" | "details";
};

export type AccountProduct = { id: string; label: string; last4: string | null };

export type BankGroup = {
  key: string;
  name: string;
  products: AccountProduct[];
  /** Money in the bank's accounts; cards are debt and stay in Cartões. Null when none reports a balance. */
  balanceCents: number | null;
  /** The visibility shared by every account of the bank, or null when they differ. */
  visibility: GroupableAccount["visibility"] | null;
};

function productLabel(account: GroupableAccount, named: boolean): string {
  if (account.type === "CREDIT") return "Cartão";
  if (account.subtype === "SAVINGS_ACCOUNT") return "Poupança";
  // Under a bank's name it is just "Conta"; an account of no bank keeps its own name.
  return named ? "Conta" : account.name;
}


export function groupAccountsByBank<A extends GroupableAccount>(accounts: A[]): BankGroup[] {
  const itemInstitution = new Map<string, string>();
  for (const a of accounts) if (a.pluggy_item_id && a.institution && !itemInstitution.has(a.pluggy_item_id)) itemInstitution.set(a.pluggy_item_id, a.institution);
  const groups = new Map<string, A[]>();
  for (const account of accounts) {
    const institution = account.institution ?? (account.pluggy_item_id ? itemInstitution.get(account.pluggy_item_id) : undefined);
    const key = institution ? `bank:${normalizeText(institution)}` : account.pluggy_item_id ? `item:${account.pluggy_item_id}` : `manual:${account.id}`;
    groups.set(key, [...(groups.get(key) ?? []), account]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const named = !key.startsWith("manual:");
    // Checking accounts first, then savings, then cards.
    const order = (a: A) => (a.type === "CREDIT" ? 2 : a.subtype === "SAVINGS_ACCOUNT" ? 1 : 0);
    const sorted = [...list].sort((a, b) => order(a) - order(b));
    const withBalance = sorted.filter((a) => a.type !== "CREDIT" && a.balance_cents !== null);
    const visibilities = new Set(sorted.map((a) => a.visibility));
    return {
      key,
      name: sorted.find((a) => a.institution)?.institution ?? (sorted[0].pluggy_item_id ? itemInstitution.get(sorted[0].pluggy_item_id) : undefined) ?? sorted[0].name,
      products: sorted.map((a) => ({ id: a.id, label: productLabel(a, named), last4: a.card_last4 })),
      balanceCents: withBalance.length ? withBalance.reduce((s, a) => s + (a.balance_cents ?? 0), 0) : null,
      visibility: visibilities.size === 1 ? sorted[0].visibility : null,
    };
  });
}
