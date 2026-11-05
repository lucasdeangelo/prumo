import { describe, expect, it } from "vitest";

import { categorize, resolveTagHint } from "../lib/domain/categorize";
import { addMonths, monthBounds, lastMonths, todayIn } from "../lib/domain/dates";
import { buildForecast, forecastTotals } from "../lib/domain/forecast";
import { decimalToCents, parseBRL } from "../lib/domain/money";
import { normalizeMerchant } from "../lib/domain/normalize";
import { findBillMatches } from "../lib/domain/reconcile";
import { monthlyEquivalentCents, occurrencesBetween } from "../lib/domain/recurrence";
import { chargeMatchesSubscription, detectSubscriptions, isKnownSubscription } from "../lib/domain/subscriptions";
import { monthlySeries, summarizeMonth } from "../lib/domain/summary";

describe("money", () => {
  it("converts provider decimals to cents without float drift", () => {
    expect(decimalToCents(-55.9)).toBe(-5590);
    expect(decimalToCents(0.1 + 0.2)).toBe(30);
    expect(decimalToCents("1234.565")).toBe(123457);
    expect(decimalToCents(19.99)).toBe(1999);
    expect(() => decimalToCents("abc")).toThrow();
  });

  it("parses amounts typed in Brazilian format", () => {
    expect(parseBRL("R$ 1.234,56")).toBe(123456);
    expect(parseBRL("45,9")).toBe(4590);
    expect(parseBRL("45.90")).toBe(4590);
    expect(parseBRL("1.500")).toBe(150000);
    expect(parseBRL("2k")).toBe(200000);
    expect(parseBRL("3 mil")).toBe(300000);
    expect(parseBRL("1,234.56")).toBe(123456);
    expect(parseBRL("0")).toBeNull();
    expect(parseBRL("abc")).toBeNull();
    expect(parseBRL("1,2,3")).toBeNull();
  });
});

