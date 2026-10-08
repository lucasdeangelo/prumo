import "server-only";

import { parseServerEnv } from "@/lib/env";

export function getServerEnv() {
  return parseServerEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    PLUGGY_CLIENT_ID: process.env.PLUGGY_CLIENT_ID,
    PLUGGY_CLIENT_SECRET: process.env.PLUGGY_CLIENT_SECRET,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_MODEL: process.env.AI_MODEL,
    AI_API_KEY: process.env.AI_API_KEY,
    BOT_API_URL: process.env.BOT_API_URL,
    INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
    APP_URL: process.env.APP_URL,
  });
}
