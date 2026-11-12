import { FREQUENCY_LABEL, type RecurrenceType } from "@domain/recurrence";
import { formatDayLabel } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { Amount } from "@/ui/finance";
import { Button, Card, CardTitle, Flex, PageHeader, Stack, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius } from "@/ui/theme";

type Bill = { id: string; description: string; amount_cents: number; type: "payable" | "receivable"; due_date: string; status: string; recurrence_type: RecurrenceType; recurrence_interval: number | null; recurrence_unit: string | null; notify_days_before: number };
type Data = { bill: Bill; open: boolean; late: boolean; candidates: { transactionId: string; label: string; date: string; amount_cents: number }[] };


export default function BillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Screen<Data> path={`upcoming/${id}`} gap={16}>{(d) => <BillView d={d} />}</Screen>;
}

function BillView({ d }: { d: Data }) {
  const { bill } = d;
  const pay = useAction("payBill");
  const cancel = useAction("cancelBill");
  return (
    <>
      <PageHeader title={bill.description} back="/upcoming" />
      <Card style={{ alignItems: "center" }}>
        <Amount cents={bill.amount_cents} type={bill.type === "payable" ? "out" : "in"} size={30} />
        <Txt size={14} weight={d.late ? "medium" : "regular"} color={d.late ? colors.danger : colors.mutedForeground} style={{ marginTop: 8 }}>{d.late ? "Venceu em " : "Vence em "}{formatDayLabel(bill.due_date)}</Txt>
        <Txt size={12} color={colors.mutedForeground} center style={{ marginTop: 4 }}>
          {FREQUENCY_LABEL[bill.recurrence_type]}
          {bill.recurrence_type === "custom" && bill.recurrence_interval ? ` · a cada ${bill.recurrence_interval} ${bill.recurrence_unit}` : ""}
          {" · "}aviso {bill.notify_days_before === 0 ? "no dia" : `${bill.notify_days_before} dia(s) antes`}
        </Txt>
        {!d.open ? <Txt size={14} weight="medium" style={{ marginTop: 8 }}>{bill.status === "paid" ? "✅ Paga" : "Cancelada"}</Txt> : null}
      </Card>

      {d.open ? (
        <>
          {d.candidates.length > 0 ? (
            <Card>
              <CardTitle>Já apareceu no extrato?</CardTitle>
              <Txt size={14} color={colors.mutedForeground} style={{ marginBottom: 12 }}>Vincule a movimentação para não lançar o valor duas vezes.</Txt>
              <Stack gap={8}>
                {d.candidates.map((c) => (
                  <View key={c.transactionId} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10 }}>
                    <Flex>
                      <Txt size={14} weight="medium" numberOfLines={1}>{c.label}</Txt>
                      <Txt size={12} color={colors.mutedForeground}>{formatDayLabel(c.date)} · {formatBRL(c.amount_cents)}</Txt>
                    </Flex>
                    <Button variant="secondary" full={false} pending={pay.pending} pendingText="…" onPress={() => pay.run({ id: bill.id, transactionId: c.transactionId })}>É esta</Button>
                  </View>
                ))}
              </Stack>
            </Card>
          ) : null}
          <View style={{ gap: 8 }}>
            <Button pending={pay.pending} pendingText="Registrando…" onPress={() => pay.run({ id: bill.id })}>{bill.type === "payable" ? "Marcar como paga" : "Marcar como recebida"}</Button>
            <Txt size={12} color={colors.mutedForeground} center>Cria a movimentação de hoje{bill.recurrence_type !== "once" ? " e agenda a próxima" : ""}.</Txt>
          </View>
          <Button variant="ghost" color={colors.danger} pending={cancel.pending} pendingText="Cancelando…" onPress={() => cancel.run({ id: bill.id })}>Cancelar esta conta</Button>
        </>
      ) : null}
    </>
  );
}
