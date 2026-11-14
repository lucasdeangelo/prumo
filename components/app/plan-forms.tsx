"use client";

import { useActionState, useState } from "react";

import {
  contributeAction,
  createGoalAction,
  proposeBudgetAction,
  proposeFreeMoneyAction,
  proposeThresholdAction,
  requestApprovalAction,
  type PlanState,
} from "@/app/(app)/couple/plan-actions";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { Money } from "@/components/app/money";
import { centsToInput, parseBRL } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

// ---------- Budget setup ----------

export function BudgetSetupForm({ initial, partnerName }: { initial: Array<{ category: string; amountCents: number; averageCents: number }>; partnerName: string }) {
  const [state, action] = useActionState<PlanState, FormData>(proposeBudgetAction, undefined);
  const [rows, setRows] = useState(initial.length ? initial.map((r) => ({ ...r, value: centsToInput(r.amountCents) })) : [{ category: "", amountCents: 0, averageCents: 0, value: "" }]);
  const total = rows.reduce((s, r) => s + (parseBRL(r.value) ?? 0), 0);
  return (
    <form action={action} className="grid gap-4">
      <ul className="grid gap-3">
        {rows.map((row, i) => (
          <li key={i} className="grid gap-1.5 rounded-2xl border border-border bg-card p-4">
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <Input name="category" aria-label="Categoria" value={row.category} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, category: e.target.value } : r)))} placeholder="Categoria" />
              <Input name="amount" aria-label={`Valor para ${row.category || "a categoria"}`} inputMode="decimal" value={row.value} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} placeholder="0,00" className="tabular text-right" />
            </div>
            {row.averageCents ? <span className="text-[13px] text-muted-foreground">Média: <Money cents={row.averageCents} /></span> : null}
          </li>
        ))}
      </ul>
      <button type="button" className="min-h-11 text-left text-sm font-medium text-primary" onClick={() => setRows([...rows, { category: "", amountCents: 0, averageCents: 0, value: "" }])}>
        + Adicionar categoria
      </button>
      <div className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground">
        <span className="text-[15px] font-medium">Total do lar por mês</span>
        <span className="tabular text-lg font-medium"><Money cents={total} /></span>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Enviar para {partnerName} revisar</SubmitButton>
      <p className="text-center text-[13px] text-muted-foreground">O orçamento começa quando os dois confirmarem.</p>
    </form>
  );
}

// ---------- Combinados ----------

export function ThresholdForm({ currentText, partnerName }: { currentText: string; partnerName: string }) {
  const [state, action] = useActionState<PlanState, FormData>(proposeThresholdAction, undefined);
  return (
    <form action={action} className="grid gap-3">
      <Field label="Conversar antes de compras do Nosso acima de" hint={`Os dois confirmam. Deixe vazio para não ter limite. ${partnerName} recebe a proposta.`}>
        <Input name="amount" inputMode="decimal" defaultValue={currentText} placeholder="500,00" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">Mudar o valor</SubmitButton>
    </form>
  );
}

export function ApprovalRequestForm({ categories }: { categories: string[] }) {
  const [state, action] = useActionState<PlanState, FormData>(requestApprovalAction, undefined);
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState(1);
  const cents = parseBRL(amount) ?? 0;
  return (
    <form action={action} className="grid gap-4">
      <Field label="O que é"><Input name="title" required maxLength={80} placeholder="Sofá novo" /></Field>
      <Field label="Loja (opcional)"><Input name="merchant" maxLength={60} placeholder="Tok&Stok" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor"><Input name="amount" inputMode="decimal" required placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Parcelas">
          <Select name="installments" value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => <option key={n} value={n}>{n === 1 ? "À vista" : `${n}x`}</option>)}
          </Select>
        </Field>
      </div>
      {installments > 1 && cents > 0 ? <p className="text-[13px] text-muted-foreground">{installments}x de <Money cents={Math.round(cents / installments)} /></p> : null}
      <Field label="Categoria">
        <Select name="category" defaultValue="">
          <option value="">Sem categoria</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Por que (opcional)"><textarea name="note" maxLength={280} rows={3} className="w-full rounded-[10px] border border-border bg-card px-3.5 py-3 text-base" placeholder="Achei esse no showroom, cabe na sala…" /></Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Enviar para combinar</SubmitButton>
      <p className="text-center text-[13px] text-muted-foreground">Nada é bloqueado no banco. É só uma conversa antes.</p>
    </form>
  );
}

// ---------- Goals ----------

