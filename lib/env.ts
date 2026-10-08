import { z } from "zod";

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  }, "Use HTTPS ou HTTP local."),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  PLUGGY_CLIENT_ID: z.string().min(1).optional(),
  PLUGGY_CLIENT_SECRET: z.string().min(1).optional(),
  AI_PROVIDER: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  AI_API_KEY: z.string().min(1).optional(),
  BOT_API_URL: z.url().optional(),
  INTERNAL_API_SECRET: z.string().min(1).optional(),
  APP_URL: z.url().optional(),
});

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
