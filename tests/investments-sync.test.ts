import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the few PostgREST calls the investment sync makes.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let nextId = 0;

const DEFAULTS: Record<string, () => Row> = {
  investments: () => ({ id: `local-${++nextId}`, include: true, scope: "mine", visibility: "totals", deleted_at: null, invested_cents: null }),
  investment_movements: () => ({ id: `mov-${++nextId}` }),
  investment_snapshots: () => ({}),
};

class Query implements PromiseLike<{ data: Row[] | null; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private op: "select" | "update" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private conflict: string[] = [];

  constructor(private table: string) {
    tables[table] ??= [];
  }
  select() {
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  neq(col: string, value: unknown) {
    this.filters.push((r) => r[col] !== value);
    return this;
  }
  is(col: string, value: null) {
    this.filters.push((r) => (r[col] ?? null) === value);
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  upsert(rows: Row[], options: { onConflict: string }) {
    this.op = "upsert";
    this.payload = rows;
    this.conflict = options.onConflict.split(",");
    return this;
  }
  private run(): Row[] {
    const rows = tables[this.table];
    if (this.op === "update") {
      const hit = rows.filter((r) => this.filters.every((f) => f(r)));
      for (const r of hit) Object.assign(r, this.payload);
      return hit;
    }
    if (this.op === "upsert") {
      return (this.payload as Row[]).map((incoming) => {
        const found = rows.find((r) => this.conflict.every((c) => r[c] === incoming[c]));
        if (found) return Object.assign(found, incoming);
        const created = { ...DEFAULTS[this.table](), ...incoming };
        rows.push(created);
        return created;
      });
    }
    return rows.filter((r) => this.filters.every((f) => f(r)));
  }
  then<A, B>(resolve?: ((v: { data: Row[] | null; error: null }) => A | PromiseLike<A>) | null, reject?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve({ data: this.run().map((r) => ({ ...r })), error: null }).then(resolve, reject);
  }
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => new Query(table) }) }));

const provider = vi.hoisted(() => ({ investments: [] as unknown[], transactions: {} as Record<string, unknown[]>, failWith: null as number | null }));
vi.mock("@/lib/integrations/pluggy", () => {
  class PluggyError extends Error {
    constructor(message: string, public readonly status?: number) {
      super(message);
    }
  }
  return {
    PluggyError,
    listInvestments: async () => {
      if (provider.failWith) throw new PluggyError("no product", provider.failWith);
      return provider.investments;
    },
    listInvestmentTransactions: async (id: string) => provider.transactions[id] ?? [],
  };
});

const { syncInvestments } = await import("../lib/application/investments-sync");

const USER = "user-a";
const ITEM = "item-row-1";
const cdb = { id: "p-cdb", type: "FIXED_INCOME", subtype: "CDB", name: "CDB Inter Liquidez", issuer: "Inter", amount: 12000, balance: 12000, amountOriginal: 11420, taxes: 0, date: "2026-11-13T00:00:00.000Z", status: "ACTIVE" };
const stock = { id: "p-wege", type: "EQUITY", subtype: "STOCK", name: "WEGE3", amount: 2341.2, quantity: 60, value: 39.02, amountOriginal: null, date: "2026-11-13T00:00:00.000Z", status: "ACTIVE" };

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  provider.investments = [cdb, stock];
  provider.transactions = {
    "p-wege": [
      { id: "t1", type: "BUY", date: "2026-01-10T00:00:00.000Z", amount: 2400, quantity: 60 },
      { id: "t2", type: "BUY", date: "2026-03-10T00:00:00.000Z", amount: 1800, quantity: 40 },
      { id: "t3", type: "SELL", date: "2026-05-10T00:00:00.000Z", amount: 2000, quantity: 40 },
      { id: "t4", type: "INTEREST", date: "2026-08-15T00:00:00.000Z", amount: 18.6 },
    ],
  };
  provider.failWith = null;
});

const count = (table: string) => (tables[table] ?? []).length;

describe("investment sync", () => {
  it("converges on replay: same rows, one value per asset and day", async () => {
    const first = await syncInvestments(USER, ITEM, "pluggy-item");
    const snapshot = JSON.stringify(tables);
    const second = await syncInvestments(USER, ITEM, "pluggy-item");
    expect(first).toEqual({ available: true, investments: 2, movements: 4 });
    expect(second.investments).toBe(2);
    expect(count("investments")).toBe(2);
    expect(count("investment_movements")).toBe(4);
    expect(count("investment_snapshots")).toBe(2);
    expect(JSON.stringify(tables).replace(/"synced_at":"[^"]+"/g, "")).toBe(snapshot.replace(/"synced_at":"[^"]+"/g, ""));
  });

  it("computes the cost basis from movements when the bank does not send it", async () => {
    await syncInvestments(USER, ITEM, "pluggy-item");
    const wege = tables.investments.find((r) => r.provider_investment_id === "p-wege")!;
    expect(wege.invested_cents).toBe(252000);
    const snap = tables.investment_snapshots.find((r) => r.investment_id === wege.id)!;
    expect(snap).toMatchObject({ on_date: "2026-11-13", amount_cents: 234120, invested_cents: 252000 });
  });

  it("never overwrites what the person chose", async () => {
    await syncInvestments(USER, ITEM, "pluggy-item");
    const row = tables.investments.find((r) => r.provider_investment_id === "p-cdb")!;
    Object.assign(row, { visibility: "private", scope: "ours" });
    await syncInvestments(USER, ITEM, "pluggy-item");
    expect(tables.investments.find((r) => r.provider_investment_id === "p-cdb")).toMatchObject({ visibility: "private", scope: "ours" });
  });

  it("marks an asset gone from the bank as withdrawn and keeps it", async () => {
    await syncInvestments(USER, ITEM, "pluggy-item");
    provider.investments = [stock];
    await syncInvestments(USER, ITEM, "pluggy-item");
    expect(count("investments")).toBe(2);
    expect(tables.investments.find((r) => r.provider_investment_id === "p-cdb")!.status).toBe("withdrawn");
  });

  it("does not bring the same asset twice from a second connection of the same bank", async () => {
    await syncInvestments(USER, ITEM, "pluggy-item");
    provider.investments = [{ ...cdb, id: "p-cdb-2" }];
    provider.transactions = {};
    await syncInvestments(USER, "item-row-2", "pluggy-item-2");
    expect(tables.investments.find((r) => r.provider_investment_id === "p-cdb-2")!.include).toBe(false);
  });

  it("reports an item without the investments product as unavailable", async () => {
    provider.failWith = 403;
    expect(await syncInvestments(USER, ITEM, "pluggy-item")).toEqual({ available: false, investments: 0, movements: 0 });
    expect(count("investments")).toBe(0);
  });
});