export function GoalForm({ meName, partnerName, incomeShare }: { meName: string; partnerName: string | null; incomeShare: number | null }) {
  const [state, action] = useActionState<PlanState, FormData>(createGoalAction, undefined);
  const [method, setMethod] = useState<"percent" | "fixed">("percent");
  const [mine, setMine] = useState("50");
  const [theirs, setTheirs] = useState("50");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const targetCents = parseBRL(target) ?? 0;
  const months = deadline ? monthsUntil(deadline) : null;
  const monthly = months && months > 0 && targetCents ? Math.ceil(targetCents / months) : null;
  const mineShare = Number(mine) / 100;

  return (
    <form action={action} className="grid gap-4">
      <Field label="Nome"><Input name="name" required maxLength={60} placeholder="Viagem de aniversário" /></Field>
      <Field label="Ícone (opcional)"><Input name="icon" maxLength={4} placeholder="✈️" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor-alvo"><Input name="target" inputMode="decimal" required placeholder="10.000,00" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        <Field label="Prazo (opcional)"><Input type="month" name="deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
      </div>
      {partnerName ? (
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium">Como cada um contribui</legend>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            {(["percent", "fixed"] as const).map((m) => (
              <label key={m} className="relative">
                <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="peer sr-only" />
                <span className="flex min-h-10 cursor-pointer items-center justify-center rounded-full text-sm font-medium text-muted-foreground peer-checked:bg-card peer-checked:font-semibold peer-checked:text-primary peer-checked:shadow-[0_1px_3px_rgba(18,21,18,0.1)]">{m === "percent" ? "Percentual" : "Valor fixo por mês"}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={meName}><Input name="mine" inputMode="decimal" value={mine} onChange={(e) => { setMine(e.target.value); if (method === "percent") setTheirs(String(Math.max(0, 100 - Number(e.target.value || 0)))); }} /></Field>
            <Field label={partnerName}><Input name="theirs" inputMode="decimal" value={theirs} onChange={(e) => setTheirs(e.target.value)} /></Field>
          </div>
          {method === "percent" && incomeShare !== null ? (
            <button type="button" className="min-h-11 text-left text-sm font-medium text-primary" onClick={() => { setMine(String(Math.round(incomeShare * 100))); setTheirs(String(100 - Math.round(incomeShare * 100))); }}>
              Usar a proporção da renda ({Math.round(incomeShare * 100)}/{100 - Math.round(incomeShare * 100)})
            </button>
          ) : null}
        </fieldset>
      ) : (
        <input type="hidden" name="method" value="percent" />
      )}
      {monthly ? (
        <div className="rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground">
          <p className="text-[13px]">Para chegar em {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${deadline}-01T00:00:00Z`))}</p>
          <p className="tabular text-lg font-medium"><Money cents={monthly} /> por mês{partnerName ? " juntos" : ""}</p>
          {partnerName && method === "percent" ? <p className="text-[13px]">{meName} <Money cents={Math.round(monthly * mineShare)} /> · {partnerName} <Money cents={monthly - Math.round(monthly * mineShare)} /></p> : null}
        </div>
      ) : null}
      <FormMessage state={state} />
      <SubmitButton className="w-full">{partnerName ? `Criar e convidar ${partnerName}` : "Criar meta"}</SubmitButton>
      {partnerName ? <p className="text-center text-[13px] text-muted-foreground">{partnerName} confirma a parte dele antes de a meta começar.</p> : null}
    </form>
  );
}

function monthsUntil(month: string): number {
  const now = new Date();
  const [y, m] = month.split("-").map(Number);
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
}

export function ContributeForm({ goalId, suggestion }: { goalId: string; suggestion: string }) {
  const [state, action] = useActionState<PlanState, FormData>(contributeAction, undefined);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={goalId} />
      <Field label="Quanto você guardou"><Input name="amount" inputMode="decimal" defaultValue={suggestion} required /></Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Guardar para esta meta</SubmitButton>
      <p className="text-center text-[13px] text-muted-foreground">Registre aqui o que você separou no banco. O Prumo não move dinheiro.</p>
    </form>
  );
}

// ---------- Free money ----------

export function FreeMoneyForm({ meName, partnerName, mineText, theirsText, waiting }: { meName: string; partnerName: string; mineText: string; theirsText: string; waiting: boolean }) {
  const [state, action] = useActionState<PlanState, FormData>(proposeFreeMoneyAction, undefined);
  const [same, setSame] = useState(mineText === theirsText);
  const [mine, setMine] = useState(mineText);
  return (
    <form action={action} className="grid gap-4">
      <div className={cn("grid gap-3", same ? "" : "grid-cols-2")}>
        <Field label={same ? "Por mês, para cada um" : `${meName} · por mês`}><Input name="mine" inputMode="decimal" value={mine} onChange={(e) => setMine(e.target.value)} required /></Field>
        {!same ? <Field label={`${partnerName} · por mês`}><Input name="theirs" inputMode="decimal" defaultValue={theirsText} required /></Field> : null}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="same" checked={same} onChange={(e) => setSame(e.target.checked)} className="size-5 accent-[var(--primary)]" />
        Mesmo valor para os dois
      </label>
      <FormMessage state={state} />
      <SubmitButton className="w-full">{waiting ? "Enviar nova proposta" : `Enviar proposta para ${partnerName}`}</SubmitButton>
    </form>
  );
}
