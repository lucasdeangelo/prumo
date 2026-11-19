import { describe, expect, it } from "vitest";

import { detectSubscriptions, isKnownSubscription, merchantIsSubscription, taggedOutsideList } from "@/lib/domain/subscriptions";

const tx = (id: string, date: string, cents: number, merchant: string) => ({ id, type: "debit" as const, amount_cents: cents, transaction_date: date, normalized_merchant: merchant });

describe("subscription detection, looser", () => {
  it("survives one charge that came late in a long monthly series", () => {
    const result = detectSubscriptions([
      tx("1", "2026-06-01", 3500, "vivo"), tx("2", "2026-07-01", 3500, "vivo"), tx("3", "2026-08-01", 3500, "vivo"),
      tx("4", "2026-09-10", 3500, "vivo"), tx("5", "2026-10-10", 3500, "vivo"),
    ], "2026-11-01");
    expect(result).toMatchObject([{ normalizedName: "vivo", frequency: "monthly", amountCents: 3500 }]);
  });

  it("still refuses a short series with an odd gap", () => {
    expect(detectSubscriptions([tx("1", "2026-08-01", 1000, "loja"), tx("2", "2026-08-15", 1000, "loja"), tx("3", "2026-10-30", 1000, "loja")], "2026-11-04")).toEqual([]);
  });

  it("follows a price change after a steady price", () => {
    const result = detectSubscriptions([
      tx("1", "2026-07-18", 1490, "apple"), tx("2", "2026-08-18", 1490, "apple"), tx("3", "2026-09-18", 1490, "apple"), tx("4", "2026-10-18", 2990, "apple"),
    ], "2026-11-01");
    expect(result).toMatchObject([{ normalizedName: "apple", amountCents: 2990 }]);
  });

  it("recognizes known services the bank writes with a space", () => {
    expect(isKnownSubscription("open ai")).toBe(true);
    expect(isKnownSubscription("maxxi atacado")).toBe(true); // "max" was always a prefix match
    expect(isKnownSubscription("padaria")).toBe(false);
  });
});

describe("tagged Assinaturas outside the list", () => {
  it("matches a merchant to a subscription by its name words", () => {
    expect(merchantIsSubscription("anthropic claude sub", "claude")).toBe(true);
    expect(merchantIsSubscription("spotify servicos de", "spotify servicos de")).toBe(true);
    expect(merchantIsSubscription("tiktok sh", "tim")).toBe(false);
  });

  it("lists tagged merchants missing from the list, variants together, newest first", () => {
    const result = taggedOutsideList(
      [
        { key: "vivo", amount_cents: 3500, date: "2026-10-10" },
        { key: "vivo lite vivo", amount_cents: 3500, date: "2026-11-10" },
        { key: "anthropic claude sub", amount_cents: 11440, date: "2026-11-04" },
        { key: "open ai", amount_cents: 9599, date: "2026-09-25" },
        { key: "", amount_cents: 100, date: "2026-11-01" },
      ],
      ["claude", "tim"],
    );
    expect(result).toEqual([
      { key: "vivo", name: "Vivo", amountCents: 3500, lastDate: "2026-11-10", count: 2 },
      { key: "open ai", name: "Open Ai", amountCents: 9599, lastDate: "2026-09-25", count: 1 },
    ]);
  });
});
