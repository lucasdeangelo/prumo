import { describe, expect, it } from "vitest";

import {
  assetBadge,
  assetClass,
  averageMonthlyGain,
  completionMonth,
  costBasis,
  gain,
  goalProgress,
  heldSince,
  incomeLast12Months,
  incomeTaxRate,
  investmentFromProvider,
  linkFits,
  movementFromProvider,
  netIfWithdrawn,
  type Movement,
  newMilestones,
  type PortfolioItem,
  type Snapshot,
  evolution,
  gainSince,
  partnerInvestmentsView,
  portfolioSeries,
  portfolioSummary,
  seriesDates,
} from "../lib/domain/investments";

describe("provider mapping", () => {
  // Shape of a real MeuPluggy CDB (values fictional): no profit, no code, taxes reported.
  const cdb = {
    id: "inv-1",
    type: "FIXED_INCOME",
    subtype: "CDB",
    name: "CDB Nubank 110% CDI",
    issuer: "Nu Financeira",
    amount: 6200,
    balance: 6200,
    amountOriginal: 5800,
    amountProfit: null,
    taxes: 60.5,
    taxes2: 9.5,
    quantity: 1,
    value: 6200,
    rate: 110,
    rateType: "CDI",
    date: "2026-11-13T00:00:00.000Z",
    dueDate: "2027-03-15T00:00:00.000Z",
    issueDate: "2026-06-02T00:00:00.000Z",
    status: "ACTIVE",
  };

  it("keeps calendar dates and stores cents", () => {
    const row = investmentFromProvider(cdb);
    expect(row).toMatchObject({
      provider_investment_id: "inv-1",
      amount_cents: 620000,
      balance_cents: 620000,
      invested_cents: 580000,
      taxes_cents: 7000,
      rate: 110,
      rate_type: "CDI",
      value_date: "2026-11-13",
      due_date: "2027-03-15",
      issue_date: "2026-06-02",
      status: "active",
    });
  });

  it("leaves the cost basis unknown when the bank does not send it", () => {
    expect(investmentFromProvider({ ...cdb, amountOriginal: null, taxes: null, taxes2: null })).toMatchObject({ invested_cents: null, taxes_cents: null });
  });

  it("maps withdrawn and pending positions", () => {
    expect(investmentFromProvider({ ...cdb, status: "TOTAL_WITHDRAWAL" }).status).toBe("withdrawn");
    expect(investmentFromProvider({ ...cdb, status: "PENDING" }).status).toBe("pending");
  });

  it("normalizes movements, unknown kinds become OTHER", () => {
    expect(movementFromProvider({ id: "t1", type: "BUY", movementType: "CREDIT", date: "2026-08-01T00:00:00.000Z", amount: -500, quantity: 10, value: 50 })).toMatchObject({
      type: "BUY",
      date: "2026-08-01",
      amount_cents: 50000,
      unit_value_cents: 5000,
    });
    expect(movementFromProvider({ id: "t2", type: "SPLIT", date: "2026-08-01", amount: 1 }).type).toBe("OTHER");
  });
});

const buy = (date: string, cents: number, quantity: number | null = null): Movement => ({ type: "BUY", date, amountCents: cents, quantity });
const sell = (date: string, cents: number, quantity: number | null = null): Movement => ({ type: "SELL", date, amountCents: cents, quantity });

describe("cost basis", () => {
  it("removes the average cost of what was sold, not the sale price", () => {
    // 60 shares at R$ 40 and 40 at R$ 45 = R$ 4.200 for 100 (average R$ 42). Sells 40 for R$ 2.000.
    const basis = costBasis([buy("2026-01-10", 240000, 60), buy("2026-03-10", 180000, 40), sell("2026-05-10", 200000, 40)]);
    expect(basis.quantity).toBe(60);
    expect(basis.investedCents).toBe(252000);
    expect(basis.averagePriceCents).toBe(4200);
  });

  it("orders by date and caps withdrawals without quantity at what is left", () => {
    const basis = costBasis([sell("2026-05-01", 900000), buy("2026-01-01", 500000), { type: "AMORTIZATION", date: "2026-03-01", amountCents: 100000, quantity: null }]);
    expect(basis.investedCents).toBe(0);
    expect(basis.averagePriceCents).toBeNull();
  });

  it("counts transfers in and out", () => {
    const basis = costBasis([
      { type: "TRANSFER", movementType: "CREDIT", date: "2026-01-01", amountCents: 100000, quantity: 10 },
      { type: "TRANSFER", movementType: "DEBIT", date: "2026-02-01", amountCents: 60000, quantity: 5 },
    ]);
    expect(basis).toEqual({ investedCents: 50000, quantity: 5, averagePriceCents: 10000 });
  });

  it("uses the first buy as the start, else the issue date", () => {
    expect(heldSince([buy("2026-03-01", 1), buy("2026-01-01", 1)], "2025-01-01")).toBe("2026-01-01");
    expect(heldSince([], "2025-01-01")).toBe("2025-01-01");
  });
});

