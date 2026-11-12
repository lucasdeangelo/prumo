import { NextResponse } from "next/server";

import { capture, failure, respond } from "@/lib/mobile/http";
import { matchScreen } from "@/lib/mobile/screens";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/screen/<web path>?<web query>, e.g. /api/mobile/screen/monthly/2026-11?tag=none.
 * Returns the data the matching web page renders, already computed, for the bearer token's user.
 */
export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!request.headers.get("authorization")) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { path } = await ctx.params;
  const match = matchScreen(path);
  if (!match) return NextResponse.json({ error: "Tela desconhecida" }, { status: 404 });
  const search = Object.fromEntries(new URL(request.url).searchParams.entries());
  try {
    return respond(await capture(() => match.load(match.params, search)));
  } catch (error) {
    return failure(error);
  }
}
