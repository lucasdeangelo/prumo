// What one partner may see of the other's money. Pure: the server fetches rows with service_role
// and passes them through these functions; anything they drop never leaves the server.
//
// Principles from the design ("Decisões de UX"):
// - Private by default: an account marked "Só eu vejo" does not exist for the partner.
// - "Só totais": balance and month outflow, no items.
// - "Com detalhes": every item except the ones the owner hid; hidden items leave no trace.
// - "Só categoria e valor": the partner sees "Saúde · R$ 64,30", without the store.
// - A surprise shows as "Compra reservada por …" until its date (amount shown unless hidden).
// - Free-money purchases count only in the free-money total, never as lines.
// - Something marked "Nosso" is shared on purpose: both see it in full.

import { normalizeMerchant } from "./normalize";

export type AccountVisibility = "private" | "totals" | "details";
export type TxPrivacy = "account" | "category_only" | "hidden";
export type TxScope = "mine" | "ours" | "partner";

export type OwnedAccount = {
  id: string;
  name: string;
  visibility: AccountVisibility;
  balance_cents: number | null;
  type: string | null;
};

export type OwnedTransaction = {
  id: string;
  account_id: string | null;
  amount_cents: number;
  type: "credit" | "debit";
  transaction_date: string;
  label: string;
  tag_id: string | null;
  scope: TxScope;
  privacy: TxPrivacy;
  surprise_until: string | null;
  surprise_hide_amount: boolean;
  free_money: boolean;
};

export type PartnerLine =
  | { kind: "detail"; id: string; label: string; tagId: string | null; amountCents: number; type: "credit" | "debit"; date: string; scope: TxScope }
  | { kind: "category_only"; id: string; tagId: string | null; amountCents: number; type: "credit" | "debit"; date: string; scope: TxScope }
  | { kind: "reserved"; id: string; until: string; amountCents: number; date: string };

/** Effective visibility of one fact for the partner, or null when it must not appear as a line. */
export function projectForPartner(tx: OwnedTransaction, account: OwnedAccount | undefined, today: string): PartnerLine | null {
  // Shared on purpose, or the partner's own purchase on this card: always fully visible.
  if (tx.scope === "ours" || tx.scope === "partner") {
    return { kind: "detail", id: tx.id, label: tx.label, tagId: tx.tag_id, amountCents: tx.amount_cents, type: tx.type, date: tx.transaction_date, scope: tx.scope };
  }
  // Manual facts without an account follow the owner's default: private.
  const visibility: AccountVisibility = account?.visibility ?? "private";
  if (visibility !== "details") return null;
  if (tx.privacy === "hidden" || tx.free_money) return null;
  if (tx.surprise_until && tx.surprise_until >= today) {
    if (tx.surprise_hide_amount) return null;
    return { kind: "reserved", id: tx.id, until: tx.surprise_until, amountCents: tx.amount_cents, date: tx.transaction_date };
  }
  if (tx.privacy === "category_only") {
    return { kind: "category_only", id: tx.id, tagId: tx.tag_id, amountCents: tx.amount_cents, type: tx.type, date: tx.transaction_date, scope: tx.scope };
  }
  return { kind: "detail", id: tx.id, label: tx.label, tagId: tx.tag_id, amountCents: tx.amount_cents, type: tx.type, date: tx.transaction_date, scope: tx.scope };
}

export type PartnerAccountView = {
  id: string;
  name: string;
  visibility: Exclude<AccountVisibility, "private">;
  balanceCents: number | null;
  /** Month outflow, including hidden items (the balance must still add up). */
  monthOutCents: number;
  lines: PartnerLine[];
};

/** The partner's view of one person's accounts for a period. Private accounts are left out entirely. */
export function partnerAccountsView(accounts: OwnedAccount[], transactions: OwnedTransaction[], today: string): PartnerAccountView[] {
  return accounts
    .filter((a) => a.visibility !== "private")
    .map((account) => {
      const own = transactions.filter((t) => t.account_id === account.id);
      const monthOutCents = own.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount_cents, 0);
      const lines =
        account.visibility === "details"
          ? own.map((t) => projectForPartner(t, account, today)).filter((l): l is PartnerLine => l !== null)
          : [];
      return { id: account.id, name: account.name, visibility: account.visibility as "totals" | "details", balanceCents: account.balance_cents, monthOutCents, lines };
    });
}

/** What the owner keeps to themselves, for the "Fica só com você" summary in the preview. */
export function keptPrivateSummary(accounts: OwnedAccount[], transactions: OwnedTransaction[], today: string) {
  const privateAccounts = accounts.filter((a) => a.visibility === "private").map((a) => a.name);
  const visibleDetail = new Set(accounts.filter((a) => a.visibility === "details").map((a) => a.id));
  const inDetail = transactions.filter((t) => t.scope === "mine" && t.account_id && visibleDetail.has(t.account_id));
  return {
    privateAccounts,
    hidden: inDetail.filter((t) => t.privacy === "hidden").map((t) => t.label),
    freeMoneyCount: transactions.filter((t) => t.free_money && t.scope === "mine").length,
    hiddenSurprises: inDetail.filter((t) => t.surprise_until && t.surprise_until >= today && t.surprise_hide_amount).length,
  };
}

export type PrivacyRule = {
  match_type: "tag" | "merchant" | "account";
  tag_id: string | null;
  account_id: string | null;
  pattern: string | null;
  action: "category_only" | "hidden" | "ask_surprise";
};

/**
 * The owner's own rules for a new fact. The most private action wins (hidden > category_only);
 * "ask_surprise" only flags that the app should offer the surprise mode.
 */
export function applyPrivacyRules(tx: { tag_id: string | null; account_id: string | null; label: string }, rules: PrivacyRule[]) {
  let privacy: TxPrivacy = "account";
  let askSurprise = false;
  const merchant = normalizeMerchant(tx.label);
  for (const rule of rules) {
    const matches =
      (rule.match_type === "tag" && rule.tag_id !== null && rule.tag_id === tx.tag_id) ||
      (rule.match_type === "account" && rule.account_id !== null && rule.account_id === tx.account_id) ||
      (rule.match_type === "merchant" && !!rule.pattern && (merchant.includes(normalizeMerchant(rule.pattern)) || tx.label.toLowerCase().includes(rule.pattern.toLowerCase())));
    if (!matches) continue;
    if (rule.action === "hidden") privacy = "hidden";
    else if (rule.action === "category_only" && privacy !== "hidden") privacy = "category_only";
    else if (rule.action === "ask_surprise") askSurprise = true;
  }
  return { privacy, askSurprise };
}
