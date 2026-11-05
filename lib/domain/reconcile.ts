import { daysBetween } from "./dates";
import { normalizeText } from "./normalize";

export type ReconcileBill = { id: string; description: string; amount_cents: number; type: "payable" | "receivable"; due_date: string };
export type ReconcileTransaction = {
  id: string;
  amount_cents: number;
  type: "credit" | "debit";
  transaction_date: string;
  description: string;
};

export type MatchCandidate = { transactionId: string; score: number };

function tokens(text: string): Set<string> {
  return new Set(normalizeText(text).split(/[^a-z0-9]+/).filter((t) => t.length >= 3));
}

/** Scores how likely a fact settles a bill. Amount and date dominate; shared words add a little. */
export function scoreMatch(bill: ReconcileBill, tx: ReconcileTransaction): number {
  if (tx.type !== (bill.type === "payable" ? "debit" : "credit")) return 0;
  const diff = Math.abs(tx.amount_cents - bill.amount_cents) / bill.amount_cents;
  const days = Math.abs(daysBetween(bill.due_date, tx.transaction_date));
  if (diff > 0.05 || days > 10) return 0;

  let score = diff === 0 ? 0.6 : diff <= 0.02 ? 0.4 : 0.2;
  score += days <= 3 ? 0.3 : days <= 7 ? 0.15 : 0.05;
  const billWords = tokens(bill.description);
  if ([...tokens(tx.description)].some((t) => billWords.has(t))) score += 0.1;
  return Math.round(score * 100) / 100;
}

/**
 * Candidates for a bill, best first. `auto` is set only when exactly one candidate is strong
 * (exact amount, within 3 days) so ambiguous cases always wait for the user.
 */
export function findBillMatches(bill: ReconcileBill, transactions: ReconcileTransaction[], usedTransactionIds = new Set<string>()) {
  const candidates = transactions
    .filter((tx) => !usedTransactionIds.has(tx.id))
    .map((tx) => ({ transactionId: tx.id, score: scoreMatch(bill, tx) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.transactionId.localeCompare(b.transactionId));
  const strong = candidates.filter((c) => c.score >= 0.9);
  return { candidates, auto: strong.length === 1 ? strong[0].transactionId : null };
}
