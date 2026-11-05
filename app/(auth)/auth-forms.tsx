"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";

import { forgotPasswordAction, resetPasswordAction, signInAction, signUpAction, type AuthState } from "./actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(signInAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="E-mail"><Input type="email" name="email" autoComplete="email" required /></Field>
      <Field label="Senha"><Input type="password" name="password" autoComplete="current-password" required /></Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Entrando…">Entrar</SubmitButton>
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">Esqueci a senha</Link>
        <Link href="/signup" className="font-medium text-primary">Criar conta</Link>
      </div>
    </form>
  );
}

export function SignUpForm({ invite }: { invite?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(signUpAction, undefined);
  const [showInvite, setShowInvite] = useState(Boolean(invite));
  return (
    <form action={action} className="grid gap-4">
      <Field label="Nome"><Input name="name" autoComplete="given-name" required maxLength={80} /></Field>
      <Field label="E-mail"><Input type="email" name="email" autoComplete="email" required /></Field>
      <Field label="Senha" hint="Mínimo de 8 caracteres"><Input type="password" name="password" autoComplete="new-password" minLength={8} required /></Field>
      {showInvite ? (
        <Field label="Código do convite" hint="Você entra na casa do seu par no primeiro acesso.">
          <Input name="invite" defaultValue={invite} placeholder="ABCD-1234" autoCapitalize="characters" autoComplete="off" />
        </Field>
      ) : null}
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Criando…">Criar conta</SubmitButton>
      {!showInvite ? (
        <button type="button" onClick={() => setShowInvite(true)} className="min-h-11 text-sm font-medium text-primary">Recebi um convite do meu par</button>
      ) : null}
      <p className="text-center text-sm text-muted-foreground">Já tem conta? <Link href="/login" className="font-medium text-primary">Entrar</Link></p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState<AuthState, FormData>(forgotPasswordAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <Field label="E-mail"><Input type="email" name="email" autoComplete="email" required /></Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Enviando…">Enviar link</SubmitButton>
      <Link href="/login" className="text-center text-sm text-muted-foreground">Voltar para entrar</Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState<AuthState, FormData>(resetPasswordAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Nova senha"><Input type="password" name="password" autoComplete="new-password" minLength={8} required /></Field>
      <Field label="Repita a senha"><Input type="password" name="confirm" autoComplete="new-password" minLength={8} required /></Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Salvar senha</SubmitButton>
    </form>
  );
}
