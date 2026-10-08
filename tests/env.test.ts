import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "../lib/env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
};

describe("environment validation", () => {
  it("accepts a public HTTPS Supabase configuration", () => {
    expect(parsePublicEnv(valid)).toEqual(valid);
  });

  it("rejects missing keys and insecure remote URLs", () => {
    expect(() => parsePublicEnv({})).toThrow("Configuração pública inválida");
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "http://example.com" })).toThrow();
    expect(parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }).NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
  });

  it("keeps server secrets out of public parsed output", () => {
    const input = { ...valid, SUPABASE_SERVICE_ROLE_KEY: "private" };
    expect(parsePublicEnv(input)).toEqual(valid);
    expect(parseServerEnv(input).SUPABASE_SERVICE_ROLE_KEY).toBe("private");
  });
});
