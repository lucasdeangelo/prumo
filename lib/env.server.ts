import "server-only";

import { parseServerEnv, type ServerEnv } from "@/lib/env";

const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PLUGGY_CLIENT_ID",
  "PLUGGY_CLIENT_SECRET",
  "PLUGGY_WEBHOOK_SECRET",
  "PLUGGY_INCLUDE_SANDBOX",
  "AI_PROVIDER",
  "AI_MODEL",
  "AI_API_KEY",
  "BOT_API_URL",
  "INTERNAL_API_SECRET",
  "CRON_SECRET",
  "APP_URL",
] as const;

export function getServerEnv(): ServerEnv {
  // Empty strings in .env files mean "not configured".
  const input = Object.fromEntries(KEYS.map((key) => [key, process.env[key] || undefined]));
  return parseServerEnv(input);
}

/** Returns a required server setting or throws a configuration error naming the variable. */
export function requireServerEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = getServerEnv()[key];
  if (value === undefined || value === null || value === "") {
    throw new ConfigurationError(key);
  }
  return value as NonNullable<ServerEnv[K]>;
}

export class ConfigurationError extends Error {
  constructor(public readonly variable: string) {
    super(`Variável de ambiente ausente: ${variable}`);
    this.name = "ConfigurationError";
  }
}
