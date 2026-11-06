import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null; name: string | null; inviteCode: string | null };

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
    inviteCode: typeof meta.invite_code === "string" ? meta.invite_code : null,
  };
});

// People already prepared by this server process. ensure_profile is idempotent, so
// a restart only means one extra call; skipping it saves a database round trip per page.
const onboarded = new Set<string>();

/** Ensures profile and default tags exist. Idempotent in the database; runs once per person per process. */
const ensureOnboarded = cache(async (user: SessionUser) => {
  if (onboarded.has(user.id) && !user.inviteCode) return;
  const { error } = await createAdminClient().rpc("ensure_profile", { p_user: user.id, p_display_name: user.name });
  if (error) throw new Error(`Falha ao preparar o perfil: ${error.message}`);
  onboarded.add(user.id);
  // Signed up with the partner's invite: join their household once, then forget the code.
  if (user.inviteCode) {
    const { getHousehold, joinHousehold } = await import("@/lib/application/household");
    const household = await getHousehold(user.id);
    if (!household?.partner) {
      try {
        await joinHousehold(user.id, user.inviteCode);
      } catch {
        // Expired or used: the person can still join from Ajustes › Casal.
      }
      await createAdminClient().auth.admin.updateUserById(user.id, { user_metadata: { invite_code: null } });
    }
  }
});

/** For private pages and server actions: the verified user plus an RLS-scoped client for reads. */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await ensureOnboarded(user);
  const db = await createServerSupabaseClient();
  return { user, db };
}
