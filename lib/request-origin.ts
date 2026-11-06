import type { NextRequest } from "next/server";

/**
 * The address the browser used. Behind nginx or the tunnel, nextUrl is the
 * internal one (http://…:3000), so the forwarded host and protocol win.
 */
export function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host.split(",")[0].trim()}`;
}
