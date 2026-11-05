import { describe, expect, it } from "vitest";

import { draftFromAi, parseMessage } from "../lib/domain/whatsapp-intent";

const today = "2026-11-04";

describe("WhatsApp message parsing", () => {
  it("parses expenses with Brazilian amounts and connectors", () => {
    expect(parseMessage("gastei 45,90 no mercado", today)).toEqual({
      kind: "transaction",
      draft: { type: "debit", amountCents: 4590, description: "Mercado", date: today, tagHint: null },
    });
    expect(parseMessage("Paguei R$ 1.200 de aluguel", today)).toMatchObject({ draft: { amountCents: 120000, description: "Aluguel" } });
    expect(parseMessage("-30 uber", today)).toMatchObject({ draft: { type: "debit", amountCents: 3000, description: "Uber" } });
  });

  it("parses incomes, date hints and hashtags", () => {
    expect(parseMessage("recebi 3500 salário ontem", today)).toMatchObject({
      draft: { type: "credit", amountCents: 350000, description: "Salário", date: "2026-11-03" },
    });
    expect(parseMessage("gastei 80 farmácia dia 28 #saude", today)).toMatchObject({
      draft: { amountCents: 8000, description: "Farmácia", date: "2026-10-28", tagHint: "saude" },
    });
    expect(parseMessage("comprei tênis 299,90 em 02/11", today)).toMatchObject({
      draft: { amountCents: 29990, description: "Tênis", date: "2026-11-02" },
    });
  });

  it("recognizes commands and link codes", () => {
    expect(parseMessage("ajuda", today)).toEqual({ kind: "help" });
    expect(parseMessage("saldo", today)).toEqual({ kind: "query", query: "balance" });
    expect(parseMessage("Resumo do mês", today)).toEqual({ kind: "query", query: "summary" });
    expect(parseMessage("próximas contas", today)).toEqual({ kind: "query", query: "upcoming" });
    expect(parseMessage("vincular ab12-cd34", today)).toEqual({ kind: "link", code: "AB12CD34" });
  });

  it("sends ambiguous messages with numbers to the AI fallback", () => {
    expect(parseMessage("almoço com a equipe ficou 62 conto", today)).toEqual({ kind: "needs_ai" });
    expect(parseMessage("bom dia", today)).toEqual({ kind: "unknown" });
  });
});

describe("AI draft validation", () => {
  it("accepts a well-formed draft", () => {
    expect(draftFromAi({ tipo: "saida", valor: 62, descricao: "Almoço equipe", categoria: "alimentação", data: null }, today)).toEqual({
      type: "debit", amountCents: 6200, description: "Almoço equipe", date: today, tagHint: "alimentação",
    });
    expect(draftFromAi({ tipo: "entrada", valor: "1.500,00", descricao: "freela" }, today)?.amountCents).toBe(150000);
  });

  it("rejects malformed or implausible output and clamps odd dates", () => {
    expect(draftFromAi({ tipo: "transfer", valor: 1, descricao: "x" }, today)).toBeNull();
    expect(draftFromAi({ tipo: "saida", valor: -5, descricao: "x" }, today)).toBeNull();
    expect(draftFromAi({ tipo: "saida", valor: 10, descricao: "" }, today)).toBeNull();
    expect(draftFromAi("DROP TABLE", today)).toBeNull();
    expect(draftFromAi({ tipo: "saida", valor: 10, descricao: "x", data: "2030-01-01" }, today)?.date).toBe(today);
  });
});
