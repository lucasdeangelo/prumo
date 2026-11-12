import { formatBRL } from "@domain/money";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useAction } from "@/lib/query";
import { Avatar, SpaceChip } from "@/ui/finance";
import { ChevronRightIcon } from "@/ui/icons";
import { Button, Card, EmptyState, Field, Flex, FormMessage, Input, PageHeader, Pill, Row, Segmented, TextLink, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius, type Person } from "@/ui/theme";

type ApprovalRow = { id: string; requested_by: string; title: string; amount_cents: number; installments: number; note: string | null; status: "pending" | "approved" | "talk" | "talked"; responded_by: string | null; response_note: string | null; outcome_note: string | null; talked_at: string | null; created_at: string };
type Data = {
  f: "todos" | "esperando";
  viewerId: string;
  me: Person;
  people: Person[];
  partnerName: string;
  names: string;
  thresholdCents: number | null;
  decidedAt: string | null;
  thresholdProposal: { mine: boolean; amountCents: number | null } | null;
  currentText: string;
  rows: ApprovalRow[];
};

const when = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export default function Approvals() {
  const { f } = useLocalSearchParams<{ f?: string }>();
  return <Screen<Data> path="couple/approvals" keyboard gap={16}>{(d) => <ApprovalsView d={d} filter={f === "esperando" ? "esperando" : "todos"} />}</Screen>;
}

function ApprovalsView({ d, filter }: { d: Data; filter: "todos" | "esperando" }) {
  const [open, setOpen] = useState(false);
  const people = new Map(d.people.map((p) => [p.userId!, p]));
  const waiting = d.rows.filter((r) => r.status === "pending" && r.requested_by !== d.viewerId);
  const shown = filter === "esperando" ? waiting : d.rows;
  return (
    <>
      <Row gap={8}>
        <PageHeader back="/overview" />
        <SpaceChip space="nosso" caption={`Nosso · ${d.names} veem`} me={d.me.color} />
      </Row>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <Txt size={24} weight="medium" tracking={-0.48} lh={30}>Combinados</Txt>
        <Button size="sm" full={false} href="/couple/approvals/new">Combinar compra</Button>
      </Row>

      <Card style={{ gap: 12 }}>
        {d.thresholdCents ? (
          <View>
            <Txt size={15} weight="medium">Compras do Nosso acima de {formatBRL(d.thresholdCents)}</Txt>
            <Txt size={14} color={colors.mutedForeground}>a gente conversa antes</Txt>
            {d.decidedAt ? <Txt size={13} color={colors.mutedForeground} style={{ marginTop: 4 }}>Combinado por {d.names} em {d.decidedAt}</Txt> : null}
          </View>
        ) : (
          <Txt size={14} color={colors.mutedForeground}>Definam juntos a partir de que valor uma compra do Nosso pede uma conversa antes.</Txt>
        )}
        {d.thresholdProposal ? (
          <View style={{ borderRadius: radius.md, backgroundColor: colors.muted, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Txt size={13} color={colors.mutedForeground}>
              {d.thresholdProposal.mine ? `Aguardando ${d.partnerName} confirmar` : `${d.partnerName} propôs`} {d.thresholdProposal.amountCents ? formatBRL(d.thresholdProposal.amountCents) : "sem limite"}.{" "}
              {!d.thresholdProposal.mine ? <Txt size={13} color={colors.primary} onPress={() => router.push("/couple")}>Responder</Txt> : null}
            </Txt>
          </View>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 }}>
          <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}><ChevronRightIcon size={14} color={colors.primary} /></View>
          <Txt size={14} weight="medium" color={colors.primary}>Mudar o valor (os dois confirmam)</Txt>
        </Pressable>
        {open ? <ThresholdForm currentText={d.currentText} partnerName={d.partnerName} /> : null}
      </Card>

      <Segmented label="Filtro" value={filter} activeColor={colors.foreground} onChange={(v) => router.setParams({ f: v })} options={[{ value: "todos", label: "Todos" }, { value: "esperando", label: `Esperando você · ${waiting.length}` }]} />

      {shown.length > 0 ? (
        <View style={{ gap: 12 }}>{shown.map((row) => <ApprovalCard key={row.id} row={row} people={people} viewerId={d.viewerId} />)}</View>
      ) : (
        <EmptyState title={filter === "esperando" ? "Nada esperando você" : "Nenhum combinado ainda"}>Quando um quiser combinar uma compra grande, aparece aqui.</EmptyState>
      )}
    </>
  );
}

function ThresholdForm({ currentText, partnerName }: { currentText: string; partnerName: string }) {
  const { run, pending, state } = useAction("proposeThreshold");
  const [amount, setAmount] = useState(currentText);
  return (
    <View style={{ gap: 12 }}>
      <Field label="Conversar antes de compras do Nosso acima de" hint={`Os dois confirmam. Deixe vazio para não ter limite. ${partnerName} recebe a proposta.`}>
        <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="500,00" />
      </Field>
      <FormMessage state={state} />
      <Button variant="secondary" pending={pending} onPress={() => run({ amount })}>Mudar o valor</Button>
    </View>
  );
}

function relative(iso: string): string {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString() ? `hoje, ${time.format(date)}` : when.format(date);
}

/** 05 · Card de pedido de combinado: neutral colors only; "aprovar" / "vamos conversar", never "negado". */
function ApprovalCard({ row, people, viewerId }: { row: ApprovalRow; people: Map<string, Person>; viewerId: string }) {
  const requester = people.get(row.requested_by);
  const responder = row.responded_by ? people.get(row.responded_by) : undefined;
  const waitingMe = row.status === "pending" && row.requested_by !== viewerId;
  const status =
    row.status === "pending"
      ? waitingMe ? "Esperando você" : `Esperando ${[...people.values()].find((p) => p.name !== requester?.name)?.name ?? "seu par"}`
      : row.status === "approved"
        ? `Aprovado por ${responder?.name ?? "seu par"}`
        : row.status === "talk"
          ? "Vamos conversar"
          : `Vamos conversar · conversado em ${row.talked_at ? day.format(new Date(row.talked_at)) : ""}`;
  return (
    <View style={{ gap: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16 }}>
      <Row>
        {requester ? <Avatar person={requester} size={32} /> : null}
        <Flex>
          <Txt size={15} weight="medium" numberOfLines={1}>{row.title}</Txt>
          <Txt size={13} color={colors.mutedForeground}>{requester?.name ?? ""} · {relative(row.created_at)}</Txt>
        </Flex>
        <Txt size={15} weight="medium" tabular>{formatBRL(row.amount_cents)}</Txt>
      </Row>
      {row.note ? <Txt size={14} color={colors.mutedForeground}>“{row.note}”</Txt> : null}
      <Row style={{ justifyContent: "space-between" }}>
        <Pill>{status}</Pill>
        {waitingMe ? <TextLink href={`/couple/approvals/${row.id}`}>Responder</TextLink> : null}
      </Row>
      {row.response_note && responder ? (
        <Row gap={8} align="flex-start"><Avatar person={responder} size={22} /><Txt size={14} color={colors.mutedForeground} style={{ flex: 1 }}>“{row.response_note}”</Txt></Row>
      ) : null}
      {row.outcome_note ? <Txt size={13} color={colors.mutedForeground}>{row.outcome_note}</Txt> : null}
    </View>
  );
}
