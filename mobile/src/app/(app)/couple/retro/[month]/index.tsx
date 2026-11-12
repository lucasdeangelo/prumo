import { formatBRL } from "@domain/money";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { Avatar, SegmentBar } from "@/ui/finance";
import { Button, Card, Label, PageHeader, Row, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, PERSON_BG, type Person } from "@/ui/theme";

export type RetroData = {
  month: string;
  name: string;
  prevName: string;
  previous: string;
  nextMonth: string;
  canGoNext: boolean;
  me: Person;
  partner: Person;
  people: Person[];
  meFirst: boolean;
  defaultSplit: "income" | "equal";
  totalCents: number;
  prevTotalCents: number;
  changePercent: number | null;
  biggestDrop: { category: string; cents: number } | null;
  budgetLines: { category: string; limitCents: number; spentCents: number; percent: number; state: "ok" | "attention" | "over" }[];
  goalLines: { id: string; name: string; savedCents: number; percent: number }[];
  goalsSavedCents: number;
  settlement: { paidCents: [number, number]; totalCents: number; secondOwesFirstCents: number };
  incomeShare: number;
  points: { key: string; title: string; body: string }[];
  marked: string[];
  done: boolean;
  monthSettledLabel: string | null;
};

export default function Retro() {
  const { month } = useLocalSearchParams<{ month: string }>();
  return <Screen<RetroData> path={`couple/retro/${month}`} gap={16}>{(d) => <RetroView d={d} />}</Screen>;
}

