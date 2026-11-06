import { describe, expect, it } from "vitest";

import {
  budgetAlertsToSend,
  budgetStatus,
  firstShare,
  goalPlan,
  goalProgress,
  invoiceSettlement,
  milestonesCrossed,
  monthSettlement,
  splitCents,
  suggestBudget,
  talkPoints,
} from "../lib/domain/couple";
import { formatBRL } from "../lib/domain/money";
import { buildPixPayload, crc16, maskPixKey, normalizePixKey } from "../lib/domain/pix";
import { applyPrivacyRules, keptPrivateSummary, partnerAccountsView, partnerMayReassign, projectForPartner, type OwnedAccount, type OwnedTransaction } from "../lib/domain/visibility";
import { safeRelativePath } from "../lib/safe-path";

const today = "2026-11-05";
const account = (id: string, visibility: OwnedAccount["visibility"]): OwnedAccount => ({ id, name: id, visibility, balance_cents: 100000, type: "BANK" });
const tx = (over: Partial<OwnedTransaction>): OwnedTransaction => ({
  id: "t", account_id: "conta", amount_cents: 6430, type: "debit", transaction_date: "2026-11-01", label: "Drogaria São Paulo",
  tag_id: "saude", scope: "mine", privacy: "account", surprise_until: null, surprise_hide_amount: false, free_money: false, ...over,
});

describe("what the partner sees", () => {
  it("private accounts do not exist for the partner, totals show no lines", () => {
    expect(projectForPartner(tx({}), account("conta", "private"), today)).toBeNull();
    const view = partnerAccountsView([account("a", "private"), account("b", "totals")], [tx({ account_id: "b" })], today);
    expect(view.map((v) => v.id)).toEqual(["b"]);
    expect(view[0]).toMatchObject({ visibility: "totals", monthOutCents: 6430, lines: [] });
  });

  it("details shows lines except hidden ones and free money, which leave no trace", () => {
    const acc = account("conta", "details");
    expect(projectForPartner(tx({}), acc, today)).toMatchObject({ kind: "detail", label: "Drogaria São Paulo" });
    expect(projectForPartner(tx({ privacy: "hidden" }), acc, today)).toBeNull();
    expect(projectForPartner(tx({ free_money: true }), acc, today)).toBeNull();
    const [view] = partnerAccountsView([acc], [tx({ id: "1" }), tx({ id: "2", privacy: "hidden", amount_cents: 22000 })], today);
    expect(view.lines.map((l) => l.id)).toEqual(["1"]);
    // The month outflow still includes the hidden item so balances add up.
    expect(view.monthOutCents).toBe(6430 + 22000);
  });

  it("category only hides the store; a surprise shows as reserved until its date", () => {
    const acc = account("conta", "details");
    const categoryOnly = projectForPartner(tx({ privacy: "category_only" }), acc, today);
    expect(categoryOnly).toEqual({ kind: "category_only", id: "t", tagId: "saude", amountCents: 6430, type: "debit", date: "2026-11-01", scope: "mine" });
    expect(JSON.stringify(categoryOnly)).not.toContain("Drogaria");
    expect(projectForPartner(tx({ surprise_until: "2026-12-24", amount_cents: 38900 }), acc, today)).toEqual({
      kind: "reserved", id: "t", until: "2026-12-24", amountCents: 38900, date: "2026-11-01",
    });
    expect(projectForPartner(tx({ surprise_until: "2026-12-24", surprise_hide_amount: true }), acc, today)).toBeNull();
    // After the date it appears normally.
    expect(projectForPartner(tx({ surprise_until: "2026-11-01" }), acc, today)).toMatchObject({ kind: "detail" });
  });

  it("anything marked Nosso, or the partner's own purchase, is always visible in full", () => {
    expect(projectForPartner(tx({ scope: "ours", privacy: "hidden" }), account("conta", "private"), today)).toMatchObject({ kind: "detail", scope: "ours" });
    expect(projectForPartner(tx({ scope: "partner" }), account("conta", "private"), today)).toMatchObject({ kind: "detail", scope: "partner" });
  });

  it("summarizes what stays private for the owner's preview", () => {
    const summary = keptPrivateSummary(
      [account("Caixinha", "private"), account("conta", "details")],
      [tx({ label: "Terapia", privacy: "hidden" }), tx({ id: "2", free_money: true }), tx({ id: "3", free_money: true })],
      today,
    );
    expect(summary).toEqual({ privateAccounts: ["Caixinha"], hidden: ["Terapia"], freeMoneyCount: 2, hiddenSurprises: 0 });
  });

  it("applies the owner's privacy rules, most private wins", () => {
    const rules = [
      { match_type: "merchant" as const, tag_id: null, account_id: null, pattern: "drogaria", action: "category_only" as const },
      { match_type: "tag" as const, tag_id: "saude", account_id: null, pattern: null, action: "hidden" as const },
      { match_type: "tag" as const, tag_id: "presentes", account_id: null, pattern: null, action: "ask_surprise" as const },
    ];
    expect(applyPrivacyRules({ tag_id: "mercado", account_id: null, label: "Drogaria Raia" }, rules)).toEqual({ privacy: "category_only", askSurprise: false });
    expect(applyPrivacyRules({ tag_id: "saude", account_id: null, label: "Drogaria Raia" }, rules)).toEqual({ privacy: "hidden", askSurprise: false });
    expect(applyPrivacyRules({ tag_id: "presentes", account_id: null, label: "Relojoaria" }, rules)).toEqual({ privacy: "account", askSurprise: true });
  });
});

