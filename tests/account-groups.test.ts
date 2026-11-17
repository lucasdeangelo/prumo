import { describe, expect, it } from "vitest";

import { groupAccountsByBank, type GroupableAccount } from "@/lib/domain/account-groups";

const account = (over: Partial<GroupableAccount>): GroupableAccount => ({
  id: "a",
  name: "Conta",
  type: "BANK",
  subtype: "CHECKING_ACCOUNT",
  balance_cents: 0,
  pluggy_item_id: null,
  institution: null,
  card_last4: null,
  visibility: "private",
  ...over,
});

describe("accounts grouped by bank", () => {
  it("puts a connection's account and card in one row, checking first", () => {
    const [bank] = groupAccountsByBank([
      account({ id: "card", type: "CREDIT", subtype: "CREDIT_CARD", name: "platinum", balance_cents: -50000, pluggy_item_id: "i1", card_last4: "5497" }),
      account({ id: "acc", name: "Conta", institution: "Nubank", balance_cents: 120000, pluggy_item_id: "i1", card_last4: "7425" }),
    ]);
    expect(bank.name).toBe("Nubank");
    expect(bank.products).toEqual([{ id: "acc", label: "Conta", last4: "7425" }, { id: "card", label: "Cartão", last4: "5497" }]);
    // The card is debt, shown in Cartões: the bank's money is the account only.
    expect(bank.balanceCents).toBe(120000);
  });

  it("tells checking and savings apart and adds their money", () => {
    const [bank] = groupAccountsByBank([
      account({ id: "s", subtype: "SAVINGS_ACCOUNT", institution: "Bradesco", balance_cents: 3000, pluggy_item_id: "i2", card_last4: "1107" }),
      account({ id: "c", institution: "Bradesco", balance_cents: 7000, pluggy_item_id: "i2", card_last4: "1107" }),
    ]);
    expect(bank.products.map((p) => p.label)).toEqual(["Conta", "Poupança"]);
    expect(bank.balanceCents).toBe(10000);
  });

  it("joins accounts of the same bank across connections and manual ones", () => {
    const groups = groupAccountsByBank([
      account({ id: "b1", institution: "Bradesco", pluggy_item_id: "i1", card_last4: "1107" }),
      account({ id: "b2", institution: "Bradesco", pluggy_item_id: "i2", card_last4: "1107" }),
      account({ id: "n1", name: "Nubank conta", institution: "Nubank" }),
      account({ id: "n2", name: "Cartão Nubank", type: "CREDIT", institution: "Nubank" }),
    ]);
    expect(groups.map((g) => [g.name, g.products.map((p) => p.label)])).toEqual([["Bradesco", ["Conta", "Conta"]], ["Nubank", ["Conta", "Cartão"]]]);
  });

  it("keeps each manual account on its own row with its name", () => {
    const groups = groupAccountsByBank([account({ id: "m1", name: "Carteira" }), account({ id: "m2", name: "Cofrinho" })]);
    expect(groups.map((g) => [g.name, g.products[0].label])).toEqual([["Carteira", "Carteira"], ["Cofrinho", "Cofrinho"]]);
  });

  it("has no balance for a bank with only a card, and no shared visibility when accounts differ", () => {
    const [bank] = groupAccountsByBank([
      account({ id: "x", type: "CREDIT", pluggy_item_id: "i3", institution: "Itaú", visibility: "details" }),
      account({ id: "y", type: "CREDIT", pluggy_item_id: "i3", institution: "Itaú", visibility: "private" }),
    ]);
    expect(bank.balanceCents).toBeNull();
    expect(bank.visibility).toBeNull();
  });
});