function RetroView({ d }: { d: RetroData }) {
  const settle = useAction("settleMonth");
  const over = d.budgetLines.filter((l) => l.state === "over");
  const attention = d.budgetLines.filter((l) => l.state === "attention");
  const okCount = d.budgetLines.length - over.length - attention.length;
  const paid = d.settlement.paidCents;
  const total = d.settlement.totalCents;
  const paidShare = total > 0 ? paid[0] / total : 0;
  const share = (i: 0 | 1) => (d.meFirst ? (i === 0 ? paidShare : 1 - paidShare) : i === 0 ? 1 - paidShare : paidShare);
  const paidBy = (i: 0 | 1) => (d.meFirst ? paid[i] : paid[1 - i]);
  const incomeFirst = d.meFirst ? d.incomeShare : 1 - d.incomeShare;
  const owed = d.settlement.secondOwesFirstCents;
  const [debtor, creditor] = owed > 0 ? [d.partner, d.me] : [d.me, d.partner];
  const maxBar = Math.max(d.totalCents, d.prevTotalCents, 1);

  return (
    <>
      <PageHeader back="/overview" />
      <Label>Retrospectiva · {d.name}</Label>

      <Card style={{ gap: 8 }}>
        <Txt size={14} color={colors.mutedForeground}>Em {d.name}, vocês gastaram juntos</Txt>
        <Txt size={36} weight="medium" tabular tracking={-1.08} lh={44}>{formatBRL(d.totalCents)}</Txt>
        <Txt size={14} color={colors.mutedForeground}>Isso é tudo o que estava marcado como Nosso.</Txt>
        {d.changePercent !== null ? (
          <>
            <Txt size={15} weight="medium">{d.changePercent === 0 ? `Igual a ${d.prevName}` : `${Math.abs(d.changePercent)}% ${d.changePercent < 0 ? "a menos" : "a mais"} que em ${d.prevName}`}</Txt>
            <View style={{ gap: 8 }}>
              {([[d.prevName, d.prevTotalCents], [d.name, d.totalCents]] as const).map(([label, cents]) => (
                <Row key={label} gap={8}>
                  <Txt size={14} color={colors.mutedForeground} style={{ width: 80, textTransform: "capitalize" }}>{label}</Txt>
                  <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border }}>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.primary, width: `${(cents / maxBar) * 100}%` }} />
                  </View>
                  <Txt size={14} tabular>{formatBRL(cents)}</Txt>
                </Row>
              ))}
            </View>
          </>
        ) : null}
        {d.biggestDrop && d.biggestDrop.cents >= 5000 ? <Txt size={14} color={colors.mutedForeground}>A maior queda foi em {d.biggestDrop.category.toLowerCase()}: {formatBRL(d.biggestDrop.cents)} a menos.</Txt> : null}
      </Card>

      {d.budgetLines.length > 0 ? (
        <Card style={{ gap: 8 }}>
          <Txt size={15} weight="medium">{over.length === 0 ? "Tudo dentro do combinado" : over.length === 1 ? "Uma categoria passou do combinado" : `${over.length} categorias passaram do combinado`}</Txt>
          {over.map((l) => <Row key={l.category} style={{ justifyContent: "space-between" }}><Txt size={14}>{l.category}</Txt><Txt size={14} tabular color={colors.danger}>{formatBRL(l.spentCents)} de {formatBRL(l.limitCents)}</Txt></Row>)}
          {attention.map((l) => <Row key={l.category} style={{ justifyContent: "space-between" }}><Txt size={14}>{l.category}</Txt><Txt size={14} tabular>{l.percent}% do orçamento</Txt></Row>)}
          {okCount > 0 ? <Row style={{ justifyContent: "space-between" }}><Txt size={14} color={colors.mutedForeground}>{over.length + attention.length > 0 ? `As outras ${okCount}` : `Todas as ${okCount}`}</Txt><Txt size={14} color={colors.mutedForeground}>dentro do combinado</Txt></Row> : null}
        </Card>
      ) : null}

      {d.goalLines.length > 0 ? (
        <Card style={{ gap: 8 }}>
          <Txt size={14} color={colors.mutedForeground}>Nas metas, vocês guardaram</Txt>
          <Txt size={24} weight="medium" tabular color={colors.success}>+ {formatBRL(d.goalsSavedCents)}</Txt>
          {d.goalLines.map((g) => <Row key={g.id} style={{ justifyContent: "space-between" }}><Txt size={14}>{g.name}</Txt><Txt size={14} tabular>+ {formatBRL(g.savedCents)} · {g.percent}%</Txt></Row>)}
        </Card>
      ) : null}

      {total > 0 ? (
        <Card style={{ gap: 8 }}>
          <Txt size={15} weight="medium">Quem pagou o quê</Txt>
          <SegmentBar total={total} label="Quem pagou o que é Nosso" segments={[{ value: paidBy(0), color: PERSON_BG[d.people[0].color] }, { value: paidBy(1), color: PERSON_BG[d.people[1].color] }]} />
          <Row gap={8}>
            {d.people.map((p, i) => (
              <Row key={p.userId} gap={8} style={{ flex: 1 }}>
                <Avatar person={p} size={24} />
                <View>
                  <Txt size={14}>{p.name} · {Math.round(share(i as 0 | 1) * 100)}%</Txt>
                  <Txt size={14} tabular color={colors.mutedForeground}>{formatBRL(paidBy(i as 0 | 1))}</Txt>
                </View>
              </Row>
            ))}
          </Row>
          <Txt size={14} color={colors.mutedForeground}>
            {Math.abs(share(0) - incomeFirst) <= 0.05 ? "Bem perto" : "Diferente"} da proporção {d.defaultSplit === "income" ? "da renda" : "que vocês escolheram"} ({Math.round(incomeFirst * 100)}/{100 - Math.round(incomeFirst * 100)}). As compras do cartão contam já divididas.
          </Txt>
        </Card>
      ) : null}

      {owed !== 0 ? (
        <Card style={{ gap: 8 }}>
          <Txt size={15} weight="medium">Acerto do mês</Txt>
          <Row style={{ justifyContent: "space-between" }}>
            <Row gap={8}><Avatar person={debtor} size={28} /><Txt>→</Txt><Avatar person={creditor} size={28} /></Row>
            <Txt size={20} weight="medium" tabular>{formatBRL(Math.abs(owed))}</Txt>
          </Row>
          {d.monthSettledLabel ? (
            <Txt size={14} color={colors.mutedForeground}>Acertado em {d.monthSettledLabel}</Txt>
          ) : (
            <Button variant="outline" pending={settle.pending} onPress={() => settle.run({ month: d.month })}>Já está acertado</Button>
          )}
        </Card>
      ) : null}

      <Button href={`/couple/retro/${d.month}/talk`}>{`Ver pontos para conversar${d.points.length ? ` (${d.points.length})` : ""}`}</Button>
      <Row gap={8}>
        <Button style={{ flex: 1 }} size="sm" variant="ghost" onPress={() => router.setParams({ month: d.previous })}>Anterior</Button>
        {d.canGoNext ? <Button style={{ flex: 1 }} size="sm" variant="ghost" onPress={() => router.setParams({ month: d.nextMonth })}>Próximo</Button> : <View style={{ flex: 1 }} />}
      </Row>
    </>
  );
}
