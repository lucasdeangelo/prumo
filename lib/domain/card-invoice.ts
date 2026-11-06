// Card invoice rules that do not depend on the database. The bank decides which invoice a purchase
// belongs to; these helpers read what it reports and fill gaps for manual cards.

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function addMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/**
 * Invoice month of a provider card transaction: the due month of its closed invoice when known,
 * otherwise the month the bank forecasts ("billForecastDate", "2026-12").
 */
export function billMonthOf(
  meta: { billId?: string | null; billForecastDate?: string | null } | null | undefined,
  dueMonthByBillId: Map<string, string>,
): string | null {
  if (meta?.billId && dueMonthByBillId.has(meta.billId)) return dueMonthByBillId.get(meta.billId)!;
  const forecast = meta?.billForecastDate?.slice(0, 7) ?? null;
  return forecast && MONTH.test(forecast) ? forecast : null;
}

/** "Amazon 2/5" → { number: 2, total: 5 }. Used only when the bank does not send the fields. */
export function installmentFromDescription(description: string | null | undefined): { number: number; total: number } | null {
  const match = /(?:^|\s)(\d{1,2})\s?\/\s?(\d{1,2})\s*$/.exec(description ?? "");
  if (!match) return null;
  const number = Number(match[1]);
  const total = Number(match[2]);
  if (number < 1 || total < 2 || number > total) return null;
  return { number, total };
}

/** Payment of a previous invoice: it is not a purchase and never enters the split. */
export function isCardPayment(fact: { type: "credit" | "debit"; provider_description?: string | null; user_description?: string | null }): boolean {
  if (fact.type !== "credit") return false;
  const text = `${fact.provider_description ?? ""} ${fact.user_description ?? ""}`.toLowerCase();
  return /pagamento (recebido|de fatura|da fatura|efetuado)|pagto fatura/.test(text);
}

/**
 * Which invoice is open: the month after the last one the bank closed. Without closed invoices
 * from the bank, the latest month any purchase was assigned to, or the current month.
 */
export function openBillMonth(closedMonths: string[], assignedMonths: string[], today: string): string {
  const lastClosed = [...closedMonths].sort().at(-1);
  if (lastClosed) return addMonthKey(lastClosed, 1);
  const current = today.slice(0, 7);
  const latest = [...assignedMonths].sort().at(-1);
  return latest && latest > current ? latest : addMonthKey(current, 1);
}

