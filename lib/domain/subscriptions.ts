import { daysBetween } from "./dates";
import { normalizeText, titleCase } from "./normalize";
import { nextOccurrence, periodDays, type Frequency } from "./recurrence";

export type DetectableTransaction = {
  id: string;
  type: "credit" | "debit";
  amount_cents: number;
  transaction_date: string;
  normalized_merchant: string | null;
};

export type SubscriptionCandidate = {
  normalizedName: string;
  name: string;
  amountCents: number;
  frequency: Frequency;
  nextChargeDate: string;
  confidence: number;
  transactionIds: string[];
};

// Merchants that are almost always recurring services. One charge is enough to suggest them.
export const KNOWN_SUBSCRIPTIONS = [
  "netflix", "spotify", "disney", "hbo", "max", "globoplay", "prime video", "amazon prime", "youtube", "google one",
  "google storage", "icloud", "apple", "deezer", "paramount", "crunchyroll", "chatgpt", "openai", "anthropic", "claude",
  "microsoft", "adobe", "canva", "uber one", "ifood clube", "meli", "smart fit", "smartfit", "wellhub", "gympass",
  "totalpass", "duolingo", "dropbox", "notion", "github", "linkedin", "tinder", "starlink", "sky", "claro tv",
];

// Recurring, but bills rather than subscriptions: they belong in "Contas futuras".
const NOT_SUBSCRIPTIONS = [
  "aluguel", "condominio", "iptu", "ipva", "energia", "enel", "cemig", "copel", "cpfl", "light", "luz", "agua", "sabesp",
  "gas", "comgas", "salario", "fatura", "boleto", "financiamento", "emprestimo", "parcela", "escola", "faculdade", "mensalidade",
];

function looksLikeBill(merchant: string): boolean {
  const words = normalizeText(merchant).split(" ");
  return words.some((w) => NOT_SUBSCRIPTIONS.includes(w));
}

export function isKnownSubscription(merchant: string): boolean {
  const name = normalizeText(merchant);
  return KNOWN_SUBSCRIPTIONS.some((known) => name.startsWith(known) || ` ${name} `.includes(` ${known} `));
}

const SHAPES: Array<{ frequency: Frequency; min: number; max: number }> = [
  { frequency: "weekly", min: 6, max: 8 },
  { frequency: "monthly", min: 26, max: 35 },
  { frequency: "quarterly", min: 85, max: 97 },
  { frequency: "semiannual", min: 175, max: 190 },
  { frequency: "annual", min: 350, max: 380 },
];

function shapeOf(intervals: number[]): Frequency | null {
  for (const shape of SHAPES) {
    if (intervals.every((d) => d >= shape.min && d <= shape.max)) return shape.frequency;
  }
  return null;
}

/**
 * Finds recurring debits from the same merchant with a regular interval and stable amount.
 * Pure and deterministic: the same transactions always produce the same candidates.
 */
export function detectSubscriptions(transactions: DetectableTransaction[], today: string): SubscriptionCandidate[] {
  const groups = new Map<string, DetectableTransaction[]>();
  for (const tx of transactions) {
    const key = tx.normalized_merchant?.trim();
    if (tx.type !== "debit" || !key || key.length < 3 || looksLikeBill(key)) continue;
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }

  const candidates: SubscriptionCandidate[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || a.id.localeCompare(b.id));
    // Same-day duplicates (e.g. split charges) count once.
    const charges = sorted.filter((tx, i) => i === 0 || tx.transaction_date !== sorted[i - 1].transaction_date);
    const known = isKnownSubscription(key);
    const last = charges[charges.length - 1];
    const amounts = charges.map((c) => c.amount_cents);
    // Known services get room for price changes; unknown merchants must charge almost the same amount.
    const stable = Math.max(...amounts) <= Math.min(...amounts) * (known ? 1.25 : 1.1);

    let frequency: Frequency | null = null;
    if (charges.length >= 2) {
      const intervals = charges.slice(1).map((c, i) => daysBetween(charges[i].transaction_date, c.transaction_date));
      frequency = shapeOf(intervals);
    }
    if (!frequency && known && charges.length === 1) frequency = "monthly";
    if (!frequency || !stable) continue;
    if (!known && charges.length < 3) continue;

    // A series that stopped more than 1.5 periods ago is no longer active.
    if (daysBetween(last.transaction_date, today) > periodDays(frequency) * 1.5) continue;

    let confidence = 0.45 + Math.min(charges.length - 1, 4) * 0.1;
    if (known) confidence += 0.2;
    if (new Set(amounts).size === 1) confidence += 0.1;

    let next = nextOccurrence(last.transaction_date, frequency);
    while (next < today) next = nextOccurrence(next, frequency);

    candidates.push({
      normalizedName: key,
      name: titleCase(key),
      amountCents: last.amount_cents,
      frequency,
      nextChargeDate: next,
      confidence: Math.min(0.99, Math.round(confidence * 100) / 100),
      transactionIds: charges.map((c) => c.id),
    });
  }
  return candidates.sort((a, b) => b.confidence - a.confidence || a.normalizedName.localeCompare(b.normalizedName));
}

/** Whether a charge belongs to a subscription: same merchant key and an amount within 25%. */
export function chargeMatchesSubscription(
  tx: Pick<DetectableTransaction, "type" | "amount_cents" | "normalized_merchant">,
  subscription: { normalized_name: string; amount_cents: number },
): boolean {
  if (tx.type !== "debit" || !tx.normalized_merchant) return false;
  const merchant = tx.normalized_merchant;
  const name = subscription.normalized_name;
  const sameMerchant = merchant === name || merchant.startsWith(`${name} `) || name.startsWith(`${merchant} `);
  const ratio = tx.amount_cents / subscription.amount_cents;
  return sameMerchant && ratio >= 0.75 && ratio <= 1.25;
}
