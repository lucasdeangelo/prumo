"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; ok?: string } | undefined;

const email = z.email("E-mail inválido").max(200);
const password = z.string().min(8, "A senha precisa de ao menos 8 caracteres").max(72);

async function origin() {
  const h = await headers();
  return process.env.APP_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** Only same-site relative paths are accepted as post-login destinations. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/overview";
}

export async function signInAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Informe a senha") }).safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.code === "email_not_confirmed" ? "Confirme seu e-mail antes de entrar." : "E-mail ou senha incorretos." };
  redirect(safeNext(formData.get("next")));
}

export async function signUpAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ name: z.string().trim().min(1, "Informe seu nome").max(80), email, password })
    .safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.name }, emailRedirectTo: `${await origin()}/auth/confirm?next=/overview` },
  });
  if (error) return { error: error.code === "weak_password" ? "Senha fraca. Use letras e números." : "Não foi possível criar a conta." };
  if (data.session) redirect("/overview");
  // Same message whether or not the e-mail exists, to avoid account enumeration.
  return { ok: "Enviamos um link de confirmação para o seu e-mail." };
}

export async function forgotPasswordAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "E-mail inválido" };
  const supabase = await createServerSupabaseClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${await origin()}/auth/confirm?next=/reset-password` });
  return { ok: "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha." };
}

export async function resetPasswordAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = password.safeParse(formData.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (formData.get("password") !== formData.get("confirm")) return { error: "As senhas não conferem." };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "Não foi possível alterar a senha. Peça um novo link." };
  redirect("/overview");
}
