import { formatBRL } from "@domain/money";
import { View } from "react-native";

import { SegmentBar, SpaceChip } from "@/ui/finance";
import { Button, EmptyState, ListGroup, PageHeader, Pill, Press, Row, SectionHeader, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, PERSON_BG, radius, type Person, type PersonColor } from "@/ui/theme";

type Progress = { percent: number; missingCents: number; reachMonth: string | null; monthsAhead: number | null; neededMonthlyCents: number | null; extraMonthlyCents: number };
type Goal = { id: string; name: string; icon: string | null; status: "pending" | "active" | "done" | "archived"; deadlineLabel: string | null; savedCents: number; targetCents: number; byUser: Record<string, number>; progress: Progress; reachLabel: string | null; hasDeadline: boolean; completedLabel: string | null };
type Data = { hasPartner: boolean; meColor: PersonColor; people: Person[]; savedCents: number; open: Goal[]; done: Goal[] };

export default function Goals() {
  return (
    <Screen<Data> path="couple/goals" gap={16}>
      {(d) => (
        <>
          <Row gap={8}>
            <PageHeader back="/overview" />
            {d.hasPartner ? <SpaceChip space="nosso" caption={`Nosso · ${d.people.map((p) => p.name).join(" e ")} veem`} me={d.meColor} /> : null}
          </Row>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <Txt size={24} weight="medium" tracking={-0.48} lh={30}>Metas</Txt>
              <Txt size={14} color={colors.mutedForeground}>{formatBRL(d.savedCents)} guardados{d.hasPartner ? " juntos" : ""}</Txt>
            </View>
            <Button size="sm" full={false} href="/couple/goals/new">Nova meta</Button>
          </Row>

          {d.open.length === 0 ? <EmptyState title="Nenhuma meta em andamento">Viagem, reserva de emergência, reforma: comecem por uma.</EmptyState> : null}

          <View style={{ gap: 12 }}>
            {d.open.map((g) => (
              <Press key={g.id} href={`/couple/goals/${g.id}`} style={{ gap: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16 }}>
                <Row align="flex-start" style={{ justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Txt size={15} weight="medium">{g.icon ? `${g.icon} ` : ""}{g.name}</Txt>
                    <Txt size={13} color={colors.mutedForeground}>{g.status === "pending" ? "Aguardando confirmação" : g.deadlineLabel ? `Prazo: ${g.deadlineLabel}` : "Sem prazo"}</Txt>
                  </View>
                  {g.status === "active" && g.progress.monthsAhead !== null && g.progress.monthsAhead > 0 ? (
                    <Pill bg={colors.secondary} color={colors.secondaryForeground}>{g.progress.monthsAhead === 1 ? "1 mês adiantada" : `${g.progress.monthsAhead} meses adiantada`}</Pill>
                  ) : g.status === "active" && g.progress.extraMonthlyCents > 0 ? (
                    <Pill>+{formatBRL(g.progress.extraMonthlyCents)}/mês</Pill>
                  ) : null}
                </Row>
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt size={14} tabular>{formatBRL(g.savedCents)} de {formatBRL(g.targetCents)}</Txt>
                  <Txt size={14} weight="medium" tabular>{g.progress.percent}%</Txt>
                </Row>
                <SegmentBar total={g.targetCents} label={`${g.progress.percent}% guardado`} segments={d.people.map((p) => ({ value: g.byUser[p.userId!] ?? 0, color: PERSON_BG[p.color] }))} />
                {d.people.length > 1 ? <Txt size={13} color={colors.mutedForeground}>{d.people.map((p) => `${p.name} ${formatBRL(g.byUser[p.userId!] ?? 0)}`).join(" · ")}</Txt> : null}
                {g.status === "active" && g.hasDeadline && g.progress.extraMonthlyCents > 0 && g.reachLabel ? (
                  <Txt size={13} color={colors.mutedForeground}>No ritmo atual, chegam em {g.reachLabel}. Com +{formatBRL(g.progress.extraMonthlyCents)}/mês, no prazo.</Txt>
                ) : null}
              </Press>
            ))}
          </View>

          {d.done.length > 0 ? (
            <View style={{ gap: 8 }}>
              <SectionHeader title="Concluídas" />
              <ListGroup>
                {d.done.map((g) => (
                  <Press key={g.id} href={`/couple/goals/${g.id}`} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }} pressedStyle={{ backgroundColor: colors.rowPress }}>
                    <Txt size={15} weight="medium" style={{ flex: 1 }}>{g.name}</Txt>
                    <Txt size={13} color={colors.mutedForeground}>{formatBRL(g.targetCents)}{g.completedLabel ? ` · concluída em ${g.completedLabel}` : ""}</Txt>
                  </Press>
                ))}
              </ListGroup>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}
