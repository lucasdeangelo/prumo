import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null; name: string | null };

/** Verified identity for this request, or null. Uses JWT claim verification, never the raw cookie. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name: typeof meta.display_name === "string" ? meta.display_name : null,
  };
});

/** Ensures profile and default tags exist once per request. Idempotent in the database. */
const ensureOnboarded = cache(async (user: SessionUser) => {
  const { error } = await createAdminClient().rpc("ensure_profile", { p_user: user.id, p_display_name: user.name });
  if (error) throw new Error(`Falha ao preparar o perfil: ${error.message}`);
});

/** For private pages and server actions: the verified user plus an RLS-scoped client for reads. */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await ensureOnboarded(user);
  const db = await createServerSupabaseClient();
  return { user, db };
}
