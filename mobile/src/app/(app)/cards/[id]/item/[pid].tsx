import { formatDayLabel } from "@domain/dates";
import { useLocalSearchParams } from "expo-router";

import { useAction } from "@/lib/query";
import { Amount } from "@/ui/finance";
import { tagOptions, useFields } from "@/ui/forms";
import { Button, Card, Field, FormMessage, Input, PageHeader, Segmented, Select, Stack, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors } from "@/ui/theme";

type Scope = "mine" | "ours" | "partner";
type Data = {
  item: {
    bill_month: string;
    transaction_date: string;
    description: string;
    user_description: string | null;
    amount_cents: number;
    type: "credit" | "debit";
    tag_id: string | null;
    scope: Scope;
    card_last4: string | null;
    installment_number: number | null;
    installment_total: number | null;
  };
  tags: { id: string; name: string }[];
  partnerName: string | null;
  back: string;
};

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

/** A purchase the bank still shows as pending: tag, name and owner, carried over once it posts. */
export default function CardItemScreen() {
  const { id, pid, m } = useLocalSearchParams<{ id: string; pid: string; m?: string }>();
  return (
    <Screen<Data> path={`cards/${id}/item/${encodeURIComponent(pid)}${m ? `?m=${encodeURIComponent(m)}` : ""}`} keyboard gap={16}>
      {(d) => <CardItem d={d} accountId={id} providerId={pid} />}
    </Screen>
  );
}

function CardItem({ d, accountId, providerId }: { d: Data; accountId: string; providerId: string }) {
  const { item } = d;
  const { run, pending, state } = useAction("editCardItem");
  const [f, set] = useFields({ scope: item.scope as Scope, tagId: item.tag_id ?? "", description: item.user_description ?? "" });
  const submit = () => run({ accountId, providerId, scope: d.partnerName ? f.scope : "mine", tagId: f.tagId, description: f.description, returnTo: d.back });
  const details = [
    formatDayLabel(item.transaction_date),
    item.installment_number && item.installment_total ? `parcela ${item.installment_number}/${item.installment_total}` : null,
    item.card_last4 ? `•• ${item.card_last4}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader title="Compra no cartão" back={d.back} />
      <Card style={{ alignItems: "center" }}>
        <Amount cents={item.amount_cents} type={item.type === "credit" ? "in" : undefined} size={30} />
        <Txt weight="medium" center style={{ marginTop: 8 }}>{item.user_description ?? item.description}</Txt>
        <Txt size={14} color={colors.mutedForeground} center>{details}</Txt>
        {item.user_description ? <Txt size={12} color={colors.mutedForeground} center style={{ marginTop: 4 }}>No extrato: {item.description}</Txt> : null}
        <Txt size={12} color={colors.mutedForeground} center style={{ marginTop: 8 }}>
          Ainda não confirmada pelo banco · fatura de {monthName.format(new Date(`${item.bill_month}-01T00:00:00Z`))}. Valor e data vêm do banco.
        </Txt>
      </Card>
      <Card>
        <Stack>
          {d.partnerName ? (
            <Field label="De quem é">
              <Segmented<Scope> value={f.scope} onChange={set("scope")} label="De quem é" options={[{ value: "ours", label: "Nosso" }, { value: "mine", label: "Meu" }, { value: "partner", label: `De ${d.partnerName}` }]} />
            </Field>
          ) : null}
          <Field label="Tag"><Select label="Tag" value={f.tagId} onChange={set("tagId")} options={tagOptions(d.tags, "Sem tag")} /></Field>
          <Field label="Descrição"><Input value={f.description} onChangeText={set("description")} maxLength={120} placeholder="Como o banco escreveu" /></Field>
          <FormMessage state={state} />
          <Button pending={pending} onPress={submit}>Salvar</Button>
        </Stack>
      </Card>
      <Txt size={13} color={colors.mutedForeground} center>Quando o banco confirmar a compra, a tag, o nome e de quem é passam junto para o lançamento.</Txt>
    </>
  );
}
