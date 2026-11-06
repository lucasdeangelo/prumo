import { NextResponse, type NextRequest } from "next/server";

import { publicOrigin } from "@/lib/request-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const base = publicOrigin(request);
  const origin = request.headers.get("origin");
  if (origin && origin !== base) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", base), { status: 303 });
}
