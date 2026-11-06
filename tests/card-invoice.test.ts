import { describe, expect, it } from "vitest";

import {
  accountAmount,
  addMonthKey,
  billMonthOf,
  carriedFrom,
  dueDateFor,
  installmentFromDescription,
  isCardPayment,
  netCents,
  isPurchaseRefund,
  openBillMonth,
  purchaseName,
  refundedInstallmentIds,
  withoutInternalPairs,
} from "../lib/domain/card-invoice";

describe("invoice totals as the Nubank app shows them", () => {
  it("international purchases count in reais, not in the original currency", () => {
    expect(accountAmount({ amount: 19, currencyCode: "USD", amountInAccountCurrency: 97.3 }, "BRL")).toBe(97.3);
    expect(accountAmount({ amount: 35, currencyCode: "BRL", amountInAccountCurrency: null }, "BRL")).toBe(35);
    expect(accountAmount({ amount: 12.9 }, "BRL")).toBe(12.9);
  });

  it("debt moved inside the invoice cancels out and leaves the list", () => {
    const items = [
      { type: "debit" as const, amount_cents: 32367, transaction_date: "2026-05-11", description: "Saldo em rotativo" },
      { type: "credit" as const, amount_cents: 32367, transaction_date: "2026-05-11", description: "Crédito de rotativo" },
      { type: "debit" as const, amount_cents: 1473, transaction_date: "2026-05-11", description: "Juros de atraso" },
      { type: "credit" as const, amount_cents: 2761, transaction_date: "2026-05-18", description: "Estorno de compra" },
      { type: "debit" as const, amount_cents: 2761, transaction_date: "2026-05-16", description: "Amazon 1/2" },
    ];
    const kept = withoutInternalPairs(items);
    expect(kept.map((i) => i.description)).toEqual(["Juros de atraso", "Estorno de compra", "Amazon 1/2"]);
    expect(netCents(kept)).toBe(1473);
  });

  it("the unpaid rest of the last invoice rolls into the open one", () => {
    // June 2026: May invoice R$ 711,56, R$ 387,89 paid → R$ 323,67 carried (bank total matched).
    expect(carriedFrom({ total_cents: 71156, payments_cents: 38789 })).toBe(32367);
    expect(carriedFrom({ total_cents: 50000, payments_cents: 60000 })).toBe(0);
    expect(carriedFrom(null)).toBe(0);
  });
});

describe("card invoices as the bank reports them", () => {
  const bills = new Map([["bill-nov", "2026-11"]]);

  it("uses the closed invoice of a purchase, then the bank's forecast month", () => {
    // Oticas 1/6 was bought on 10/10 and is in the invoice due in November (closed).
    expect(billMonthOf({ billId: "bill-nov", billForecastDate: "2026-12" }, bills)).toBe("2026-11");
    // Amazon 2/5 posted on 25/10 goes to the open December invoice.
    expect(billMonthOf({ billId: null, billForecastDate: "2026-12" }, bills)).toBe("2026-12");
    expect(billMonthOf({ billId: "unknown", billForecastDate: "2026-12-01" }, bills)).toBe("2026-12");
    expect(billMonthOf({ billForecastDate: "NA" }, bills)).toBeNull();
    expect(billMonthOf(null, bills)).toBeNull();
  });

  it("the open invoice is the one after the last closed", () => {
    expect(openBillMonth(["2026-10", "2026-11", "2026-09"], [], "2026-11-06")).toBe("2026-12");
    expect(openBillMonth([], ["2026-12"], "2026-11-06")).toBe("2026-12");
    expect(openBillMonth([], [], "2026-11-06")).toBe("2026-12");
    expect(addMonthKey("2026-12", 1)).toBe("2027-01");
  });

  it("reads installments from the description only when it looks like one", () => {
    expect(installmentFromDescription("Amazon 2/5")).toEqual({ number: 2, total: 5 });
    expect(installmentFromDescription("MundoPlayComercio 12/12")).toEqual({ number: 12, total: 12 });
    expect(installmentFromDescription("Oticas Bizz 1 / 6")).toEqual({ number: 1, total: 6 });
    expect(installmentFromDescription("Loja 24/7")).toBeNull();
    expect(installmentFromDescription("Ebn*Spotify")).toBeNull();
    expect(installmentFromDescription("Pedido 0/3")).toBeNull();
  });

  it("payments of previous invoices are not purchases or refunds", () => {
    expect(isCardPayment({ type: "credit", provider_description: "Pagamento recebido" })).toBe(true);
    expect(isCardPayment({ type: "credit", provider_description: "Estorno de compra" })).toBe(false);
    expect(isCardPayment({ type: "credit", provider_description: "Crédito de rotativo" })).toBe(false);
    expect(isCardPayment({ type: "debit", provider_description: "Pagamento recebido" })).toBe(false);
  });

  it("due date: the bank's, else the card's usual day in that month", () => {
    expect(dueDateFor("2026-11", "2026-11-03", null)).toBe("2026-11-03");
    expect(dueDateFor("2026-12", null, "2026-11-03")).toBe("2026-12-03");
    expect(dueDateFor("2027-02", null, "2026-10-31")).toBe("2027-02-28");
  });
});

