import { describe, expect, it } from "vitest";

import { dailyBalances, isOverdraftCharge, overdraftMonth } from "../lib/domain/overdraft";

const debit = (date: string, cents: number, description = "Pix") => ({ date, type: "debit" as const, amount_cents: cents, description });
const credit = (date: string, cents: number, description = "Salário") => ({ date, type: "credit" as const, amount_cents: cents, description });

describe("overdraft rebuilt from today's balance", () => {
  // Itaú, end of October: R$ 995,34 paid to the card on 31/10 took the account to −R$ 1.131,46.
  const movements = [
    debit("2026-10-29", 1317),
    debit("2026-10-31", 99534, "Pagamento de Pix QR Code NU PA"),
    debit("2026-11-04", 1320, "Saída JUROS LIMITE DA CONTA"),
    debit("2026-11-05", 416, "Pagamento de imposto IOF"),
    credit("2026-11-06", 163645),
  ];

  it("walks back from the balance the bank reported", () => {
    const days = dailyBalances(48763, "2026-11-06", movements, "2026-10-28");
    const at = (d: string) => days.find((x) => x.date === d)!.balanceCents;
    expect(at("2026-11-06")).toBe(48763);
    expect(at("2026-11-05")).toBe(-114882);
    expect(at("2026-11-04")).toBe(-114466);
    expect(at("2026-10-31")).toBe(-113146);
    expect(at("2026-10-30")).toBe(-13612);
    expect(at("2026-10-28")).toBe(-12295);
    expect(days[0].date).toBe("2026-10-28");
  });

  it("counts days below zero, the lowest point and the cost in the month", () => {
    const days = dailyBalances(48763, "2026-11-06", movements, "2026-10-28");
    expect(overdraftMonth(days, "2026-11", movements)).toEqual({ negativeDays: 5, lowestCents: -114882, lowestDate: "2026-11-05", chargesCents: 1736 });
    expect(overdraftMonth(days, "2026-10", movements)).toMatchObject({ negativeDays: 4, lowestCents: -113146, lowestDate: "2026-10-31", chargesCents: 0 });
  });

  it("a month that never went below zero has no lowest date", () => {
    const days = dailyBalances(10000, "2026-11-03", [], "2026-11-01");
    expect(overdraftMonth(days, "2026-11", [])).toEqual({ negativeDays: 0, lowestCents: 10000, lowestDate: null, chargesCents: 0 });
  });

  it("recognizes overdraft interest and IOF, not other charges", () => {
    expect(isOverdraftCharge("Saída JUROS LIMITE DA CONTA")).toBe(true);
    expect(isOverdraftCharge("Juros cheque especial")).toBe(true);
    expect(isOverdraftCharge("Pagamento de imposto IOF")).toBe(true);
    expect(isOverdraftCharge("IOF")).toBe(true);
    expect(isOverdraftCharge("Pagamento de Pix QR Code UBER")).toBe(false);
    expect(isOverdraftCharge("Rendimentos REND PAGO APLIC AUT")).toBe(false);
  });
});
