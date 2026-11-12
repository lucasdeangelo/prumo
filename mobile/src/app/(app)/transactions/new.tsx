import { useAction } from "@/lib/query";
import { accountOptions, OwnerChoice, Pair, tagOptions, useFields } from "@/ui/forms";
import { Button, Card, DateInput, Field, FormMessage, Input, PageHeader, Segmented, Select, Stack, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors } from "@/ui/theme";

type Data = { tags: { id: string; name: string }[]; accounts: { id: string; name: string }[]; today: string; partnerName: string | null };

export default function NewTransaction() {
  return (
    <Screen<Data> path="transactions/new" keyboard gap={0}>
      {(d) => (
        <>
          <PageHeader title="Nova movimentação" back="/overview" />
          <Card><TransactionForm d={d} /></Card>
          <Txt size={14} color={colors.mutedForeground} style={{ marginTop: 16, paddingHorizontal: 4 }}>Dica: no WhatsApp, envie “gastei 45,90 no mercado”.</Txt>
        </>
      )}
    </Screen>
  );
}

function TransactionForm({ d }: { d: Data }) {
  const { run, pending, state } = useAction("createTransaction");
  const [f, set] = useFields({ type: "debit" as "debit" | "credit", scope: "mine" as "mine" | "ours", amount: "", description: "", date: d.today, tagId: "", accountId: "" });
  return (
    <Stack>
      <Segmented value={f.type} onChange={set("type")} options={[{ value: "debit", label: "Saída" }, { value: "credit", label: "Entrada" }]} />
      {d.partnerName ? <OwnerChoice value={f.scope} onChange={set("scope")} partnerName={d.partnerName} nossoHint="Vocês dois veem, e entra no orçamento do lar." /> : null}
      <Field label="Valor"><Input big value={f.amount} onChangeText={set("amount")} keyboardType="decimal-pad" placeholder="0,00" autoFocus /></Field>
      <Field label="Descrição"><Input value={f.description} onChangeText={set("description")} placeholder="Ex.: Mercado, Uber, Salário" maxLength={140} /></Field>
      <Pair>
        <Field label="Data"><DateInput value={f.date} onChange={set("date")} label="Data" /></Field>
        <Field label="Tag" hint="Automática usa suas regras"><Select label="Tag" value={f.tagId} onChange={set("tagId")} options={tagOptions(d.tags, "Automática")} /></Field>
      </Pair>
      {d.accounts.length > 0 ? <Field label="Conta"><Select label="Conta" value={f.accountId} onChange={set("accountId")} options={accountOptions(d.accounts)} /></Field> : null}
      <FormMessage state={state} />
      <Button pending={pending} onPress={() => run(f)}>Salvar</Button>
    </Stack>
  );
}
