"use client";

import { useActionState, useState, useTransition } from "react";

import { createInviteAction, joinHouseholdAction, updateMemberAction, type ActionState } from "@/app/(app)/couple-actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";

export function InviteButton({ appUrl }: { appUrl?: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>();
  const link = state?.code && appUrl ? `${appUrl.replace(/\/$/, "")}/signup?convite=${encodeURIComponent(state.code)}` : null;
  const share = link ? `Vem organizar nossas finanças comigo no Prumo: ${link} (código ${state!.code})` : state?.code ? `Meu código do Prumo: ${state.code}` : "";
  return (
    <div className="grid gap-3">
      {state?.code ? (
        <div className="rounded-[10px] bg-muted p-4 text-center">
          <p className="text-[13px] text-muted-foreground">Envie este código para o seu par:</p>
          <p className="tabular mt-1 select-all text-2xl font-semibold tracking-widest">{state.code}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Vale por 7 dias, uma vez só.</p>
        </div>
      ) : null}
      {share ? (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(share)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground"
        >
          Enviar pelo WhatsApp
        </a>
      ) : null}
      <Button type="button" variant={state?.code ? "outline" : "default"} disabled={pending} onClick={() => start(async () => setState(await createInviteAction()))}>
        {pending ? "Gerando…" : state?.code ? "Gerar outro código" : "Convidar meu par"}
      </Button>
      <FormMessage state={state?.error ? { error: state.error } : undefined} />
    </div>
  );
}

export function JoinForm({ defaultCode }: { defaultCode?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(joinHouseholdAction, undefined);
  return (
    <form action={action} className="grid gap-3">
      <Field label="Código do convite">
        <Input name="code" defaultValue={defaultCode} placeholder="ABCD-1234" autoCapitalize="characters" autoComplete="off" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant="outline" pendingText="Entrando…">Entrar na casa</SubmitButton>
    </form>
  );
}

export function MemberForm({ incomeText, pixKey }: { incomeText: string; pixKey: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateMemberAction, undefined);
  return (
    <form action={action} className="grid gap-3">
      <Field label="Sua renda mensal" hint="Usada só para dividir pela renda. Seu par vê a proporção, não o valor.">
        <Input name="income" inputMode="decimal" defaultValue={incomeText} placeholder="0,00" />
      </Field>
      <Field label="Sua chave Pix" hint="Para o acerto: o Prumo monta o Pix copia e cola para o seu par.">
        <Input name="pixKey" defaultValue={pixKey} placeholder="celular, e-mail, CPF ou chave aleatória" autoComplete="off" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">Salvar</SubmitButton>
    </form>
  );
}
