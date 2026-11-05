"use client";

import { useActionState, useState } from "react";

import {
  createBillAction,
  createManualAccountAction,
  createRuleAction,
  createSubscriptionAction,
  createTagAction,
  createTransactionAction,
  detectSubscriptionsAction,
  pluggySyncAction,
  updateTransactionAction,
  type FormState,
} from "@/app/(app)/actions";
import { Field, FormMessage, Input, Segmented, Select, SubmitButton } from "@/components/ui/form";
import { FREQUENCY_LABEL } from "@/lib/domain/recurrence";

type Option = { id: string; name: string };

function TagSelect({ tags, defaultValue, name = "tagId", emptyLabel = "Automática" }: { tags: Option[]; defaultValue?: string | null; name?: string; emptyLabel?: string }) {
  return (
    <Select name={name} defaultValue={defaultValue ?? ""}>
      <option value="">{emptyLabel}</option>
      {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </Select>
  );
}

export function TransactionForm({ tags, accounts, today }: { tags: Option[]; accounts: Option[]; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(createTransactionAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <Segmented name="type" defaultValue="debit" options={[{ value: "debit", label: "Saída" }, { value: "credit", label: "Entrada" }]} />
      <Field label="Valor">
        <Input name="amount" inputMode="decimal" placeholder="0,00" autoFocus required className="tabular text-2xl font-semibold" />
      </Field>
      <Field label="Descrição">
        <Input name="description" placeholder="Ex.: Mercado, Uber, Salário" required maxLength={140} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data"><Input type="date" name="date" defaultValue={today} required /></Field>
        <Field label="Tag" hint="Automática usa suas regras"><TagSelect tags={tags} /></Field>
      </div>
      {accounts.length > 0 ? (
        <Field label="Conta">
          <Select name="accountId" defaultValue=""><option value="">Nenhuma</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        </Field>
      ) : null}
      <FormMessage state={state} />
      <SubmitButton className="w-full" >Salvar</SubmitButton>
    </form>
  );
}

export function EditTransactionForm({
  tx,
  tags,
  editableFacts,
  amountText,
}: {
  tx: { id: string; description: string; tagId: string | null; date: string; type: "credit" | "debit"; merchant: string | null };
  tags: Option[];
  editableFacts: boolean;
  amountText: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateTransactionAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={tx.id} />
      {editableFacts ? (
        <>
          <Segmented name="type" defaultValue={tx.type} options={[{ value: "debit", label: "Saída" }, { value: "credit", label: "Entrada" }]} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor"><Input name="amount" inputMode="decimal" defaultValue={amountText} required /></Field>
            <Field label="Data"><Input type="date" name="date" defaultValue={tx.date} required /></Field>
          </div>
        </>
      ) : null}
      <Field label="Descrição"><Input name="description" defaultValue={tx.description} maxLength={140} /></Field>
      <Field label="Tag"><TagSelect tags={tags} defaultValue={tx.tagId} emptyLabel="Sem tag" /></Field>
      {tx.merchant ? (
        <label className="flex items-start gap-3 rounded-xl bg-muted p-3 text-sm">
          <input type="checkbox" name="learn" defaultChecked className="mt-0.5 size-5 accent-[var(--primary)]" />
          <span>Usar esta tag sempre para <strong>{tx.merchant}</strong> (cria uma regra e ajusta as anteriores automáticas)</span>
        </label>
      ) : null}
      <FormMessage state={state} />
      <SubmitButton className="w-full">Salvar</SubmitButton>
    </form>
  );
}

export function BillForm({ tags, accounts, today }: { tags: Option[]; accounts: Option[]; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(createBillAction, undefined);
  const [recurrence, setRecurrence] = useState("monthly");
  return (
    <form action={action} className="grid gap-4">
      <Segmented name="type" defaultValue="payable" options={[{ value: "payable", label: "A pagar" }, { value: "receivable", label: "A receber" }]} />
      <Field label="Descrição"><Input name="description" placeholder="Ex.: Aluguel, Luz, Cartão" required maxLength={120} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor"><Input name="amount" inputMode="decimal" placeholder="0,00" required /></Field>
        <Field label="Vencimento"><Input type="date" name="dueDate" defaultValue={today} required /></Field>
      </div>
      <Field label="Repetição">
        <Select name="recurrenceType" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
          {Object.entries(FREQUENCY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      {recurrence === "custom" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="A cada"><Input name="recurrenceInterval" type="number" min={1} max={365} defaultValue={1} /></Field>
          <Field label="Unidade">
            <Select name="recurrenceUnit" defaultValue="month">
              <option value="day">dias</option><option value="week">semanas</option><option value="month">meses</option><option value="year">anos</option>
            </Select>
          </Field>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tag"><TagSelect tags={tags} emptyLabel="Sem tag" /></Field>
        <Field label="Avisar antes"><Select name="notifyDaysBefore" defaultValue="3">{[0, 1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d === 0 ? "No dia" : `${d} dia(s)`}</option>)}</Select></Field>
      </div>
      {accounts.length > 0 ? (
        <Field label="Conta"><Select name="accountId" defaultValue=""><option value="">Nenhuma</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
      ) : null}
      <FormMessage state={state} />
      <SubmitButton className="w-full">Salvar conta</SubmitButton>
    </form>
  );
}

export function SubscriptionForm({ tags, today }: { tags: Option[]; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(createSubscriptionAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Serviço"><Input name="name" placeholder="Ex.: Netflix, Academia" required maxLength={80} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor"><Input name="amount" inputMode="decimal" placeholder="0,00" required /></Field>
        <Field label="Próxima cobrança"><Input type="date" name="nextChargeDate" defaultValue={today} required /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequência">
          <Select name="frequency" defaultValue="monthly">
            {(["weekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual"] as const).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
          </Select>
        </Field>
        <Field label="Avisar antes"><Select name="notifyDaysBefore" defaultValue="2">{[0, 1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d === 0 ? "No dia" : `${d} dia(s)`}</option>)}</Select></Field>
      </div>
      <Field label="Tag"><TagSelect tags={tags} emptyLabel="Assinaturas" /></Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Salvar assinatura</SubmitButton>
    </form>
  );
}

export function DetectButton() {
  const [state, action] = useActionState<FormState, FormData>(detectSubscriptionsAction, undefined);
  return (
    <form action={action} className="grid gap-2">
      <SubmitButton variant="outline" className="w-full" pendingText="Procurando…">Procurar assinaturas nas movimentações</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function TagForm() {
  const [state, action] = useActionState<FormState, FormData>(createTagAction, undefined);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Nova tag"><Input name="name" required maxLength={30} placeholder="Ex.: Pets" /></Field>
        <Field label="Cor"><Input type="color" name="color" defaultValue="#2a78d6" className="w-14 p-1" /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="excluded" className="size-5" /> Não contar nos totais (ex.: transferências)</label>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">Criar tag</SubmitButton>
    </form>
  );
}

export function RuleForm({ tags }: { tags: Option[] }) {
  const [state, action] = useActionState<FormState, FormData>(createRuleAction, undefined);
  return (
    <form action={action} className="grid gap-3">
      <Field label="Quando a descrição" hint="Ex.: “posto shell” → Transporte">
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Select name="patternType" defaultValue="contains" className="w-auto">
            <option value="contains">contém</option>
            <option value="description">começa com</option>
            <option value="exact">é igual a</option>
          </Select>
          <Input name="pattern" required maxLength={60} placeholder="texto" />
        </div>
      </Field>
      <Field label="Aplicar a tag"><TagSelect tags={tags} emptyLabel="Escolha…" /></Field>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">Criar regra</SubmitButton>
    </form>
  );
}

export function ManualAccountForm() {
  const [state, action] = useActionState<FormState, FormData>(createManualAccountAction, undefined);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome"><Input name="name" required maxLength={60} placeholder="Ex.: Carteira" /></Field>
        <Field label="Saldo (opcional)"><Input name="balance" inputMode="decimal" placeholder="0,00" /></Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">Adicionar conta manual</SubmitButton>
    </form>
  );
}

export function SyncButton({ itemId }: { itemId: string }) {
  const [state, action] = useActionState<FormState, FormData>(pluggySyncAction, undefined);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <SubmitButton variant="outline" pendingText="Sincronizando…" className="w-full">Sincronizar agora</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