describe("gain, taxes and income", () => {
  it("is today minus what was put in", () => {
    expect(gain(234120, 255000)).toEqual({ cents: -20880, ratio: -20880 / 255000 });
    expect(gain(100, null)).toBeNull();
  });

  it("follows the regressive table and exempts LCI/LCA", () => {
    expect(incomeTaxRate("FIXED_INCOME", "CDB", 180)).toBe(0.225);
    expect(incomeTaxRate("FIXED_INCOME", "CDB", 181)).toBe(0.2);
    expect(incomeTaxRate("FIXED_INCOME", "CDB", 500)).toBe(0.175);
    expect(incomeTaxRate("FIXED_INCOME", "TREASURY", 721)).toBe(0.15);
    expect(incomeTaxRate("FIXED_INCOME", "LCI", 30)).toBe(0);
    expect(incomeTaxRate("EQUITY", "STOCK", 30)).toBeNull();
  });

  it("uses the taxes the bank reports, else estimates on the gain", () => {
    const base = { type: "FIXED_INCOME", subtype: "CDB", amountCents: 620000, investedCents: 580000, since: "2026-01-01", today: "2026-11-16" };
    expect(netIfWithdrawn({ ...base, taxesCents: 7000 })).toMatchObject({ netCents: 613000, estimated: false });
    // 319 days held: 20% of R$ 400.
    expect(netIfWithdrawn({ ...base, taxesCents: null })).toMatchObject({ netCents: 612000, taxCents: 8000, rate: 0.2, estimated: true });
    expect(netIfWithdrawn({ ...base, subtype: "LCI", taxesCents: null })).toMatchObject({ netCents: 620000, taxCents: 0 });
    expect(netIfWithdrawn({ ...base, amountCents: 570000, taxesCents: null })).toMatchObject({ netCents: 570000, taxCents: 0 });
  });

  it("sums dividends and rent of the last 12 months only", () => {
    const income: Movement[] = [
      { type: "INTEREST", date: "2025-11-01", amountCents: 999, quantity: null },
      { type: "INTEREST", date: "2026-02-15", amountCents: 1060, quantity: null },
      { type: "INTEREST", date: "2026-08-15", amountCents: 800, quantity: null },
      buy("2026-09-01", 5000),
    ];
    expect(incomeLast12Months(income, "2026-11-16")).toBe(1860);
  });

  it("spreads the gain over the months held, at least one", () => {
    expect(averageMonthlyGain(40000, "2026-05-16", "2026-11-16")).toBe(Math.round(40000 / (184 / 30.4375)));
    expect(averageMonthlyGain(1000, "2026-11-10", "2026-11-16")).toBe(1000);
  });
});

describe("asset classes", () => {
  it("groups for 'Onde está' and labels the tile", () => {
    expect(assetClass("FIXED_INCOME", "TREASURY")).toBe("fixed");
    expect(assetClass("EQUITY", "REAL_ESTATE_FUND")).toBe("real_estate");
    expect(assetClass("ETF", "ETF")).toBe("equity");
    expect(assetClass("SECURITY", "VGBL")).toBe("pension");
    expect(assetBadge("FIXED_INCOME", "TREASURY")).toBe("TD");
    expect(assetBadge("FIXED_INCOME", "LCA")).toBe("LCA");
    expect(assetBadge("EQUITY", "STOCK")).toBe("AÇÃO");
    expect(assetBadge("EQUITY", "REAL_ESTATE_FUND")).toBe("FII");
  });
});

