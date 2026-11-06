import { describe, expect, it } from "vitest";

import { connectionState } from "../lib/application/connections";

const now = new Date("2026-11-05T12:00:00Z");
const base = { status: "UPDATED", errorCode: null, consentExpiresAt: "2027-11-05T00:00:00Z", lastSuccessAt: "2026-11-05T06:12:00Z", lastAttemptAt: "2026-11-05T06:12:00Z" };

describe("connection state", () => {
  it("is ok when the last attempt succeeded", () => {
    expect(connectionState(base, now)).toBe("ok");
  });

  it("is expired when consent is over or revoked", () => {
    expect(connectionState({ ...base, consentExpiresAt: "2026-11-01T00:00:00Z" }, now)).toBe("expired");
    expect(connectionState({ ...base, status: "LOGIN_ERROR" }, now)).toBe("expired");
    expect(connectionState({ ...base, errorCode: "USER_AUTHORIZATION_REVOKED" }, now)).toBe("expired");
  });

  it("is ok while today's update has not happened yet", () => {
    // Prumo pulled at 06:13, MeuPluggy refreshes at 06:12 but had not finished: data from yesterday.
    expect(connectionState({ ...base, lastSuccessAt: "2026-11-04T06:12:00Z", lastAttemptAt: "2026-11-05T06:13:00Z" }, now)).toBe("ok");
  });

  it("is failed when today's update did not work", () => {
    expect(connectionState({ ...base, status: "OUTDATED" }, now)).toBe("failed");
    expect(connectionState({ ...base, lastSuccessAt: "2026-11-03T22:00:00Z" }, now)).toBe("failed");
    expect(connectionState({ ...base, errorCode: "SITE_NOT_AVAILABLE" }, now)).toBe("failed");
  });
});
