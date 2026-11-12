import { router } from "expo-router";
import { useState } from "react";

import { config } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { AuthFrame } from "@/ui/auth";
import { Button, Field, FormMessage, Input, TextLink } from "@/ui/kit";
import { colors } from "@/ui/theme";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<{ error?: string; ok?: string }>();

  async function submit() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setState({ error: "E-mail inválido" });
    setPending(true);
    // The link opens the web app, where the new password is saved.
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${config.apiUrl}/auth/confirm?next=/reset-password` });
    setPending(false);
    setState({ ok: "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha." });
  }

  return (
    <AuthFrame title="Recuperar senha" subtitle="Enviaremos um link para criar uma nova senha.">
      <Field label="E-mail"><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" /></Field>
      <FormMessage state={state} />
      <Button onPress={submit} pending={pending} pendingText="Enviando…">Enviar link</Button>
      <TextLink onPress={() => (router.canGoBack() ? router.back() : router.replace("/login"))} color={colors.mutedForeground}>Voltar para entrar</TextLink>
    </AuthFrame>
  );
}
