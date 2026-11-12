import { formatBRL } from "@domain/money";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { follow, useAction } from "@/lib/query";
import { Avatar, SegmentBar } from "@/ui/finance";
import { Button, Card, Field, Flex, FormMessage, Input, ListGroup, Notice, PageHeader, Row, SectionHeader, Stack, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, PERSON_BG, radius, type Person } from "@/ui/theme";

type Progress = { percent: number; missingCents: number; reachMonth: string | null; monthsAhead: number | null; neededMonthlyCents: number | null; extraMonthlyCents: number };
type TimelineItem = { kind: "deposit"; key: string; date: string; dateLabel: string; userId: string; cents: number; automatic: boolean } | { kind: "milestone"; key: string; date: string; dateLabel: string; percent: number };
type Data = {
  id: string;
  title: string;
  subtitle: string;
  status: "pending" | "active" | "done" | "archived";
  waitingMe: boolean;
  myPart: string;
  partnerName: string;
  savedCents: number;
  targetCents: number;
  byUser: Record<string, number>;
  progress: Progress;
  monthlyPaceCents: number;
  reachLabel: string | null;
  people: (Person & { plan: string })[];
  suggestion: string;
  contributionCount: number;
  timeline: TimelineItem[];
};

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Screen<Data> path={`couple/goals/${id}`} keyboard gap={16}>{(d) => <GoalView d={d} />}</Screen>;
}

function GoalView({ d }: { d: Data }) {
  const confirm = useAction("confirmGoal");
  const byId = new Map(d.people.map((p) => [p.userId!, p]));
  const together = d.people.length > 1;
  return (
    <>
      <PageHeader title={d.title} subtitle={d.subtitle} back="/couple/goals" />

      {d.waitingMe ? (
        <Card style={{ gap: 8 }}>
          <Txt size={15} weight="medium">Confirme sua parte</Txt>
          <Txt size={14} color={colors.mutedForeground}>{d.myPart}. A meta começa quando os dois confirmarem.</Txt>
          <Button pending={confirm.pending} onPress={() => confirm.run({ id: d.id })}>Confirmar minha parte</Button>
        </Card>
      ) : d.status === "pending" ? (
        <Notice tone="muted">Aguardando {d.partnerName} confirmar a parte dele.</Notice>
      ) : null}

      <Card style={{ gap: 12 }}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <Txt size={32} weight="medium" tabular tracking={-0.96} lh={40}>{formatBRL(d.savedCents)}</Txt>
          <Txt size={14} color={colors.mutedForeground}>de {formatBRL(d.targetCents)}</Txt>
        </Row>
        <SegmentBar total={d.targetCents} label={`${d.progress.percent}% guardado`} segments={d.people.map((p) => ({ value: d.byUser[p.userId!] ?? 0, color: PERSON_BG[p.color] }))} />
        <Row style={{ justifyContent: "space-between" }}>
          {[25, 50, 75, 100].map((p) => <Txt key={p} size={12} weight={d.progress.percent >= p ? "medium" : "regular"} color={d.progress.percent >= p ? colors.foreground : colors.mutedForeground}>{p}%</Txt>)}
        </Row>
        {together ? (
          <Row gap={8}>
            {d.people.map((p) => (
              <Row key={p.userId} gap={8} style={{ flex: 1, borderRadius: radius.md, backgroundColor: colors.muted, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Avatar person={p} size={28} />
                <Flex>
                  <Txt size={13} color={colors.mutedForeground} numberOfLines={2}>{p.name}{p.plan}</Txt>
                  <Txt size={15} weight="medium" tabular>{formatBRL(d.byUser[p.userId!] ?? 0)}</Txt>
                </Flex>
              </Row>
            ))}
          </Row>
        ) : null}
      </Card>

      {d.status === "active" && d.reachLabel ? (
        <Card style={{ gap: 4, backgroundColor: colors.secondary, borderColor: colors.secondary }}>
          <Txt size={15} weight="medium" color={colors.secondaryForeground}>No ritmo atual, {together ? "vocês chegam" : "você chega"} lá em {d.reachLabel}</Txt>
          <Txt size={14} color={colors.secondaryForeground}>
            {d.progress.monthsAhead !== null && d.progress.monthsAhead > 0
              ? `${d.progress.monthsAhead === 1 ? "Um mês" : `${d.progress.monthsAhead} meses`} antes do prazo, guardando ${formatBRL(d.monthlyPaceCents)} por mês${together ? " juntos" : ""}.`
              : d.progress.extraMonthlyCents > 0
                ? `Para chegar no prazo, faltam ${formatBRL(d.progress.extraMonthlyCents)} por mês a mais.`
                : `Guardando ${formatBRL(d.monthlyPaceCents)} por mês.`}
          </Txt>
        </Card>
      ) : null}

      {d.status === "active" ? <Card><ContributeForm goalId={d.id} suggestion={d.suggestion} /></Card> : null}

      <View style={{ gap: 8 }}>
        <SectionHeader title="Aportes" action={<Txt size={13} color={colors.mutedForeground}>{d.contributionCount} no total</Txt>} />
        {d.timeline.length > 0 ? (
          <ListGroup>
            {d.timeline.map((item) =>
              item.kind === "milestone" ? (
                <Row key={item.key} style={{ minHeight: 56, backgroundColor: "rgba(227,237,232,0.5)", paddingHorizontal: 16, paddingVertical: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Txt size={11} weight="semibold" color="#fff">{item.percent}%</Txt></View>
                  <Flex>
                    <Txt size={15} weight="medium">{item.percent === 50 ? "Metade do caminho" : item.percent === 100 ? "Meta concluída" : `${item.percent}% do caminho`}</Txt>
                    <Txt size={13} color={colors.mutedForeground} style={{ textTransform: "capitalize" }}>{item.dateLabel}</Txt>
                  </Flex>
                </Row>
              ) : (
                <Row key={item.key} style={{ minHeight: 56, paddingHorizontal: 16, paddingVertical: 12 }}>
                  {byId.get(item.userId) ? <Avatar person={byId.get(item.userId)!} size={32} /> : null}
                  <Flex>
                    <Txt size={15} weight="medium">{byId.get(item.userId)?.name ?? "Alguém"} guardou</Txt>
                    <Txt size={13} color={colors.mutedForeground} style={{ textTransform: "capitalize" }}>{item.dateLabel}{item.automatic ? " · automático" : ""}</Txt>
                  </Flex>
                  <Txt size={15} weight="medium" tabular color={colors.success}>+ {formatBRL(item.cents)}</Txt>
                </Row>
              ),
            )}
          </ListGroup>
        ) : (
          <Txt size={14} color={colors.mutedForeground} style={{ paddingHorizontal: 4 }}>Nenhum aporte ainda.</Txt>
        )}
      </View>
    </>
  );
}

function ContributeForm({ goalId, suggestion }: { goalId: string; suggestion: string }) {
  // Crossing 25/50/75/100% opens the milestone screen on top; otherwise the goal just refreshes.
  const { run, pending, state } = useAction("contribute", { onRedirect: (to) => (to.includes("/milestone/") ? router.push(to as never) : follow(to, `/couple/goals/${goalId}`)) });
  const [amount, setAmount] = useState(suggestion);
  return (
    <Stack gap={12}>
      <Field label="Quanto você guardou"><Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /></Field>
      <FormMessage state={state} />
      <Button pending={pending} onPress={() => run({ id: goalId, amount })}>Guardar para esta meta</Button>
      <Txt size={13} color={colors.mutedForeground} center>Registre aqui o que você separou no banco. O Prumo não move dinheiro.</Txt>
    </Stack>
  );
}
