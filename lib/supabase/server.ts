import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

import { getServerEnv } from "@/lib/env.server";

/**
 * The mobile app signs in with Supabase on the device and sends its access token as
 * `Authorization: Bearer <jwt>`. Browsers never send this header on their own, so the web keeps
 * using cookies. The token is verified in getSessionUser like a cookie session.
 */
export async function bearerToken(): Promise<string | null> {
  const value = (await headers()).get("authorization");
  const match = value?.match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
  return match ? match[1] : null;
}

export async function createServerSupabaseClient() {
  const env = getServerEnv();
  const token = await bearerToken();
  if (token) {
    // Same RLS as the cookie client: every query runs as the token's user.
    return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }) as unknown as ReturnType<typeof createServerClient>;
  }

  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session on every request.
        }
      },
    },
  });
}