describe("splitting and settling up", () => {
  it("splits by income, equally, or a fixed share, always adding up", () => {
    expect(firstShare("income", [580000, 420000])).toBeCloseTo(0.58);
    expect(firstShare("income", [null, 420000])).toBe(0.5);
    expect(firstShare("fixed", [1, 1], 0.6)).toBe(0.6);
    // Design: 3 grocery purchases of R$ 735,80 by income → Ana R$ 426,76 · Rafa R$ 309,04.
    expect(splitCents(73580, 0.58)).toEqual([42676, 30904]);
    expect(splitCents(101, 0.5)).toEqual([51, 50]);
  });

  it("matches the designed November invoice: Rafa transfers R$ 958,40 to Ana", () => {
    const items = [
      { amountCents: 138020, type: "debit" as const, owner: "ours" as const, holderShare: 0.5 },
      { amountCents: 48610, type: "debit" as const, owner: "holder" as const, holderShare: 0.5 },
      { amountCents: 26830, type: "debit" as const, owner: "partner" as const, holderShare: 0.5 },
    ];
    expect(invoiceSettlement(items)).toEqual({
      totalCents: 213460, oursCents: 138020, holderCents: 48610, partnerCents: 26830, partnerShareOfOursCents: 69010, partnerOwesCents: 95840,
    });
  });

  it("refunds reduce what is owed and never produce a negative transfer", () => {
    const result = invoiceSettlement([
      { amountCents: 10000, type: "debit", owner: "partner", holderShare: 0.5 },
      { amountCents: 15000, type: "credit", owner: "partner", holderShare: 0.5 },
    ]);
    expect(result.partnerOwesCents).toBe(0);
  });

  it("settles a month of shared spending against the chosen proportion", () => {
    const result = monthSettlement([
      { paidBy: 0, amountCents: 300000, firstShare: 0.58 },
      { paidBy: 1, amountCents: 100000, firstShare: 0.58 },
    ]);
    // Ana paid 3.000 but owed 58% of 4.000 = 2.320 → Rafa owes Ana 680.
    expect(result.secondOwesFirstCents).toBe(68000);
  });
});

