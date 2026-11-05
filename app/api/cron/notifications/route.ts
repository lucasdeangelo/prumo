import { NextResponse } from "next/server";

import { enqueueDueNotifications } from "@/lib/application/notifications";
import { getServerEnv } from "@/lib/env.server";
import { safeEqual } from "@/lib/internal/auth";

export const dynamic = "force-dynamic";

/** Daily safety net for reminders (e.g. Vercel Cron). Idempotent: dedupe keys prevent duplicates. */
export async function GET(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  return NextResponse.json(await enqueueDueNotifications());
}
