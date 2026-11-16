"use client";

import { useActionState } from "react";

import { recordMovementAction, type ManualState } from "@/app/(app)/investments/manual-actions";
import { Field, Input, SubmitButton } from "@/components/ui/form";

export type MovementKind = "aporte" | "resgate" | "compra" | "venda" | "cotacao" | "valor";

const SUBMIT: Record<MovementKind, string> = {
  aporte: "Registrar aporte",
  resgate: "Registrar resgate",
  compra: "Registrar compra",
  venda: "Registrar venda",
  cotacao: "Atualizar cotação",
  valor: "Atualizar valor",
};

/** One movement on an asset typed by hand. The Prumo only records it: no money moves. */
export function MovementForm({ investmentId, kind, today, currentPrice, currentAmount }: { investmentId: string; kind: MovementKind; today: string; currentPrice: string; currentAmount: string }) {
  const [state, action] = useActionState<ManualState, FormData>(recordMovementAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={investmentId} />
      <input type="hidden" name="kind" value={kind} />
      {kind === "aporte" || kind === "resgate" ? (
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Valor"><Input name="amount" inputMode="decimal" required placeholder="1.000,00" /></Field>
          <Field label="Data"><Input type="date" name="date" required max={today} defaultValue={today} /></Field>
        </div>
      ) : kind === "compra" || kind === "venda" ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Quantidade"><Input name="quantity" inputMode="decimal" required placeholder="10" /></Field>
            <Field label="Preço (cada)"><Input name="price" inputMode="decimal" required defaultValue={currentPrice} /></Field>
          </div>
          <Field label="Data"><Input type="date" name="date" required max={today} defaultValue={today} /></Field>
        </>
      ) : kind === "cotacao" ? (
        <Field label="Cotação de hoje (cada)"><Input name="price" inputMode="decimal" required defaultValue={currentPrice} /></Field>
      ) : (
        <Field label="Valor atual do investimento"><Input name="amount" inputMode="decimal" required defaultValue={currentAmount} /></Field>
      )}
      {state?.error ? <p role="alert" className="rounded-[10px] bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      <SubmitButton className="w-full">{SUBMIT[kind]}</SubmitButton>
      <p className="text-center text-[13px] text-muted-foreground">O Prumo só registra: nada é movido no banco ou na corretora.</p>
    </form>
  );
}
