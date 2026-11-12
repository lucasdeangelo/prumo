import { formatBRL } from "@domain/money";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { Avatar, SpaceChip } from "@/ui/finance";
import { Button, Card, Field, Input, Label, Notice, PageHeader, Pill, Row, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, type Person, type PersonColor } from "@/ui/theme";

type Data = {
  row: { id: string; title: string; merchant: string | null; category: string | null; amount_cents: number; installments: number; note: string | null; status: "pending" | "approved" | "talk" | "talked"; response_note: string | null };
  mine: boolean;
  meColor: PersonColor;
  requester: Person;
  otherName: string;
  waitingMe: boolean;
  thresholdCents: number | null;
  monthlyCents: number;
  categoryLine: { category: string; remainingCents: number } | null;
  runningMonthlyCents: number;
};

export default function ApprovalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Screen<Data> path={`couple/approvals/${id}`} keyboard gap={16}>{(d) => <ApprovalView d={d} />}</Screen>;
}

function ApprovalView({ d }: { d: Data }) {
  const { row } = d;
  const respond = useAction("respondApproval");
  const talked = useAction("markTalked");
  const withdraw = useAction("withdrawApproval");
  const [comment, setComment] = useState("");
  const [outcome, setOutcome] = useState("");
  return (
    <>
      <Row gap={8}>
        <PageHeader back="/couple/approvals" />
        <SpaceChip space="nosso" caption="Nosso · combinado dos dois" me={d.meColor} />
      </Row>
      {d.waitingMe ? <Pill>Esperando você</Pill> : null}
      <Txt size={24} weight="medium" tracking={-0.48} lh={30}>{d.mine ? "Você quer combinar uma compra" : `${d.requester.name} quer combinar uma compra com você`}</Txt>
      {d.thresholdCents ? <Txt size={14} color={colors.mutedForeground}>Vocês combinaram conversar sobre compras do Nosso acima de {formatBRL(d.thresholdCents)}.</Txt> : null}

      <Card style={{ gap: 12 }}>
        <View>
          <Txt size={18} weight="medium">{row.title}</Txt>
          <Txt size={14} color={colors.mutedForeground}>{[row.merchant, row.category].filter(Boolean).join(" · ")}</Txt>
        </View>
        <Txt size={32} weight="medium" tabular tracking={-0.96} lh={40}>{formatBRL(row.amount_cents)}</Txt>
        {row.installments > 1 ? <Txt size={14} color={colors.mutedForeground}>{row.installments}x de {formatBRL(d.monthlyCents)}</Txt> : null}
        {row.note ? <Row gap={8} align="flex-start"><Avatar person={d.requester} size={24} /><Txt size={14} color={colors.mutedForeground} style={{ flex: 1 }}>“{row.note}”</Txt></Row> : null}
      </Card>

      <Card style={{ gap: 8 }}>
        <Label>Como fica para vocês</Label>
        <Line label={row.installments > 1 ? "Parcela no orçamento do lar" : "No orçamento do lar"} value={`${formatBRL(d.monthlyCents)}${row.installments > 1 ? "/mês" : ""}`} strong />
        {d.categoryLine ? <Line label={`${d.categoryLine.category} este mês`} value={d.categoryLine.remainingCents >= 0 ? `restam ${formatBRL(d.categoryLine.remainingCents)}` : `passou ${formatBRL(-d.categoryLine.remainingCents)}`} /> : null}
        {d.runningMonthlyCents > 0 ? <Line label="Parcelas já em andamento" value={`${formatBRL(d.runningMonthlyCents)}/mês`} /> : null}
      </Card>

      {d.waitingMe ? (
        <View style={{ gap: 12 }}>
          <Field label="Comentário (opcional)"><Input multiline value={comment} onChangeText={setComment} maxLength={280} /></Field>
          <Row gap={8}>
            <Button style={{ flex: 1 }} variant="outline" pending={respond.pending} pendingText="…" onPress={() => respond.run({ id: row.id, comment, answer: "talk" })}>Vamos conversar</Button>
            <Button style={{ flex: 1 }} pending={respond.pending} pendingText="…" onPress={() => respond.run({ id: row.id, comment, answer: "approved" })}>Aprovar</Button>
          </Row>
          <Txt size={13} color={colors.mutedForeground} center>{d.requester.name} recebe sua resposta e o comentário. Nada é bloqueado no banco.</Txt>
        </View>
      ) : row.status === "talk" ? (
        <View style={{ gap: 8 }}>
          <Field label="O que vocês decidiram (opcional)"><Input value={outcome} onChangeText={setOutcome} maxLength={280} placeholder="Fica para depois da viagem" /></Field>
          <Button variant="outline" pending={talked.pending} onPress={() => talked.run({ id: row.id, outcome })}>Marcar como conversado</Button>
        </View>
      ) : row.status === "pending" ? (
        <View style={{ gap: 8 }}>
          <Txt size={14} color={colors.mutedForeground} center>Aguardando {d.otherName}.</Txt>
          <Button variant="ghost" pending={withdraw.pending} onPress={() => withdraw.run({ id: row.id })}>Retirar o pedido</Button>
        </View>
      ) : (
        <Notice>{row.status === "approved" ? `Aprovado${row.response_note ? `: “${row.response_note}”` : "."}` : "Conversado."}</Notice>
      )}
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row gap={12} style={{ justifyContent: "space-between" }}>
      <Txt size={14} style={{ flex: 1 }}>{label}</Txt>
      <Txt size={14} weight={strong ? "medium" : "regular"} tabular>{value}</Txt>
    </Row>
  );
}
