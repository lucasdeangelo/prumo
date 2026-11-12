import { FREQUENCIES, FREQUENCY_LABEL } from "@domain/recurrence";

import { useAction } from "@/lib/query";
import { notifyOptions, OwnerChoice, Pair, tagOptions, useFields } from "@/ui/forms";
import { Button, Card, DateInput, Field, FormMessage, Input, PageHeader, Select, Stack } from "@/ui/kit";
import { Screen } from "@/ui/screen";

type Data = { tags: { id: string; name: string }[]; today: string; partnerName: string | null };

export default function NewSubscription() {
  return (
    <Screen<Data> path="subscriptions/new" keyboard gap={0}>
      {(d) => (
        <>
          <PageHeader title="Nova assinatura" back="/subscriptions" />
          <Card><SubscriptionForm d={d} /></Card>
        </>
      )}
    </Screen>
  );
}

function SubscriptionForm({ d }: { d: Data }) {
  const { run, pending, state } = useAction("createSubscription");
  const [f, set] = useFields({ name: "", scope: "mine" as "mine" | "ours", amount: "", nextChargeDate: d.today, frequency: "monthly", notifyDaysBefore: "2", tagId: "" });
  return (
    <Stack>
      <Field label="Serviço"><Input value={f.name} onChangeText={set("name")} placeholder="Ex.: Netflix, Academia" maxLength={80} /></Field>
      {d.partnerName ? <OwnerChoice value={f.scope} onChange={set("scope")} partnerName={d.partnerName} mineLabel="Minha" oursLabel="Nossa" nossoHint="Assinatura do casal: os dois veem e recebem o aviso da cobrança." /> : null}
      <Pair>
        <Field label="Valor"><Input value={f.amount} onChangeText={set("amount")} keyboardType="decimal-pad" placeholder="0,00" /></Field>
        <Field label="Próxima cobrança"><DateInput value={f.nextChargeDate} onChange={set("nextChargeDate")} label="Próxima cobrança" /></Field>
      </Pair>
      <Pair>
        <Field label="Frequência"><Select label="Frequência" value={f.frequency} onChange={set("frequency")} options={FREQUENCIES.map((x) => ({ value: x, label: FREQUENCY_LABEL[x] }))} /></Field>
        <Field label="Avisar antes"><Select label="Avisar antes" value={f.notifyDaysBefore} onChange={set("notifyDaysBefore")} options={notifyOptions} /></Field>
      </Pair>
      <Field label="Tag"><Select label="Tag" value={f.tagId} onChange={set("tagId")} options={tagOptions(d.tags, "Assinaturas")} /></Field>
      <FormMessage state={state} />
      <Button pending={pending} onPress={() => run(f)}>Salvar assinatura</Button>
    </Stack>
  );
}
