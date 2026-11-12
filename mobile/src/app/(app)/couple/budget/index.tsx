import { formatMonthLong } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { BudgetBar, SpaceChip, UpdatedAt } from "@/ui/finance";
import { Button, Card, EmptyState, Label, Notice, PageHeader, Row, TextLink, ToggleRow, Txt, go } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius, type PersonColor } from "@/ui/theme";

type BudgetLine = { category: string; limitCents: number; spentCents: number; remainingCents: number; percent: number; state: "ok" | "attention" | "over" };
type Data = {
  enviado: boolean;
  meColor: PersonColor;
  month: string;
  syncedAt: string | null;
  partnerName: string;
  names: string;
  proposal: { id: string; mine: boolean; lines: { category: string; amountCents: number }[] } | null;
  overview: { lines: BudgetLine[]; limitCents: number; usedCents: number; freeCents: number };
  days: number;
  lastAlert: { category: string; threshold: number; when: string } | null;
  budgetAlerts: boolean;
};

export default function Budget() {
  const { enviado } = useLocalSearchParams<{ enviado?: string }>();
  return <Screen<Data> path="couple/budget" gap={16}>{(d) => <BudgetView d={d} sent={Boolean(enviado) || d.enviado} />}</Screen>;
}

function BudgetView({ d, sent }: { d: Data; sent: boolean }) {
  const decide = useAction("decideProposal");
  const alerts = useAction("toggleBudgetAlerts");
  const o = d.overview;
  return (
    <>
      <Row gap={8}>
        <PageHeader back="/overview" />
        <SpaceChip space="nosso" caption={`Nosso · ${d.names} veem`} me={d.meColor} />
      </Row>
      <Row align="flex-start" style={{ justifyContent: "space-between" }}>
        <View style={{ gap: 4, flex: 1 }}>
          <Txt size={24} weight="medium" tracking={-0.48} lh={30}>Orçamento do lar</Txt>
          <Txt size={14} color={colors.mutedForeground}>{formatMonthLong(d.month).split(" ")[0]}</Txt>
          <UpdatedAt at={d.syncedAt} />
        </View>
        <TextLink href="/couple/budget/setup">Ajustar</TextLink>
      </Row>

      {sent ? <Notice>Enviado para {d.partnerName} revisar.</Notice> : null}

      {d.proposal ? (
        <Card style={{ gap: 8 }}>
          <Txt size={15} weight="medium">{d.proposal.mine ? `Aguardando ${d.partnerName} confirmar o novo orçamento` : `${d.partnerName} propôs um novo orçamento`}</Txt>
          <View style={{ gap: 4 }}>
            {d.proposal.lines.map((l) => (
              <Row key={l.category} style={{ justifyContent: "space-between" }}>
                <Txt size={14} color={colors.mutedForeground}>{l.category}</Txt>
                <Txt size={14} color={colors.mutedForeground} tabular>{formatBRL(l.amountCents)}</Txt>
              </Row>
            ))}
          </View>
          {!d.proposal.mine ? (
            <Row gap={8}>
              <Button style={{ flex: 1 }} variant="outline" pending={decide.pending} pendingText="…" onPress={() => decide.run({ id: d.proposal!.id, accept: "0", returnTo: "/couple/budget" })}>Vamos conversar</Button>
              <Button style={{ flex: 1 }} pending={decide.pending} pendingText="…" onPress={() => decide.run({ id: d.proposal!.id, accept: "1", returnTo: "/couple/budget" })}>Confirmar</Button>
            </Row>
          ) : null}
        </Card>
      ) : null}

      {o.lines.length === 0 ? (
        <EmptyState title="Ainda sem orçamento do lar">
          <Txt size={14} color={colors.primary} onPress={() => go("/couple/budget/setup")}>Combinem quanto querem gastar juntos por mês</Txt>, com sugestões pela média dos últimos meses.
        </EmptyState>
      ) : (
        <>
          <Card style={{ gap: 4 }}>
            <Label>Ainda cabe no mês</Label>
            <Txt size={32} weight="medium" tabular tracking={-0.96} lh={40} color={o.freeCents < 0 ? colors.danger : colors.foreground}>{formatBRL(o.freeCents)}</Txt>
            <Txt size={13} color={colors.mutedForeground}>
              {formatBRL(o.usedCents)} de {formatBRL(o.limitCents)}
              {o.freeCents > 0 ? ` · cerca de ${formatBRL(Math.floor(o.freeCents / d.days / 100) * 100)} por dia` : ""}
            </Txt>
          </Card>

          {d.lastAlert ? (
            <Row gap={12} align="flex-start" style={{ borderRadius: radius.lg, backgroundColor: colors.warningBg, paddingHorizontal: 16, paddingVertical: 12 }}>
              <View style={{ marginTop: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning }} />
              <View style={{ flex: 1 }}>
                <Txt size={14} weight="medium" color={colors.warningFg}>{d.lastAlert.category} {d.lastAlert.threshold === 100 ? "passou do combinado" : "chegou a 80%"}</Txt>
                <Txt size={14} color={colors.warningFg}>Aviso enviado para {d.names} {d.lastAlert.when}</Txt>
              </View>
            </Row>
          ) : null}

          <View style={{ gap: 12 }}>
            {o.lines.map((line) => (
              <View key={line.category} style={{ gap: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt weight="medium" style={{ flex: 1 }}>{line.category}</Txt>
                  <Txt color={colors.mutedForeground} tabular>{formatBRL(line.spentCents)} de {formatBRL(line.limitCents)}</Txt>
                </Row>
                <BudgetBar spentCents={line.spentCents} limitCents={line.limitCents} />
                <Txt size={13} weight={line.state === "over" ? "medium" : "regular"} color={line.state === "over" ? colors.danger : colors.mutedForeground}>
                  {line.state === "over" ? `Passou ${formatBRL(-line.remainingCents)} do combinado` : line.state === "attention" ? `${line.percent}% · restam ${formatBRL(line.remainingCents)}` : `Restam ${formatBRL(line.remainingCents)}`}
                </Txt>
              </View>
            ))}
          </View>

          <ToggleRow title="Avisar os dois em 80% e 100%" body="Uma notificação por categoria, sem repetir" on={d.budgetAlerts} disabled={alerts.pending} onPress={() => alerts.run({ enabled: d.budgetAlerts ? "0" : "1" })} />
          <Txt size={13} color={colors.mutedForeground} center>Entra aqui só o que está marcado como Nosso. Gastos do espaço Meu não contam.</Txt>
        </>
      )}
    </>
  );
}
