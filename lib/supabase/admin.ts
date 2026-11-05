import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv, requireServerEnv } from "@/lib/env.server";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. It bypasses RLS, so every query made with it MUST filter by a
 * user id obtained from a verified session, a verified WhatsApp link, or a provider record.
 */
export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const env = getServerEnv();
  cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}
