import { z } from "zod";

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  }, "Use HTTPS ou HTTP local."),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const optionalSecret = z.string().min(1).optional();

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  PLUGGY_CLIENT_ID: optionalSecret,
  PLUGGY_CLIENT_SECRET: optionalSecret,
  PLUGGY_WEBHOOK_SECRET: z.string().min(24).optional(),
  PLUGGY_INCLUDE_SANDBOX: z.enum(["true", "false"]).optional(),
  AI_PROVIDER: optionalSecret,
  AI_MODEL: optionalSecret,
  AI_API_KEY: optionalSecret,
  BOT_API_URL: z.url().optional(),
  INTERNAL_API_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(24).optional(),
  APP_URL: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parsePublicEnv(input: Record<string, unknown>) {
  const parsed = publicEnvSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Configuração pública inválida: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function parseServerEnv(input: Record<string, unknown>) {
  const parsed = serverEnvSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Configuração do servidor inválida: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function getPublicEnv() {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
