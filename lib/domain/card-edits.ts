import { normalizeText } from "./normalize";

/**
 * Edits to card purchases the bank still shows as pending. A pending item may come back with
 * another id once posted, so an edit is found by the provider id, then by a fingerprint of the
 * purchase, then by date/amount/type/installment alone when only one edit fits.
 */

export type CardItemLike = {
  transaction_date: string;
  amount_cents: number;
  type: "credit" | "debit";
  installment_number: number | null;
  description: string;
};

export type CardEdit = {
  id: string;
  provider_transaction_id: string;
  fingerprint: string;
  tag_id: string | null;
  user_description: string | null;
  scope: "mine" | "ours" | "partner" | null;
};

/** "2026-11-10|4590|debit|2|mercado central": the description without its installment suffix. */
export function cardItemFingerprint(item: CardItemLike): string {
  const description = normalizeText(item.description)
    .replace(/\b(?:parc(?:ela)?\.?\s*)?\d{1,2}\s*(?:\/|de)\s*\d{1,2}\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [item.transaction_date, item.amount_cents, item.type, item.installment_number ?? "", description].join("|").slice(0, 400);
}

/** The fingerprint without the description, for banks that rename the purchase when posting it. */
function looseKey(fingerprint: string): string {
  return fingerprint.split("|").slice(0, 4).join("|");
}

/** The edit made for this item, if any. */
export function findEdit<E extends CardEdit>(edits: E[], providerId: string, item: CardItemLike): E | null {
  const byId = edits.find((e) => e.provider_transaction_id === providerId);
  if (byId) return byId;
  const fingerprint = cardItemFingerprint(item);
  const byFingerprint = edits.find((e) => e.fingerprint === fingerprint);
  if (byFingerprint) return byFingerprint;
  const loose = edits.filter((e) => looseKey(e.fingerprint) === looseKey(fingerprint));
  return loose.length === 1 ? loose[0] : null;
}