describe("dates", () => {
  it("derives today in São Paulo, not UTC", () => {
    expect(todayIn("America/Sao_Paulo", new Date("2026-11-05T01:30:00Z"))).toBe("2026-11-04");
  });

  it("keeps month-end anchors without drift", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("computes month boundaries and history windows", () => {
    expect(monthBounds("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28", prev: "2026-01", next: "2026-03" });
    expect(monthBounds("2026-12").next).toBe("2027-01");
    expect(lastMonths("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(() => monthBounds("2026-13")).toThrow();
  });
});

describe("recurrence", () => {
  it("lists occurrences in a window anchored on the start day", () => {
    expect(occurrencesBetween("2026-01-31", "monthly", "2026-02-01", "2026-04-30")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occurrencesBetween("2026-11-01", "weekly", "2026-11-05", "2026-11-20")).toEqual(["2026-11-08", "2026-11-15"]);
    expect(occurrencesBetween("2026-11-10", "once", "2026-11-01", "2026-11-30")).toEqual(["2026-11-10"]);
  });

  it("produces the same result on repeated generation", () => {
    const a = occurrencesBetween("2026-03-15", "quarterly", "2026-01-01", "2027-12-31");
    const b = occurrencesBetween("2026-03-15", "quarterly", "2026-01-01", "2027-12-31");
    expect(a).toEqual(b);
    expect(a).toHaveLength(8);
  });

  it("turns annual prices into a monthly cost", () => {
    expect(monthlyEquivalentCents(120000, "annual")).toBe(10000);
    expect(monthlyEquivalentCents(1000, "weekly")).toBe(4349);
  });
});

const tags = [
  { id: "food", name: "Alimentação" },
  { id: "market", name: "Mercado" },
  { id: "subs", name: "Assinaturas" },
  { id: "salary", name: "Salário" },
  { id: "transport", name: "Transporte" },
  { id: "other", name: "Outros" },
  { id: "fun", name: "Lazer" },
];

describe("normalization and categorization", () => {
  it("reduces bank descriptions to stable merchant keys", () => {
    expect(normalizeMerchant("COMPRA CARTAO NETFLIX.COM 12/10")).toBe("netflix");
    expect(normalizeMerchant("IFD*IFOOD.COM AGENCIA DE RESTAURANTES")).toBe("ifood agencia de");
    expect(normalizeMerchant("PIX ENVIADO Mercadinho São José")).toBe("mercadinho sao jose");
    expect(normalizeMerchant("UBER *TRIP HELP.UBER.COM")).toBe("uber trip help");
    expect(normalizeMerchant("Assinatura do Claude")).toBe("claude");
    expect(normalizeMerchant("plano ChatGPT Plus")).toBe("chatgpt plus");
  });

  it("lets user rules win over built-in keywords", () => {
    const rules = [{ pattern: "netflix", pattern_type: "contains" as const, tag_id: "fun", priority: 0 }];
    expect(categorize({ description: "NETFLIX.COM", type: "debit" }, rules, tags)).toEqual({ tagId: "fun", confidence: 1, source: "rule" });
    expect(categorize({ description: "NETFLIX.COM", type: "debit" }, [], tags)?.tagId).toBe("subs");
  });

  it("uses keywords, then provider category, then a low-confidence fallback", () => {
    expect(categorize({ description: "UBER *TRIP", type: "debit" }, [], tags)?.tagId).toBe("transport");
    expect(categorize({ description: "Supermercado Dia", type: "debit" }, [], tags)?.tagId).toBe("market");
    expect(categorize({ description: "SALARIO EMPRESA X", type: "credit" }, [], tags)?.tagId).toBe("salary");
    expect(categorize({ description: "LOJA XPTO", type: "debit", providerCategory: "Eating out" }, [], tags))
      .toEqual({ tagId: "food", confidence: 0.6, source: "provider" });
    expect(categorize({ description: "LOJA XPTO", type: "debit" }, [], tags)).toEqual({ tagId: "other", confidence: 0.2, source: "fallback" });
  });

  it("does not tag an income as a purchase keyword", () => {
    expect(categorize({ description: "PIX RECEBIDO uber", type: "credit" }, [], tags)?.tagId).toBe("other");
  });

  it("resolves tag hints loosely", () => {
    expect(resolveTagHint("#mercado", tags)).toBe("market");
    expect(resolveTagHint("alimentacao", tags)).toBe("food");
    expect(resolveTagHint("nada", tags)).toBeNull();
  });
});

describe("subscription detection", () => {
  const tx = (id: string, date: string, cents: number, merchant: string) => ({
    id, type: "debit" as const, amount_cents: cents, transaction_date: date, normalized_merchant: merchant,
  });

  it("detects a regular monthly charge and predicts the next one", () => {
    const result = detectSubscriptions([
      tx("1", "2026-08-10", 3990, "academia boa forma"),
      tx("2", "2026-09-10", 3990, "academia boa forma"),
      tx("3", "2026-10-10", 3990, "academia boa forma"),
      tx("4", "2026-10-11", 2500, "padaria"),
    ], "2026-11-04");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ normalizedName: "academia boa forma", frequency: "monthly", nextChargeDate: "2026-11-10", amountCents: 3990 });
    expect(result[0].confidence).toBeGreaterThan(0.6);
  });

  it("suggests known services from a single charge but ignores irregular merchants", () => {
    const result = detectSubscriptions([
      tx("1", "2026-10-20", 5590, "netflix"),
      tx("2", "2026-08-01", 1000, "loja"),
      tx("3", "2026-08-15", 1000, "loja"),
      tx("4", "2026-10-30", 1000, "loja"),
    ], "2026-11-04");
    expect(result.map((r) => r.normalizedName)).toEqual(["netflix"]);
    // A single charge of a known service registered by hand or WhatsApp is enough.
    expect(detectSubscriptions([tx("9", "2026-11-05", 11800, "claude")], "2026-11-05")).toMatchObject([
      { normalizedName: "claude", name: "Claude", amountCents: 11800, frequency: "monthly", nextChargeDate: "2026-12-05" },
    ]);
    expect(isKnownSubscription("google one storage")).toBe(true);
  });

  it("leaves recurring bills such as rent and electricity to upcoming bills", () => {
    expect(detectSubscriptions([
      tx("1", "2026-08-05", 150000, "aluguel"), tx("2", "2026-09-05", 150000, "aluguel"), tx("3", "2026-10-05", 150000, "aluguel"),
      tx("4", "2026-08-20", 21000, "enel energia"), tx("5", "2026-09-20", 22000, "enel energia"), tx("6", "2026-10-20", 21500, "enel energia"),
    ], "2026-11-04")).toEqual([]);
  });

  it("drops series that stopped and charges with unstable amounts", () => {
    expect(detectSubscriptions([tx("1", "2026-01-05", 2000, "spotify"), tx("2", "2026-02-05", 2000, "spotify")], "2026-11-04")).toEqual([]);
    expect(detectSubscriptions([
      tx("1", "2026-08-05", 1000, "servico x"), tx("2", "2026-09-05", 5000, "servico x"), tx("3", "2026-10-05", 1000, "servico x"),
    ], "2026-11-04")).toEqual([]);
    // Monthly groceries vary more than 10%: not a subscription.
    expect(detectSubscriptions([
      tx("1", "2026-08-06", 63700, "supermercado dia"), tx("2", "2026-09-06", 70000, "supermercado dia"), tx("3", "2026-10-06", 78500, "supermercado dia"),
    ], "2026-11-04")).toEqual([]);
  });

  it("matches charges to a subscription by merchant and amount", () => {
    const sub = { normalized_name: "netflix", amount_cents: 5590 };
    expect(chargeMatchesSubscription({ type: "debit", amount_cents: 5990, normalized_merchant: "netflix" }, sub)).toBe(true);
    expect(chargeMatchesSubscription({ type: "debit", amount_cents: 15990, normalized_merchant: "netflix" }, sub)).toBe(false);
    expect(chargeMatchesSubscription({ type: "credit", amount_cents: 5590, normalized_merchant: "netflix" }, sub)).toBe(false);
  });
});

describe("forecast", () => {
  it("separates confirmed, overdue and predicted items", () => {
    const items = buildForecast({
      today: "2026-11-04",
      to: "2027-01-31",
      bills: [
        { id: "rent", description: "Aluguel", amount_cents: 150000, type: "payable", due_date: "2026-11-10", status: "pending", recurrence_type: "monthly", recurrence_interval: null, recurrence_unit: null, tag_id: null },
        { id: "late", description: "Luz", amount_cents: 20000, type: "payable", due_date: "2026-11-01", status: "pending", recurrence_type: "once", recurrence_interval: null, recurrence_unit: null, tag_id: null },
        { id: "paid", description: "Água", amount_cents: 9000, type: "payable", due_date: "2026-11-02", status: "paid", recurrence_type: "once", recurrence_interval: null, recurrence_unit: null, tag_id: null },
      ],
      subscriptions: [{ id: "nf", name: "Netflix", amount_cents: 5590, frequency: "monthly", next_charge_date: "2026-11-20", status: "active", tag_id: null }],
    });
    expect(items.map((i) => `${i.date} ${i.description} ${i.state}`)).toEqual([
      "2026-11-01 Luz overdue",
      "2026-11-10 Aluguel confirmed",
      "2026-11-20 Netflix predicted",
      "2026-12-10 Aluguel predicted",
      "2026-12-20 Netflix predicted",
      "2027-01-10 Aluguel predicted",
      "2027-01-20 Netflix predicted",
    ]);
    expect(forecastTotals(items).outCents).toBe(20000 + 3 * 150000 + 3 * 5590);
  });
});

describe("summaries", () => {
  const txs = [
    { amount_cents: 500000, type: "credit" as const, transaction_date: "2026-11-01", tag_id: "salary" },
    { amount_cents: 2000, type: "debit" as const, transaction_date: "2026-11-02", tag_id: "food" },
    { amount_cents: 3000, type: "debit" as const, transaction_date: "2026-11-02", tag_id: "market" },
    { amount_cents: 100000, type: "debit" as const, transaction_date: "2026-11-03", tag_id: "transfer" },
    { amount_cents: 7000, type: "debit" as const, transaction_date: "2026-10-30", tag_id: "food" },
  ];
  const summaryTags = [{ id: "transfer", excluded_from_totals: true }, { id: "food", excluded_from_totals: false }];

  it("excludes transfers and other months", () => {
    const s = summarizeMonth(txs, summaryTags, "2026-11");
    expect(s).toMatchObject({ incomeCents: 500000, expenseCents: 5000, netCents: 495000 });
    expect(s.expenseByTag[0]).toEqual({ tagId: "market", cents: 3000 });
    expect(s.daily).toHaveLength(30);
    expect(s.daily[1]).toEqual({ date: "2026-11-02", expenseCents: 5000, incomeCents: 500000 });
  });

  it("builds a monthly series", () => {
    expect(monthlySeries(txs, summaryTags, ["2026-10", "2026-11"])).toEqual([
      { month: "2026-10", incomeCents: 0, expenseCents: 7000 },
      { month: "2026-11", incomeCents: 500000, expenseCents: 5000 },
    ]);
  });
});

describe("reconciliation", () => {
  const bill = { id: "b", description: "Conta de luz", amount_cents: 18990, type: "payable" as const, due_date: "2026-11-10" };

  it("auto-links only a single strong match", () => {
    const single = findBillMatches(bill, [
      { id: "t1", amount_cents: 18990, type: "debit", transaction_date: "2026-11-09", description: "ENEL LUZ" },
      { id: "t2", amount_cents: 18990, type: "credit", transaction_date: "2026-11-09", description: "estorno" },
    ]);
    expect(single.auto).toBe("t1");
  });

  it("leaves ambiguous matches to the user", () => {
    const ambiguous = findBillMatches(bill, [
      { id: "t1", amount_cents: 18990, type: "debit", transaction_date: "2026-11-09", description: "A" },
      { id: "t2", amount_cents: 18990, type: "debit", transaction_date: "2026-11-11", description: "B" },
    ]);
    expect(ambiguous.auto).toBeNull();
    expect(ambiguous.candidates).toHaveLength(2);
  });

  it("never reuses a fact that already settled another bill", () => {
    const used = findBillMatches(bill, [
      { id: "t1", amount_cents: 18990, type: "debit", transaction_date: "2026-11-09", description: "A" },
    ], new Set(["t1"]));
    expect(used.candidates).toEqual([]);
  });
});
