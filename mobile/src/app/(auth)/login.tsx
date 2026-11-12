import { useState } from "react";
import { View } from "react-native";

import { supabase } from "@/lib/supabase";
import { AuthFrame } from "@/ui/auth";
import { Button, Field, FormMessage, Input, Row, TextLink } from "@/ui/kit";
import { colors } from "@/ui/theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit() {
    setError(undefined);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("E-mail inválido");
    if (!password) return setError("Informe a senha");
    setPending(true);
    const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setPending(false);
    // On success the session listener opens Início.
    if (failure) setError(failure.code === "email_not_confirmed" ? "Confirme seu e-mail antes de entrar." : "E-mail ou senha incorretos.");
  }

  return (
    <AuthFrame title="Entrar" subtitle="Acompanhe suas entradas e saídas.">
      <Field label="E-mail"><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" returnKeyType="next" /></Field>
      <Field label="Senha"><Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} /></Field>
      <FormMessage state={error ? { error } : undefined} />
      <Button onPress={submit} pending={pending} pendingText="Entrando…">Entrar</Button>
      <Row style={{ justifyContent: "space-between" }}>
        <TextLink href="/forgot-password" color={colors.mutedForeground}>Esqueci a senha</TextLink>
        <TextLink href="/signup">Criar conta</TextLink>
      </Row>
      <View />
    </AuthFrame>
  );
}
