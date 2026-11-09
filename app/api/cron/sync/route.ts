import { NextResponse } from "next/server";

import { syncStaleItems } from "@/lib/application/pluggy-sync";
import { getServerEnv } from "@/lib/env.server";
import { safeEqual } from "@/lib/internal/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Imports connections with newer data at Pluggy (tasks container, every 15 min). */
export async function GET(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!process.env.PLUGGY_CLIENT_ID || !process.env.PLUGGY_CLIENT_SECRET) return NextResponse.json({ skipped: "pluggy não configurado" });
  return NextResponse.json(await syncStaleItems());
}
