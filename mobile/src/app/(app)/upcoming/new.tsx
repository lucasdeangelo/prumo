import { FREQUENCY_LABEL } from "@domain/recurrence";
import { useAction } from "@/lib/query";
import { accountOptions, notifyOptions, OwnerChoice, Pair, tagOptions, useFields } from "@/ui/forms";
import { Button, Card, DateInput, Field, FormMessage, Input, PageHeader, Segmented, Select, Stack } from "@/ui/kit";
import { Screen } from "@/ui/screen";

type Data = { tags: { id: string; name: string }[]; accounts: { id: string; name: string }[]; today: string; partnerName: string | null };


export default function NewBill() {
  return (
    <Screen<Data> path="upcoming/new" keyboard gap={0}>
      {(d) => (
        <>
          <PageHeader title="Nova conta futura" back="/upcoming" />
          <Card><BillForm d={d} /></Card>
        </>
      )}
    </Screen>
  );
}

function BillForm({ d }: { d: Data }) {
  const { run, pending, state } = useAction("createBill");
  const [f, set] = useFields({ type: "payable" as "payable" | "receivable", scope: "mine" as "mine" | "ours", description: "", amount: "", dueDate: d.today, recurrenceType: "monthly", recurrenceInterval: "1", recurrenceUnit: "month", tagId: "", notifyDaysBefore: "3", accountId: "" });
  const submit = () => {
    const { recurrenceInterval, recurrenceUnit, ...rest } = f;
    run(f.recurrenceType === "custom" ? { ...rest, recurrenceInterval, recurrenceUnit } : rest);
  };
  return (
    <Stack>
      <Segmented value={f.type} onChange={set("type")} options={[{ value: "payable", label: "A pagar" }, { value: "receivable", label: "A receber" }]} />
      {d.partnerName ? <OwnerChoice value={f.scope} onChange={set("scope")} partnerName={d.partnerName} nossoHint="Conta do casal: aparece no Mês dos dois e avisa os dois." /> : null}
      <Field label="Descrição"><Input value={f.description} onChangeText={set("description")} placeholder="Ex.: Aluguel, Luz, Cartão" maxLength={120} /></Field>
      <Pair>
        <Field label="Valor"><Input value={f.amount} onChangeText={set("amount")} keyboardType="decimal-pad" placeholder="0,00" /></Field>
        <Field label="Vencimento"><DateInput value={f.dueDate} onChange={set("dueDate")} label="Vencimento" /></Field>
      </Pair>
      <Field label="Repetição"><Select label="Repetição" value={f.recurrenceType} onChange={set("recurrenceType")} options={Object.entries(FREQUENCY_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
      {f.recurrenceType === "custom" ? (
        <Pair>
          <Field label="A cada"><Input value={f.recurrenceInterval} onChangeText={set("recurrenceInterval")} keyboardType="number-pad" /></Field>
          <Field label="Unidade"><Select label="Unidade" value={f.recurrenceUnit} onChange={set("recurrenceUnit")} options={[{ value: "day", label: "dias" }, { value: "week", label: "semanas" }, { value: "month", label: "meses" }, { value: "year", label: "anos" }]} /></Field>
        </Pair>
      ) : null}
      <Pair>
        <Field label="Tag"><Select label="Tag" value={f.tagId} onChange={set("tagId")} options={tagOptions(d.tags, "Sem tag")} /></Field>
        <Field label="Avisar antes"><Select label="Avisar antes" value={f.notifyDaysBefore} onChange={set("notifyDaysBefore")} options={notifyOptions} /></Field>
      </Pair>
      {d.accounts.length > 0 ? <Field label="Conta"><Select label="Conta" value={f.accountId} onChange={set("accountId")} options={accountOptions(d.accounts)} /></Field> : null}
      <FormMessage state={state} />
      <Button pending={pending} onPress={submit}>Salvar conta</Button>
    </Stack>
  );
}
