import { formatBRL, parseBRL } from "@domain/money";

import { useAction } from "@/lib/query";
import { Pair, useFields } from "@/ui/forms";
import { Button, Field, FormMessage, Input, PageHeader, Select, Stack, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors } from "@/ui/theme";

type Data = { partnerName: string; categories: string[] };

export default function NewApproval() {
  return (
    <Screen<Data> path="couple/approvals/new" keyboard gap={16}>
      {(d) => (
        <>
          <PageHeader title="Combinar uma compra" subtitle={`${d.partnerName} recebe pelo app e pelo WhatsApp`} back="/couple/approvals" />
          <ApprovalRequestForm categories={d.categories} />
        </>
      )}
    </Screen>
  );
}

function ApprovalRequestForm({ categories }: { categories: string[] }) {
  const { run, pending, state } = useAction("requestApproval");
  const [f, set] = useFields({ title: "", merchant: "", amount: "", installments: "1", category: "", note: "" });
  const cents = parseBRL(f.amount) ?? 0;
  const installments = Number(f.installments);
  return (
    <Stack>
      <Field label="O que é"><Input value={f.title} onChangeText={set("title")} maxLength={80} placeholder="Sofá novo" /></Field>
      <Field label="Loja (opcional)"><Input value={f.merchant} onChangeText={set("merchant")} maxLength={60} placeholder="Tok&Stok" /></Field>
      <Pair>
        <Field label="Valor"><Input value={f.amount} onChangeText={set("amount")} keyboardType="decimal-pad" placeholder="0,00" /></Field>
        <Field label="Parcelas"><Select label="Parcelas" value={f.installments} onChange={set("installments")} options={[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => ({ value: String(n), label: n === 1 ? "À vista" : `${n}x` }))} /></Field>
      </Pair>
      {installments > 1 && cents > 0 ? <Txt size={13} color={colors.mutedForeground}>{installments}x de {formatBRL(Math.round(cents / installments))}</Txt> : null}
      <Field label="Categoria"><Select label="Categoria" value={f.category} onChange={set("category")} options={[{ value: "", label: "Sem categoria" }, ...categories.map((c) => ({ value: c, label: c }))]} /></Field>
      <Field label="Por que (opcional)"><Input multiline value={f.note} onChangeText={set("note")} maxLength={280} placeholder="Achei esse no showroom, cabe na sala…" /></Field>
      <FormMessage state={state} />
      <Button pending={pending} onPress={() => run(f)}>Enviar para combinar</Button>
      <Txt size={13} color={colors.mutedForeground} center>Nada é bloqueado no banco. É só uma conversa antes.</Txt>
    </Stack>
  );
}