describe("goal progress with investments", () => {
  const ana = "ana";
  const rafa = "rafa";

  it("adds deposits and the linked value, split into put in and earned", () => {
    // Reserva de emergência: CDB R$ 12.000 (aplicado 11.420) + Tesouro R$ 6.400 (aplicado 6.050).
    const p = goalProgress(3000000, [], [
      { mode: "all", partCents: null, ownerId: ana, amountCents: 1200000, investedCents: 1142000, status: "active" },
      { mode: "all", partCents: null, ownerId: rafa, amountCents: 640000, investedCents: 605000, status: "active" },
    ]);
    expect(p).toMatchObject({ savedCents: 1840000, contributedCents: 1747000, earnedCents: 93000 });
    expect(p.byUser).toEqual({ ana: 1200000, rafa: 640000 });
    expect(p.ratio).toBeCloseTo(0.6133, 3);
  });

  it("counts a part at most up to the value today, in proportion", () => {
    const p = goalProgress(1000000, [{ userId: rafa, amountCents: 50000 }], [
      { mode: "part", partCents: 100000, ownerId: ana, amountCents: 200000, investedCents: 160000, status: "active" },
      { mode: "part", partCents: 500000, ownerId: ana, amountCents: 300000, investedCents: null, status: "active" },
    ]);
    // 100.000 of a 200.000 asset: 80.000 put in + 20.000 earned. Second capped at 300.000, basis unknown.
    expect(p).toMatchObject({ savedCents: 450000, contributedCents: 430000, earnedCents: 20000 });
    expect(p.byUser).toEqual({ rafa: 50000, ana: 400000 });
  });

  it("shows a loss as negative earnings and drops withdrawn assets", () => {
    const p = goalProgress(1000000, [], [
      { mode: "all", partCents: null, ownerId: ana, amountCents: 234120, investedCents: 255000, status: "active" },
      { mode: "all", partCents: null, ownerId: ana, amountCents: 900000, investedCents: 800000, status: "withdrawn" },
    ]);
    expect(p).toMatchObject({ savedCents: 234120, contributedCents: 255000, earnedCents: -20880 });
  });

  it("keeps 'Tudo' exclusive and parts within the value", () => {
    expect(linkFits([], { mode: "all", partCents: null }, 1000)).toBe(true);
    expect(linkFits([{ mode: "part", partCents: 100 }], { mode: "all", partCents: null }, 1000)).toBe(false);
    expect(linkFits([{ mode: "all", partCents: null }], { mode: "part", partCents: 100 }, 1000)).toBe(false);
    expect(linkFits([{ mode: "part", partCents: 600 }], { mode: "part", partCents: 400 }, 1000)).toBe(true);
    expect(linkFits([{ mode: "part", partCents: 600 }], { mode: "part", partCents: 401 }, 1000)).toBe(false);
    expect(linkFits([], { mode: "part", partCents: 0 }, 1000)).toBe(false);
  });

  it("projects the month from the recent pace, without yield", () => {
    const deposits = [
      { date: "2026-06-10", amountCents: 80000 },
      { date: "2026-08-10", amountCents: 160000 },
      { date: "2026-10-10", amountCents: 240000 },
      { date: "2025-01-10", amountCents: 999999 },
    ];
    // R$ 4.800 in 6 months = R$ 800/month; R$ 11.600 missing → 15 months.
    expect(completionMonth(1160000, deposits, "2026-11-16")).toBe("2028-02");
    expect(completionMonth(0, deposits, "2026-11-16")).toBe("2026-11");
    expect(completionMonth(100, [], "2026-11-16")).toBeNull();
  });
});

