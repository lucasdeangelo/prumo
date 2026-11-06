import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness for the container healthcheck. Touches nothing outside the process. */
export function GET() {
  return NextResponse.json({ ok: true });
}