describe("budget, goals and the look back", () => {
  it("classifies budget lines like the design (80% attention, over the limit)", () => {
    expect(budgetStatus({ category: "Mercado", limitCents: 140000, spentCents: 112000 })).toMatchObject({ percent: 80, state: "attention", remainingCents: 28000 });
    expect(budgetStatus({ category: "Lazer", limitCents: 50000, spentCents: 52000 })).toMatchObject({ state: "over", remainingCents: -2000 });
    expect(budgetStatus({ category: "Transporte", limitCents: 90000, spentCents: 64000 }).state).toBe("ok");
  });

  it("sends each 80/100 alert once per category and month", () => {
    const lines = [{ category: "Mercado", limitCents: 100, spentCents: 85 }, { category: "Lazer", limitCents: 100, spentCents: 120 }];
    const first = budgetAlertsToSend(lines, new Set(), "2026-11");
    expect(first.map((a) => a.key)).toEqual(["Mercado|2026-11|80", "Lazer|2026-11|80", "Lazer|2026-11|100"]);
    expect(budgetAlertsToSend(lines, new Set(first.map((a) => a.key)), "2026-11")).toEqual([]);
  });

  it("suggests budgets from the average of past months", () => {
    expect(suggestBudget([{ Moradia: 308000, Lazer: 60000 }, { Moradia: 308000, Lazer: 68000 }])).toEqual([
      { category: "Moradia", amountCents: 308000 },
      { category: "Lazer", amountCents: 64000 },
    ]);
  });

  it("projects a goal like the designed trip: one month ahead of March 2027", () => {
    const p = goalProgress({ targetCents: 1_000_000, savedCents: 620_000, monthlyPaceCents: 130_000, deadline: "2027-03-01", today: "2026-11-05" });
    expect(p).toMatchObject({ percent: 62, missingCents: 380_000, reachMonth: "2027-02", monthsAhead: 1 });
    const late = goalProgress({ targetCents: 1_200_000, savedCents: 210_000, monthlyPaceCents: 40_000, deadline: "2027-12-01", today: "2026-11-05" });
    expect(late.monthsAhead).toBeLessThan(0);
    expect(late.extraMonthlyCents).toBeGreaterThan(0);
  });

  it("detects milestones crossed by a deposit, once", () => {
    expect(milestonesCrossed(1_000_000, 440_000, 510_000)).toEqual([50]);
    expect(milestonesCrossed(1_000_000, 510_000, 520_000)).toEqual([]);
    expect(milestonesCrossed(1_000, 0, 1_000)).toEqual([25, 50, 75, 100]);
  });

  it("plans the monthly amount per person to finish on time", () => {
    expect(goalPlan(1_200_000, 0, "2027-11-01", "2026-11-05", 0.58)).toEqual({ months: 12, monthlyCents: 100_000, firstCents: 58_000, secondCents: 42_000 });
  });

  it("raises neutral talk points, at most three", () => {
    const points = talkPoints(
      {
        month: "2026-10",
        sharedByCategory: { Lazer: 69000, Delivery: 20000 },
        previousSharedByCategory: { Delivery: 41000 },
        budgets: { Lazer: 50000 },
        goals: [{ id: "g", name: "A viagem", monthsAhead: 1, savedThisMonthCents: 130000 }],
      },
      formatBRL,
    );
    expect(points.map((p) => p.key)).toEqual(["over:Lazer", "ahead:g", "drop:Delivery"]);
    expect(points[0].title).toBe(`Lazer passou ${formatBRL(19000)} do combinado`);
  });
});

describe("Pix copia e cola", () => {
  it("computes the BR Code CRC exactly like the Banco Central example", () => {
    expect(crc16("123456789")).toBe("29B1");
    const example = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
    expect(crc16(example)).toBe("1D3D");
  });

  it("builds a payload with amount, key and a valid checksum", () => {
    const payload = buildPixPayload({ key: "(11) 98765-4321", amountCents: 95840, name: "Ana Souza", description: "Prumo · fatura nov", txid: "PRUMONOV" });
    expect(payload).toContain("br.gov.bcb.pix");
    expect(payload).toContain("0114+5511987654321");
    expect(payload).toContain("5406958.40");
    expect(crc16(payload.slice(0, -4))).toBe(payload.slice(-4));
  });

  it("normalizes and masks keys", () => {
    expect(normalizePixKey("Ana@Exemplo.com")).toBe("ana@exemplo.com");
    expect(normalizePixKey("123.456.789-09")).toBe("12345678909");
    expect(maskPixKey("(11) 98765-4321")).toBe("celular •••• 4321");
  });
});

describe("security rules", () => {
  it("the partner may only reassign what they already see in full", () => {
    const details = account("conta", "details");
    expect(partnerMayReassign(tx({}), details, today)).toBe(true);
    expect(partnerMayReassign(tx({ privacy: "category_only" }), details, today)).toBe(false);
    expect(partnerMayReassign(tx({ privacy: "hidden" }), details, today)).toBe(false);
    expect(partnerMayReassign(tx({ free_money: true }), details, today)).toBe(false);
    expect(partnerMayReassign(tx({ surprise_until: "2026-12-24" }), details, today)).toBe(false);
    expect(partnerMayReassign(tx({}), account("conta", "totals"), today)).toBe(false);
    expect(partnerMayReassign(tx({}), account("conta", "private"), today)).toBe(false);
    expect(partnerMayReassign(tx({}), undefined, today)).toBe(false);
    expect(partnerMayReassign(tx({ scope: "ours" }), account("conta", "private"), today)).toBe(true);
    expect(partnerMayReassign(tx({ scope: "partner" }), account("conta", "private"), today)).toBe(true);
  });

  it("redirects stay on this site", () => {
    expect(safeRelativePath("/cards?m=1", "/x")).toBe("/cards?m=1");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "/a\\b", " //evil.com", "/\tx", "javascript:alert(1)", "", null, 42]) {
      expect(safeRelativePath(bad, "/x")).toBe("/x");
    }
  });
});
