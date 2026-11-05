import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { requireServerEnv } from "@/lib/env.server";

const MAX_SKEW_MS = 5 * 60 * 1000;
const MAX_BODY = 16 * 1024;
const seen = new Map<string, number>();

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export class UnauthorizedError extends Error {}

/**
 * Verifies a bot request: X-Prumo-Timestamp (ms) and X-Prumo-Signature = HMAC-SHA256(secret, `${ts}.${body}`).
 * Rejects stale or replayed signatures. Returns the parsed JSON body.
 */
export async function verifyBotRequest(request: Request): Promise<unknown> {
  const secret = requireServerEnv("INTERNAL_API_SECRET");
  const timestamp = request.headers.get("x-prumo-timestamp") ?? "";
  const signature = request.headers.get("x-prumo-signature") ?? "";
  const body = await request.text();
  if (body.length > MAX_BODY) throw new UnauthorizedError("Corpo grande demais");
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) throw new UnauthorizedError("Requisição expirada");
  if (!safeEqual(hmacHex(secret, `${timestamp}.${body}`), signature)) throw new UnauthorizedError("Assinatura inválida");

  const now = Date.now();
  for (const [key, at] of seen) if (now - at > MAX_SKEW_MS) seen.delete(key);
  if (seen.has(signature)) throw new UnauthorizedError("Requisição repetida");
  seen.set(signature, now);

  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new UnauthorizedError("JSON inválido");
  }
}

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Small fixed-window limiter. Per instance only; the database constraints remain the real guard. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}
