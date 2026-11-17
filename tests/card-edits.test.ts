import { describe, expect, it } from "vitest";

import { cardItemFingerprint, findEdit, type CardEdit } from "@/lib/domain/card-edits";

const item = { transaction_date: "2026-11-10", amount_cents: 4590, type: "debit" as const, installment_number: 2, description: "MERCADO CENTRAL 02/03" };
const edit = (over: Partial<CardEdit>): CardEdit => ({ id: "e1", provider_transaction_id: "p1", fingerprint: cardItemFingerprint(item), tag_id: "t1", user_description: null, scope: "ours", ...over });

describe("card item fingerprint", () => {
  it("ignores case, accents and the installment suffix", () => {
    expect(cardItemFingerprint(item)).toBe("2026-11-10|4590|debit|2|mercado central");
    expect(cardItemFingerprint({ ...item, description: "Mercado Céntral parc 2 de 3" })).toBe(cardItemFingerprint(item));
  });

  it("keeps purchases on other days or amounts apart", () => {
    expect(cardItemFingerprint({ ...item, amount_cents: 4591 })).not.toBe(cardItemFingerprint(item));
    expect(cardItemFingerprint({ ...item, transaction_date: "2026-11-11" })).not.toBe(cardItemFingerprint(item));
  });
});

describe("finding the edit of a card purchase", () => {
  it("prefers the provider id", () => {
    expect(findEdit([edit({ fingerprint: "other" })], "p1", item)?.id).toBe("e1");
  });

  it("finds it by fingerprint when the bank re-issues the id", () => {
    expect(findEdit([edit({})], "new-id", { ...item, description: "Mercado Central" })?.id).toBe("e1");
  });

  it("falls back to date, amount and installment when the bank renames the purchase", () => {
    expect(findEdit([edit({})], "new-id", { ...item, description: "MERC CENTRAL LTDA" })?.id).toBe("e1");
  });

  it("does not guess between two edits that fit the same way", () => {
    const twins = [edit({ id: "a", provider_transaction_id: "x", fingerprint: "2026-11-10|4590|debit|2|loja a" }), edit({ id: "b", provider_transaction_id: "y", fingerprint: "2026-11-10|4590|debit|2|loja b" })];
    expect(findEdit(twins, "new-id", { ...item, description: "outra loja" })).toBeNull();
  });

  it("finds nothing for another purchase", () => {
    expect(findEdit([edit({})], "new-id", { ...item, amount_cents: 1000 })).toBeNull();
  });
});
