"use client";

import { useActionState, useState } from "react";

import { createPrivacyRuleAction, surpriseAction, type ActionState } from "@/app/(app)/couple-actions";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export function SurpriseForm({ id, presets, partnerName, meName, amountText }: { id: string; presets: Array<{ value: string; label: string }>; partnerName: string; meName: string; amountText: string }) {
  const [state, action] = useActionState<ActionState, FormData>(surpriseAction, undefined);
  const [preset, setPreset] = useState(presets[0]?.value ?? "custom");
  const [hide, setHide] = useState(false);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Revelar em</legend>
        {[...presets, { value: "custom", label: "Outra data" }].map((p) => (
          <label key={p.value} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] border px-3.5", preset === p.value ? "border-foreground bg-card" : "border-border bg-card")}>
            <input type="radio" name="preset" value={p.value} checked={preset === p.value} onChange={() => setPreset(p.value)} className="size-4 accent-[var(--primary)]" />
            <span className="text-[15px]">{p.label}</span>
          </label>
        ))}
        {preset === "custom" ? <Input type="date" name="until" aria-label="Data para revelar" required /> : null}
      </fieldset>
      <div className="rounded-[10px] bg-muted p-3.5">
        <p className="label-mono">Até lá, {partnerName} vê</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[15px] font-medium">Compra reservada por {meName}</span>
          <span className="tabular text-[15px] font-medium">{hide ? "—" : `− R$ ${amountText}`}</span>
        </div>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="hideAmount" checked={hide} onChange={(e) => setHide(e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
        <span>
          <span className="block font-medium">Esconder também o valor</span>
          <span className="block text-muted-foreground">Entra só no total do mês, sem linha própria</span>
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Guardar como surpresa</SubmitButton>
    </form>
  );
}

export function PrivacyRuleForm({ tags, accounts, partnerName, defaultTagId }: { tags: Array<{ id: string; name: string }>; accounts: Array<{ id: string; name: string }>; partnerName: string; defaultTagId?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(createPrivacyRuleAction, undefined);
  const [matchType, setMatchType] = useState<"tag" | "merchant" | "account">(defaultTagId ? "tag" : "tag");
  return (
    <form action={action} className="grid gap-3">
      <Field label="Quando">
        <Select name="matchType" value={matchType} onChange={(e) => setMatchType(e.target.value as typeof matchType)}>
          <option value="tag">A categoria for…</option>
          <option value="merchant">A loja contiver…</option>
          <option value="account">A conta for…</option>
        </Select>
      </Field>
      {matchType === "tag" ? (
        <Field label="Categoria">
          <Select name="tagId" defaultValue={defaultTagId ?? ""} required>
            <option value="" disabled>Escolha…</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      ) : matchType === "merchant" ? (
        <Field label="Loja contém"><Input name="pattern" placeholder="drogaria" required maxLength={60} /></Field>
      ) : (
        <Field label="Conta">
          <Select name="accountId" defaultValue="" required>
            <option value="" disabled>Escolha…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label={`${partnerName} vê`}>
        <Select name="action" defaultValue="category_only">
          <option value="category_only">Só categoria e valor</option>
          <option value="hidden">Nada (ocultar)</option>
          <option value="ask_surprise">Perguntar se é surpresa</option>
        </Select>
      </Field>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="apply90" className="size-5 accent-[var(--primary)]" />
        Aplicar também aos últimos 90 dias
      </label>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">Criar regra</SubmitButton>
    </form>
  );
}