/** Due date of an invoice month: the bank's, or the card's usual due day in that month. */
export function dueDateFor(month: string, knownDue: string | null, usualDueDate: string | null): string {
  if (knownDue) return knownDue;
  const day = Number((usualDueDate ?? "").slice(8, 10)) || 10;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/**
 * Amount in the account's currency. International purchases come with the amount in the original
 * currency ("19.00 USD") and the charged value in `amountInAccountCurrency` ("97.30 BRL").
 */
export function accountAmount(tx: { amount: number; currencyCode?: string | null; amountInAccountCurrency?: number | null }, accountCurrency: string | null | undefined): number {
  const foreign = tx.currencyCode && tx.currencyCode !== (accountCurrency || "BRL");
  return foreign && tx.amountInAccountCurrency != null ? tx.amountInAccountCurrency : tx.amount;
}

type Signed = { type: "credit" | "debit"; amount_cents: number };

export function netCents(items: Signed[]): number {
  return items.reduce((s, i) => s + (i.type === "debit" ? i.amount_cents : -i.amount_cents), 0);
}

const INTERNAL = /rotativo|atraso|d[ií]vida|encerramento/i;

/**
 * Banks move debt around inside the invoice with a charge and a credit of the same value on the
 * same day ("Saldo em rotativo" / "Crédito de rotativo"). They cancel out and only confuse the
 * list, so both are left out. Real charges (interest, fees) stay.
 */
export function withoutInternalPairs<T extends Signed & { transaction_date: string; description: string }>(items: T[]): T[] {
  const dropped = new Set<number>();
  items.forEach((debit, i) => {
    if (dropped.has(i) || debit.type !== "debit") return;
    const j = items.findIndex(
      (credit, k) =>
        !dropped.has(k) &&
        credit.type === "credit" &&
        credit.amount_cents === debit.amount_cents &&
        credit.transaction_date === debit.transaction_date &&
        (INTERNAL.test(credit.description) || INTERNAL.test(debit.description)),
    );
    if (j >= 0) {
      dropped.add(i);
      dropped.add(j);
    }
  });
  return items.filter((_, i) => !dropped.has(i));
}

/** What was left unpaid of a closed invoice and rolls into the next one. */
export function carriedFrom(bill: { total_cents: number; payments_cents: number } | null | undefined): number {
  if (!bill) return 0;
  return Math.max(0, bill.total_cents - bill.payments_cents);
}

export type InstallmentItem = {
  id: string;
  description: string;
  amount_cents: number;
  installment_number: number | null;
  installment_total: number | null;
  transaction_date: string;
};

/** A store refund ("Estorno de compra"), not interest adjustments or reversed payments. */
export function isPurchaseRefund(fact: { type: "credit" | "debit"; description: string }): boolean {
  return fact.type === "credit" && /estorno/i.test(fact.description) && !/juros|pagamento|iof|tarifa|anuidade|multa/i.test(fact.description);
}

/** "Amazon 3/6" and "Amazon - Parcela 3/6" → "amazon". */
export function purchaseName(description: string): string {
  return description
    .replace(/\s*-?\s*(parcela\s*)?\d{1,2}\s?\/\s?\d{1,2}\s*$/i, "")
    .trim()
    .toLowerCase();
}

const CENTS_TOLERANCE = 3;

/**
 * Scheduled installments that a refund already cancelled. A refund matches an installment purchase
 * when it equals what was charged of it up to the refund (the usual case: the bank returns the
 * installments already billed) or its full value. Each refund cancels at most one purchase, and
 * only the installments after the refund.
 */
export function refundedInstallmentIds(
  charged: InstallmentItem[],
  scheduled: InstallmentItem[],
  refunds: Array<{ amount_cents: number; transaction_date: string }>,
): Set<string> {
  type Group = { charged: InstallmentItem[]; scheduled: InstallmentItem[]; installment: number; total: number };
  const groups: Group[] = [];
  const place = (item: InstallmentItem, kind: "charged" | "scheduled") => {
    if (!item.installment_total || item.installment_total < 2) return;
    const name = purchaseName(item.description);
    let group = groups.find(
      (g) =>
        g.total === item.installment_total &&
        purchaseName((g.charged[0] ?? g.scheduled[0]).description) === name &&
        Math.abs(g.installment - item.amount_cents) <= 5 &&
        ![...g.charged, ...g.scheduled].some((x) => x.installment_number === item.installment_number),
    );
    if (!group) {
      group = { charged: [], scheduled: [], installment: item.amount_cents, total: item.installment_total };
      groups.push(group);
    }
    group[kind].push(item);
  };
  charged.forEach((item) => place(item, "charged"));
  scheduled.forEach((item) => place(item, "scheduled"));

  const cancelled = new Set<string>();
  const used = new Set<Group>();
  for (const refund of [...refunds].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))) {
    // Distance between the refund and each purchase: what was charged so far, or its full value.
    const candidates = groups
      .filter((g) => !used.has(g) && g.scheduled.length > 0)
      .map((g) => {
        const chargedSoFar = g.charged.filter((c) => c.transaction_date <= refund.transaction_date).reduce((s, c) => s + c.amount_cents, 0);
        const known = [...g.charged, ...g.scheduled];
        // Missing installments cost like the latest known one (the first often differs by cents).
        const latest = [...known].sort((a, b) => (b.installment_number ?? 0) - (a.installment_number ?? 0))[0].amount_cents;
        const fullValue = known.reduce((s, c) => s + c.amount_cents, 0) + Math.max(0, g.total - known.length) * latest;
        const distance = Math.min(chargedSoFar > 0 ? Math.abs(chargedSoFar - refund.amount_cents) : Infinity, Math.abs(fullValue - refund.amount_cents));
        return { g, distance };
      })
      .filter((c) => c.distance <= CENTS_TOLERANCE)
      .sort((a, b) => a.distance - b.distance);
    // Two purchases equally close: not enough to tell which one was refunded.
    if (candidates.length === 0 || (candidates.length > 1 && candidates[1].distance === candidates[0].distance)) continue;
    const match = candidates[0].g;
    used.add(match);
    for (const item of match.scheduled) if (item.transaction_date >= refund.transaction_date) cancelled.add(item.id);
  }
  return cancelled;
}
