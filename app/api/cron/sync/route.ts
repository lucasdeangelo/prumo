import { NextResponse } from "next/server";

import { revalueAllManual } from "@/lib/application/manual-investments";
import { syncStaleItems } from "@/lib/application/pluggy-sync";
import { getServerEnv } from "@/lib/env.server";
import { safeEqual } from "@/lib/internal/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Imports connections with newer data at Pluggy and values manual investments (tasks container, every 15 min). */
export async function GET(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  // Investments typed by hand earn the day's index (once a day; later runs find nothing to do).
  const manual = await revalueAllManual().catch((error: unknown) => ({ failed: error instanceof Error ? error.message : String(error) }));
  if (!process.env.PLUGGY_CLIENT_ID || !process.env.PLUGGY_CLIENT_SECRET) return NextResponse.json({ skipped: "pluggy não configurado", manual });
  return NextResponse.json({ ...(await syncStaleItems()), manual });
}
