import { describe, expect, it } from "vitest";

import { dailyFactor, estimateAtMaturity, projectedFactor, ratesFromSnapshot, termsFromRow, valueFixedIncome, weekdays, type Rates } from "../lib/domain/fixed-income";
import type { Movement } from "../lib/domain/investments";

const noRates: Rates = { cdi: [], selic: [], ipca: new Map(), ipca12: null };
const buy = (date: string, cents: number): Movement => ({ type: "BUY", date, amountCents: cents, quantity: null });

describe("terms", () => {
  it("reads the contract stored on the row", () => {
    expect(termsFromRow({ rate: 110, rate_type: "CDI", fixed_annual_rate: null })).toEqual({ index: "cdi", pct: 110, annual: null });
    expect(termsFromRow({ rate: null, rate_type: "SELIC", fixed_annual_rate: null })).toEqual({ index: "selic", pct: 100, annual: null });
    expect(termsFromRow({ rate: null, rate_type: "IPCA", fixed_annual_rate: 6.5 })).toEqual({ index: "ipca", pct: null, annual: 6.5 });
    expect(termsFromRow({ rate: null, rate_type: null, fixed_annual_rate: 12 })).toEqual({ index: "pre", pct: null, annual: 12 });
    expect(termsFromRow({ rate: null, rate_type: null, fixed_annual_rate: null })).toBeNull();
  });

  it("counts weekdays, end excluded", () => {
    // Mon 2026-11-09 .. Mon 2026-11-16: five weekdays.
    expect(weekdays("2026-11-09", "2026-11-16")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  });
});

describe("value of a position typed by hand", () => {
  const cdi = (dates: string[], value = 0.05) => dates.map((date) => ({ date, value }));

  it("accrues % of the CDI once per business day, today not yet", () => {
    const rates: Rates = { ...noRates, cdi: cdi(weekdays("2026-11-09", "2026-11-16")) };
    const v = valueFixedIncome([buy("2026-11-09", 100000)], { index: "cdi", pct: 110, annual: null }, rates, "2026-11-16");
    expect(v.amountCents).toBe(Math.round(100000 * Math.pow(1 + 0.0005 * 1.1, 5)));
    expect(v.investedCents).toBe(100000);
  });

  it("skips holidays: a weekday the Banco Central did not publish", () => {
    // 2026-11-13 missing while 2026-11-16 was published: no accrual that day.
    const rates: Rates = { ...noRates, cdi: cdi(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-16"]) };
    const v = valueFixedIncome([buy("2026-11-09", 100000)], { index: "cdi", pct: 100, annual: null }, rates, "2026-11-17");
    expect(v.amountCents).toBe(Math.round(100000 * Math.pow(1.0005, 5)));
  });

  it("uses the last published rate for the days not published yet", () => {
    const rates: Rates = { ...noRates, cdi: cdi(["2026-11-09"]) };
    expect(dailyFactor({ index: "cdi", pct: 100, annual: null }, "2026-11-12", rates)).toBeCloseTo(1.0005, 10);
  });

  it("compounds a fixed rate over 252 business days to the annual rate", () => {
    const days = weekdays("2026-01-05", "2027-12-31").slice(0, 252);
    const end = addOne(days[days.length - 1]);
    const v = valueFixedIncome([buy("2026-01-05", 100000)], { index: "pre", pct: null, annual: 10 }, noRates, end);
    expect(v.amountCents).toBe(110000);
  });

  it("takes withdrawals out on their date and keeps the rest earning", () => {
    const rates: Rates = { ...noRates, cdi: cdi(weekdays("2026-11-02", "2026-11-16")) };
    const sell: Movement = { type: "SELL", date: "2026-11-09", amountCents: 50000, quantity: null };
    const v = valueFixedIncome([buy("2026-11-02", 100000), sell], { index: "cdi", pct: 100, annual: null }, rates, "2026-11-16");
    const afterWeek = 100000 * Math.pow(1.0005, 5) - 50000;
    expect(v.amountCents).toBe(Math.round(afterWeek * Math.pow(1.0005, 5)));
  });

  it("spreads the month's IPCA over its business days and adds the real rate", () => {
    const rates: Rates = { ...noRates, ipca: new Map([["2026-11", 0.42]]) };
    const novWeekdays = weekdays("2026-11-01", "2026-12-01").length;
    const f = dailyFactor({ index: "ipca", pct: null, annual: 6 }, "2026-11-10", rates);
    expect(f).toBeCloseTo(Math.pow(1.0042, 1 / novWeekdays) * Math.pow(1.06, 1 / 252), 12);
  });
});

describe("estimate at maturity", () => {
  const rates = ratesFromSnapshot({ cdiDaily: 0.05, selicDaily: 0.05, ipca12: 4.5, cdiAnnual: 13.65 });

  it("carries today's value at today's rates and takes the IR of the whole period", () => {
    const e = estimateAtMaturity({
      amountCents: 300000,
      investedCents: 300000,
      since: "2026-11-16",
      today: "2026-11-16",
      due: "2027-03-15",
      terms: { index: "cdi", pct: 110, annual: null },
      rates,
      type: "FIXED_INCOME",
      subtype: "CDB",
    });
    const factor = projectedFactor({ index: "cdi", pct: 110, annual: null }, rates, "2026-11-16", "2027-03-15");
    expect(e.grossCents).toBe(Math.round(300000 * factor));
    // 119 days held: 22,5% on the gain.
    expect(e.taxRate).toBe(0.225);
    expect(e.netCents).toBe(e.grossCents - Math.round((e.grossCents - 300000) * 0.225));
  });

  it("leaves LCI and LCA untaxed", () => {
    const e = estimateAtMaturity({ amountCents: 200000, investedCents: 200000, since: "2026-01-01", today: "2026-11-16", due: "2027-12-01", terms: { index: "cdi", pct: 92, annual: null }, rates, type: "FIXED_INCOME", subtype: "LCI" });
    expect(e.taxCents).toBe(0);
    expect(e.netCents).toBe(e.grossCents);
  });
});

function addOne(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
