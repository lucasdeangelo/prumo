import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { config } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { AuthFrame } from "@/ui/auth";
import { Button, Field, FormMessage, Input, Row, TextLink, Txt } from "@/ui/kit";
import { colors } from "@/ui/theme";

export default function SignUp() {
  const { convite } = useLocalSearchParams<{ convite?: string }>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState(convite?.slice(0, 12) ?? "");
  const [showInvite, setShowInvite] = useState(Boolean(convite));
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<{ error?: string; ok?: string }>();

  async function submit() {
    setState(undefined);
    if (!name.trim()) return setState({ error: "Informe seu nome" });
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setState({ error: "E-mail inválido" });
    if (password.length < 8) return setState({ error: "A senha precisa de ao menos 8 caracteres" });
    setPending(true);
    const code = invite.trim().slice(0, 12).toUpperCase();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // The partner's invite code rides along; the first request joins the household (lib/auth/session.ts).
      options: { data: { display_name: name.trim().slice(0, 80), ...(code ? { invite_code: code } : {}) }, emailRedirectTo: `${config.apiUrl}/auth/confirm?next=/overview` },
    });
    setPending(false);
    if (error) return setState({ error: error.code === "weak_password" ? "Senha fraca. Use letras e números." : "Não foi possível criar a conta." });
    // Same message whether or not the e-mail exists, to avoid account enumeration.
    if (!data.session) setState({ ok: "Enviamos um link de confirmação para o seu e-mail." });
  }

  return (
    <AuthFrame title="Criar conta" subtitle="Leva menos de um minuto.">
      <Field label="Nome"><Input value={name} onChangeText={setName} autoComplete="given-name" maxLength={80} /></Field>
      <Field label="E-mail"><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" /></Field>
      <Field label="Senha" hint="Mínimo de 8 caracteres"><Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" /></Field>
      {showInvite ? (
        <Field label="Código do convite" hint="Você entra na casa do seu par no primeiro acesso.">
          <Input value={invite} onChangeText={setInvite} placeholder="ABCD-1234" autoCapitalize="characters" autoCorrect={false} />
        </Field>
      ) : null}
      <FormMessage state={state} />
      <Button onPress={submit} pending={pending} pendingText="Criando…">Criar conta</Button>
      {!showInvite ? <TextLink onPress={() => setShowInvite(true)}>Recebi um convite do meu par</TextLink> : null}
      <Row gap={4} style={{ justifyContent: "center" }}>
        <Txt size={14} color={colors.mutedForeground}>Já tem conta?</Txt>
        <TextLink href="/login">Entrar</TextLink>
      </Row>
    </AuthFrame>
  );
}
