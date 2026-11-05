import { NextResponse } from "next/server";
import { z } from "zod";

import { enqueueDueNotifications, ackNotification, claimWhatsappNotifications } from "@/lib/application/notifications";
import { DomainError } from "@/lib/application/transactions";
import { AI_SYSTEM_PROMPT, execute, interpret, normalizePhone, redeemLinkCode, userForPhone } from "@/lib/application/whatsapp";
import { parseMessage } from "@/lib/domain/whatsapp-intent";
import { todayIn } from "@/lib/domain/dates";
import { ConfigurationError } from "@/lib/env.server";
import { rateLimit, UnauthorizedError, verifyBotRequest } from "@/lib/internal/auth";

export const dynamic = "force-dynamic";

const draftSchema = z.object({
  type: z.enum(["credit", "debit"]),
  amountCents: z.number().int().positive().max(10_000_000_000),
  description: z.string().trim().min(1).max(140),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tagHint: z.string().max(40).nullable(),
});

const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("transaction"), draft: draftSchema, tagId: z.uuid().nullable() }),
  z.object({ kind: z.literal("pay_bill"), billId: z.uuid() }),
]);

const bodySchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("message"),
    phone: z.string().min(8).max(40),
    chatId: z.string().regex(/^[0-9]{6,20}@(c\.us|lid)$/).optional(),
    text: z.string().max(1000),
    aiOutput: z.unknown().optional(),
  }),
  z.object({ op: z.literal("execute"), phone: z.string().min(8).max(40), messageId: z.string().min(4).max(200), action: actionSchema }),
  z.object({ op: z.literal("outbox.claim"), limit: z.number().int().min(1).max(50).default(10) }),
  z.object({ op: z.literal("outbox.ack"), id: z.uuid(), ok: z.boolean(), error: z.string().max(300).optional() }),
]);

let lastEnqueue = 0;

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await verifyBotRequest(request));
    if (!parsed.success) {
      // Field paths only (no values), so the bot log says what is wrong without leaking data.
      const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(corpo)"))].join(", ");
      return NextResponse.json({ error: `Requisição inválida: ${fields}` }, { status: 400 });
    }
    const body = parsed.data;

    if (body.op === "outbox.claim") {
      // Enqueuing is idempotent (dedupe keys); throttling only saves queries.
      if (Date.now() - lastEnqueue > 60_000) {
        lastEnqueue = Date.now();
        await enqueueDueNotifications();
      }
      return NextResponse.json({ messages: await claimWhatsappNotifications(body.limit) });
    }
    if (body.op === "outbox.ack") {
      await ackNotification(body.id, body.ok, body.error);
      return NextResponse.json({ ok: true });
    }

    const phone = normalizePhone(body.phone);
    if (!phone) return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
    if (!rateLimit(`wa:${phone}`, 30, 60_000)) {
      return NextResponse.json({ kind: "reply", text: "⏳ Muitas mensagens seguidas. Aguarde um minuto." });
    }

    if (body.op === "message") {
      const intent = parseMessage(body.text, todayIn());
      if (intent.kind === "link") {
        if (!rateLimit(`wa-link:${phone}`, 5, 15 * 60_000)) {
          return NextResponse.json({ kind: "reply", text: "⏳ Muitas tentativas. Tente de novo em 15 minutos." });
        }
        const result = await redeemLinkCode(phone, intent.code, body.chatId);
        return NextResponse.json({ kind: "reply", text: result.text });
      }
      const userId = await userForPhone(phone, body.chatId);
      if (!userId) {
        return NextResponse.json({
          kind: "reply",
          text: "👋 Olá! Este número ainda não está vinculado ao Prumo.\nNo app, abra *Ajustes → WhatsApp*, gere um código e envie aqui: *vincular CÓDIGO*.",
        });
      }
      const result = await interpret(userId, body.text, body.aiOutput);
      if (result.kind === "needs_ai") return NextResponse.json({ kind: "needs_ai", systemPrompt: AI_SYSTEM_PROMPT });
      return NextResponse.json(result);
    }

    const userId = await userForPhone(phone);
    if (!userId) return NextResponse.json({ kind: "reply", text: "Este número não está vinculado." });
    return NextResponse.json({ kind: "reply", text: await execute(userId, body.action, body.messageId) });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (error instanceof ConfigurationError) return NextResponse.json({ error: "Servidor não configurado" }, { status: 503 });
    if (error instanceof DomainError) return NextResponse.json({ kind: "reply", text: `❌ ${error.message}` });
    console.error("whatsapp bridge error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
