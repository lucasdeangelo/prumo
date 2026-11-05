import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rateLimit, UnauthorizedError, verifyBotRequest } from "../lib/internal/auth";

const require = createRequire(import.meta.url);
const SECRET = "a".repeat(64);

// Capture the exact request the real bot client would send.
async function botRequest(secret = SECRET): Promise<Request> {
  const { createApi } = require("../bot/lib/api.js") as { createApi: (o: { baseUrl: string; secret: string }) => { claim: () => Promise<unknown> } };
  let captured: Request | undefined;
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    captured = new Request(url, init);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    await createApi({ baseUrl: "http://app.test", secret }).claim();
  } finally {
    globalThis.fetch = original;
  }
  return captured!;
}

describe("bot request signing", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_example";
    process.env.INTERNAL_API_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.INTERNAL_API_SECRET;
  });

  it("accepts a request signed by the bot client and rejects its replay", async () => {
    const request = await botRequest();
    const replay = request.clone();
    await expect(verifyBotRequest(request)).resolves.toEqual({ op: "outbox.claim", limit: 10 });
    await expect(verifyBotRequest(replay)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a wrong secret, a tampered body and a stale timestamp", async () => {
    await expect(verifyBotRequest(await botRequest("b".repeat(64)))).rejects.toBeInstanceOf(UnauthorizedError);

    const good = await botRequest();
    const tampered = new Request(good.url, { method: "POST", headers: good.headers, body: JSON.stringify({ op: "outbox.claim", limit: 50 }) });
    await expect(verifyBotRequest(tampered)).rejects.toBeInstanceOf(UnauthorizedError);

    const stale = new Request("http://app.test", { method: "POST", headers: { "x-prumo-timestamp": String(Date.now() - 10 * 60_000), "x-prumo-signature": "00" }, body: "{}" });
    await expect(verifyBotRequest(stale)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("limits bursts per key", () => {
    const key = `test-${Math.random()}`;
    expect([1, 2, 3].map(() => rateLimit(key, 2, 60_000))).toEqual([true, true, false]);
  });
});