describe("refunded installment purchases", () => {
  const item = (id: string, description: string, cents: number, n: number, total: number, date: string) => ({
    id, description, amount_cents: cents, installment_number: n, installment_total: total, transaction_date: date,
  });
  // Amazon 6x bought on 22/09: 1/6 and 2/6 charged, then "Estorno de compra" R$ 66,66 on 25/09.
  const charged = [item("a1", "Amazon 1/6", 3335, 1, 6, "2026-09-22"), item("a2", "Amazon 2/6", 3331, 2, 6, "2026-09-24"), item("b1", "Amazon 1/5", 3998, 1, 5, "2026-09-23")];
  const scheduled = [
    item("a3", "Amazon 3/6", 3331, 3, 6, "2026-11-23"),
    item("a4", "Amazon 4/6", 3331, 4, 6, "2026-12-23"),
    item("b2", "Amazon 2/5", 3998, 2, 5, "2026-10-25"),
    item("c3", "Oticas Bizz 3/6", 12783, 3, 6, "2026-11-25"),
  ];

  it("a refund equal to what was charged cancels the remaining installments of that purchase only", () => {
    expect([...refundedInstallmentIds(charged, scheduled, [{ amount_cents: 6666, transaction_date: "2026-09-25" }])].sort()).toEqual(["a3", "a4"]);
  });

  it("a refund of the full value also cancels it", () => {
    // Oticas 6x: 1/6 and 2/6 charged; full value refunded.
    const oticas = [item("c1", "Oticas Bizz 1/6", 12785, 1, 6, "2026-10-10"), item("c2", "Oticas Bizz 2/6", 12783, 2, 6, "2026-10-25")];
    const ids = refundedInstallmentIds([...charged, ...oticas], scheduled, [{ amount_cents: 12785 + 12783 * 5, transaction_date: "2026-11-01" }]);
    expect([...ids]).toEqual(["c3"]);
  });

  it("two purchases equally close: nothing is cancelled", () => {
    // Amazon 6x and Amazon 5x both add up to R$ 199,90 in full.
    expect(refundedInstallmentIds(charged, scheduled, [{ amount_cents: 19990, transaction_date: "2026-10-01" }]).size).toBe(0);
  });

  it("refunds that match no installment purchase cancel nothing", () => {
    expect(refundedInstallmentIds(charged, scheduled, [{ amount_cents: 499, transaction_date: "2026-07-29" }]).size).toBe(0);
    expect(refundedInstallmentIds(charged, scheduled, []).size).toBe(0);
  });

  it("tells store refunds from other credits and names purchases without the installment", () => {
    expect(isPurchaseRefund({ type: "credit", description: "Estorno de compra" })).toBe(true);
    expect(isPurchaseRefund({ type: "credit", description: "Estorno de juros de rotativo" })).toBe(false);
    expect(isPurchaseRefund({ type: "credit", description: "Estorno de pagamento" })).toBe(false);
    expect(purchaseName("Amazon - Parcela 3/6")).toBe("amazon");
    expect(purchaseName("Amazon 3/6")).toBe("amazon");
  });
});
