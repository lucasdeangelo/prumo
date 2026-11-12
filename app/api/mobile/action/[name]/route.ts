import { NextResponse } from "next/server";

import { MOBILE_ACTIONS } from "@/lib/mobile/actions";
import { capture, failure, respond, toFormData } from "@/lib/mobile/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/action/<name> with { fields?: {...}, args?: [...] }.
 * Runs the same server action the web form posts to, as the bearer token's user.
 * Answers with { result } or, when the action would navigate, { redirect }.
 */
export async function POST(request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const entry = Object.hasOwn(MOBILE_ACTIONS, name) ? MOBILE_ACTIONS[name as keyof typeof MOBILE_ACTIONS] : null;
  if (!entry) return NextResponse.json({ error: "Ação desconhecida" }, { status: 404 });
  if (!request.headers.get("authorization")) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let body: { fields?: unknown; args?: unknown[] } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Actions without input send no body.
  }
  try {
    const outcome = await capture(() => entry(toFormData(body.fields), Array.isArray(body.args) ? body.args : []));
    return respond(outcome, (result) => ({ result: result ?? null }));
  } catch (error) {
    return failure(error);
  }
}
