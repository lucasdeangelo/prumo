import { createHash } from "node:crypto";

import { after, NextResponse } from "next/server";
import { z } from "zod";

import { syncFromWebhook } from "@/lib/application/pluggy-sync";
import { getServerEnv } from "@/lib/env.server";
import { safeEqual } from "@/lib/internal/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  event: z.string().min(1).max(100),
  eventId: z.string().min(1).max(200).optional(),
  itemId: z.string().min(1).max(200).optional(),
  clientId: z.string().optional(),
});

const SYNC_EVENTS = new Set(["item/created", "item/updated", "item/login_succeeded", "transactions/created", "transactions/updated", "transactions/deleted", "item/error"]);

/**
 * Pluggy does not sign webhooks. The webhook is registered through POST /webhooks with a custom
 * `x-prumo-webhook-secret` header (see scripts/pluggy-webhook.mjs); requests without it get 401.
 * The payload is only a signal: data is re-read from the API with our key.
 */
export async function POST(request: Request) {
  const env = getServerEnv();
  const secret = env.PLUGGY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook não configurado" }, { status: 503 });
  if (!safeEqual(request.headers.get("x-prumo-webhook-secret") ?? "", secret)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > 64 * 1024) return NextResponse.json({ error: "Grande demais" }, { status: 413 });
  let parsed;
  try {
    parsed = eventSchema.safeParse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
  const event = parsed.data;
  if (env.PLUGGY_CLIENT_ID && event.clientId && event.clientId !== env.PLUGGY_CLIENT_ID) {
    return NextResponse.json({ error: "Aplicação diferente" }, { status: 403 });
  }

  const admin = createAdminClient();
  const payloadHash = createHash("sha256").update(raw).digest("hex");
  const { data: stored, error } = await admin
    .from("webhook_events")
    .insert({
      provider: "pluggy",
      external_event_id: event.eventId ?? null,
      dedupe_key: event.eventId ? null : payloadHash,
      event_type: event.event,
      payload_hash: payloadHash,
      status: "received",
    })
    .select("id")
    .single();
  if (error?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  if (error) return NextResponse.json({ error: "Falha ao registrar" }, { status: 500 });

  const itemId = event.itemId;
  if (itemId && SYNC_EVENTS.has(event.event)) {
    // Respond within Pluggy's 10 s budget; sync afterwards.
    after(async () => {
      await admin.from("webhook_events").update({ status: "processing", attempts: 1 }).eq("id", stored.id);
      try {
        await syncFromWebhook(itemId);
        await admin.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", stored.id);
      } catch (syncError) {
        console.error("pluggy webhook sync failed", syncError instanceof Error ? syncError.message : syncError);
        await admin.from("webhook_events").update({ status: "failed" }).eq("id", stored.id);
      }
    });
  } else {
    await admin.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", stored.id);
  }
  return NextResponse.json({ ok: true });
}