describe("portfolio", () => {
  const item = (over: Partial<PortfolioItem>): PortfolioItem => ({
    id: "x",
    ownerId: "ana",
    type: "FIXED_INCOME",
    subtype: "CDB",
    amountCents: 0,
    investedCents: 0,
    status: "active",
    scope: "mine",
    visibility: "totals",
    ...over,
  });

  it("sums open positions, gains and losses apart, by class", () => {
    const s = portfolioSummary([
      item({ id: "a", amountCents: 1209000, investedCents: 1100000 }),
      item({ id: "b", type: "EQUITY", subtype: "STOCK", amountCents: 234120, investedCents: 255000 }),
      item({ id: "c", type: "CRYPTO", subtype: null, amountCents: 147000, investedCents: null }),
      item({ id: "d", amountCents: 999999, investedCents: 1, status: "withdrawn" }),
    ]);
    expect(s).toMatchObject({ count: 3, totalCents: 1590120, investedCents: 1502000, gainsCents: 109000, lossesCents: -20880, gainCents: 88120 });
    expect(s.classes.map((c) => c.cls)).toEqual(["fixed", "equity", "crypto"]);
    expect(s.classes[0].ratio).toBeCloseTo(1209000 / 1590120, 6);
  });

  it("never lets a private asset reach the partner, not even in the total", () => {
    const view = partnerInvestmentsView([
      item({ id: "secret", amountCents: 500000, visibility: "private" }),
      item({ id: "total", amountCents: 100000, visibility: "totals" }),
      item({ id: "open", amountCents: 50000, visibility: "details" }),
      item({ id: "sold", amountCents: 70000, visibility: "details", status: "withdrawn" }),
      item({ id: "shared", amountCents: 90000, scope: "ours", visibility: "private" }),
    ]);
    expect(view.totalCents).toBe(150000);
    expect(view.assets.map((a) => a.id)).toEqual(["open"]);
    expect(JSON.stringify(view)).not.toContain("secret");
    expect(partnerInvestmentsView([item({ visibility: "private", amountCents: 1 })]).totalCents).toBeNull();
  });

  const snaps: Snapshot[] = [
    { investmentId: "a", date: "2026-09-10", amountCents: 100000, investedCents: 100000 },
    { investmentId: "a", date: "2026-10-31", amountCents: 102000, investedCents: 100000 },
    { investmentId: "b", date: "2026-10-15", amountCents: 50000, investedCents: 52000 },
    { investmentId: "a", date: "2026-11-14", amountCents: 103000, investedCents: 100000 },
  ];

  it("carries each asset's last value forward on every date", () => {
    expect(portfolioSeries(snaps, ["2026-09-01", "2026-09-30", "2026-10-31", "2026-11-16"])).toEqual([
      { date: "2026-09-30", amountCents: 100000, investedCents: 100000 },
      { date: "2026-10-31", amountCents: 152000, investedCents: 152000 },
      { date: "2026-11-16", amountCents: 153000, investedCents: 152000 },
    ]);
  });

  it("uses month ends while the history is long enough, else each day with a value", () => {
    expect(seriesDates(snaps, "2026-11-16", 6)).toEqual(["2026-09-30", "2026-10-31", "2026-11-16"]);
    const fresh: Snapshot[] = [
      { investmentId: "a", date: "2026-11-13", amountCents: 1, investedCents: 1 },
      { investmentId: "a", date: "2026-11-14", amountCents: 2, investedCents: 1 },
    ];
    expect(seriesDates(fresh, "2026-11-16", 6)).toEqual(["2026-11-13", "2026-11-14"]);
    expect(evolution(fresh, "2026-11-16", "6m").map((p) => p.label)).toEqual(["13/11", "14/11"]);
    expect(evolution(snaps, "2026-11-16", "6m").map((p) => p.label)).toEqual(["set", "out", "nov"]);
    expect(seriesDates([], "2026-11-16", 6)).toEqual([]);
  });

  it("counts this month's yield without taking new money as gain", () => {
    const items = [
      { id: "a", amountCents: 103000, investedCents: 100000, status: "active" as const },
      // Bought this month for 52.000, now 50.500: yield −1.500 since its first value.
      { id: "b", amountCents: 50500, investedCents: 52000, status: "active" as const },
    ];
    const withB: Snapshot[] = [...snaps.filter((s) => s.investmentId === "a"), { investmentId: "b", date: "2026-11-05", amountCents: 52000, investedCents: 52000 }];
    // a: gain 3.000 now − 2.000 at 31/10 = 1.000; b: −1.500 − 0 = −1.500.
    expect(gainSince(withB, items, "2026-11-01")).toBe(-500);
    expect(gainSince([], items, "2026-11-01")).toBeNull();
  });
});

describe("goals with investments", () => {
  it("records each milestone once and never takes one back", () => {
    expect(newMilestones(1000000, 520000, [])).toEqual([25, 50]);
    expect(newMilestones(1000000, 520000, [25])).toEqual([50]);
    // The value dropped below 50% after it was reached: nothing new, nothing removed.
    expect(newMilestones(1000000, 400000, [25, 50])).toEqual([]);
    expect(newMilestones(1000000, 1000000, [25, 50, 75])).toEqual([100]);
  });

  it("shares with the partner an asset that counts for a couple goal", () => {
    const base = { ownerId: "ana", type: "EQUITY", subtype: "STOCK", investedCents: 1, status: "active" as const, scope: "mine" as const };
    const items: PortfolioItem[] = [
      { ...base, id: "private-in-goal", amountCents: 1000, visibility: "private" },
      { ...base, id: "private", amountCents: 500, visibility: "private" },
    ];
    expect(partnerInvestmentsView(items).totalCents).toBeNull();
    const view = partnerInvestmentsView(items, new Set(["private-in-goal"]));
    expect(view.totalCents).toBe(1000);
    expect(view.assets.map((a) => a.id)).toEqual(["private-in-goal"]);
  });
});
