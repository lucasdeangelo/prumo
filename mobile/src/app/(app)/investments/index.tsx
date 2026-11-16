import { formatBRL } from "@domain/money";
import { useState } from "react";
import { View } from "react-native";

import { SpaceSwitcher, UpdatedAt } from "@/ui/finance";
import { PlusIcon, TargetIcon } from "@/ui/icons";
import { AssetRow, ClassBreakdown, Evolution, GainPill, UP, type AssetClass, type AssetView, type EvolutionPoint } from "@/ui/investments";
import { Button, Card, EmptyState, IconButton, Label, ListGroup, Press, Row, SectionHeader, Segmented, TextLink, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, PERSON_BG, PERSON_TINT, radius, type Person } from "@/ui/theme";

type Period = "6m" | "1a" | "tudo";
type Summary = { count: number; totalCents: number; investedCents: number; gainCents: number; gainRatio: number | null; gainsCents: number; lossesCents: number; classes: { cls: AssetClass; label: string; cents: number; ratio: number }[] };
type GoalCard = { id: string; name: string; savedCents: number; targetCents: number; percent: number; earnedCents: number; investmentCount: number; deadlineLabel: string | null };
type Base = { space: "meu" | "nosso"; me: Person; partner: Person | null; period: Period; syncedAt: string | null };
type Data =
  | (Base & { mode: "invite" })
  | (Base & { mode: "meu"; seenText: string | null; summary: Summary; points: EvolutionPoint[]; myGoals: GoalCard[]; assets: AssetView[]; withdrawn: AssetView[] })
  | (Base & {
      mode: "nosso";
      summary: Summary;
      monthLabel: string;
      monthGainCents: number | null;
      incomeCents: number;
      points: EvolutionPoint[];
      goals: GoalCard[];
      free: { cents: number; names: string } | null;
      assets: AssetView[];
      withdrawn: AssetView[];
      outside: { myTotalCents: number; partnerTotalCents: number | null; partnerShares: boolean; shared: AssetView[] };
    });

const PERIODS: { value: Period; label: string }[] = [{ value: "6m", label: "6M" }, { value: "1a", label: "1A" }, { value: "tudo", label: "Tudo" }];
const box = { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 18 } as const;

export default function InvestmentsScreen() {
  const [period, setPeriod] = useState<Period>("6m");
  return (
    <Screen<Data> path={period === "6m" ? "investments" : `investments?periodo=${period}`}>
      {(d) => (
        <>
          <SpaceSwitcher me={d.me} partner={d.partner} hideValues trailing={<IconButton href="/investments/new" label="Novo investimento"><PlusIcon size={22} strokeWidth={1.8} /></IconButton>} />
          {d.mode === "invite" ? (
            <Card style={{ gap: 12 }}>
              <Label>Espaço Nosso</Label>
              <Txt size={14} color={colors.mutedForeground}>Com seu par no Prumo, os investimentos que vocês marcarem como Nosso aparecem aqui para os dois.</Txt>
              <Button href="/couple">Convidar meu par</Button>
            </Card>
          ) : d.mode === "meu" ? (
            <Meu d={d} period={period} setPeriod={setPeriod} />
          ) : (
            <Nosso d={d} period={period} setPeriod={setPeriod} />
          )}
          {d.mode !== "invite" ? (
            <View style={{ alignItems: "center", gap: 4, paddingVertical: 4 }}>
              <UpdatedAt at={d.syncedAt} />
              <Txt size={12} color={colors.mutedForeground} center>Valores brutos, antes do IR. Ações e fundos mudam todo dia.</Txt>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Figure({ label, children, light }: { label: string; children: string; light?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt size={12} color={light ? colors.onPrimaryMuted : colors.mutedForeground}>{label}</Txt>
      <Txt size={15} weight="medium" tabular color={light ? "#fff" : undefined}>{children}</Txt>
    </View>
  );
}

function EvolutionCard({ points, period, setPeriod }: { points: EvolutionPoint[]; period: Period; setPeriod: (p: Period) => void }) {
  return (
    <View style={[box, { gap: 10 }]}>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt size={16} weight="semibold">Evolução</Txt>
        <View style={{ width: 160 }}><Segmented small value={period} onChange={setPeriod} options={PERIODS} label="Período" /></View>
      </Row>
      <Evolution points={points} />
    </View>
  );
}

function List({ assets, withdrawn, filter }: { assets: AssetView[]; withdrawn: AssetView[]; filter?: "todos" | "fixa" | "variavel" }) {
  const [showOld, setShowOld] = useState(false);
  const visible = assets.filter((a) => !filter || filter === "todos" || (filter === "fixa" ? a.cls === "fixed" : a.cls !== "fixed"));
  return (
    <>
      {visible.length > 0 ? <ListGroup>{visible.map((a) => <AssetRow key={a.id} a={a} />)}</ListGroup> : assets.length > 0 ? <EmptyState title={filter === "fixa" ? "Nenhum investimento de renda fixa" : "Nenhum investimento de renda variável"} /> : null}
      {withdrawn.length > 0 ? (
        <View style={[box, { padding: 0 }]}>
          <Press onPress={() => setShowOld(!showOld)} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <Txt size={14} weight="medium">{`${showOld ? "▾" : "▸"} Resgatados (${withdrawn.length})`}</Txt>
          </Press>
          {showOld ? <ListGroup style={{ borderWidth: 0, borderTopWidth: 1, borderRadius: 0 }}>{withdrawn.map((a) => <AssetRow key={a.id} a={a} />)}</ListGroup> : null}
        </View>
      ) : null}
    </>
  );
}

function Meu({ d, period, setPeriod }: { d: Extract<Data, { mode: "meu" }>; period: Period; setPeriod: (p: Period) => void }) {
  const color = d.me.color;
  return (
    <>
      <View style={{ gap: 6 }}>
        <Txt size={24} weight="medium" tracking={-0.48}>Meus investimentos</Txt>
        {d.seenText ? (
          <View style={{ alignSelf: "flex-start", borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: PERSON_TINT[color] }}>
            <Txt size={11} weight="medium" color={PERSON_BG[color]}>{d.seenText}</Txt>
          </View>
        ) : null}
      </View>
      {d.assets.length === 0 ? (
        <EmptyState title="Nenhum investimento aberto">
          {`Os investimentos chegam pelo Open Finance, junto com suas contas.${d.withdrawn.length ? ` Por enquanto o banco mandou ${d.withdrawn.length === 1 ? "1 investimento já resgatado" : `${d.withdrawn.length} investimentos já resgatados`}.` : ""} Você também pode cadastrar à mão.`}
        </EmptyState>
      ) : (
        <>
          <View style={[box, { gap: 16 }]}>
            <View style={{ gap: 6 }}>
              <Label>Meu patrimônio</Label>
              <Txt size={40} weight="medium" tabular tracking={-1.2} lh={44}>{formatBRL(d.summary.totalCents)}</Txt>
              <Row gap={8}><GainPill cents={d.summary.gainCents} ratio={d.summary.gainRatio} /><Txt size={13} color={colors.mutedForeground}>desde o início</Txt></Row>
            </View>
            <Row gap={8} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }}>
              <Figure label="Aplicado">{formatBRL(d.summary.investedCents)}</Figure>
              <View style={{ flex: 1, gap: 2 }}><Txt size={12} color={colors.mutedForeground}>Ganhos</Txt><Txt size={15} weight="medium" tabular color={UP}>{`+${formatBRL(d.summary.gainsCents)}`}</Txt></View>
              <View style={{ flex: 1, gap: 2 }}><Txt size={12} color={colors.mutedForeground}>Perdas</Txt><Txt size={15} weight="medium" tabular color={d.summary.lossesCents < 0 ? "#A8352A" : undefined}>{`${d.summary.lossesCents < 0 ? "−" : ""}${formatBRL(Math.abs(d.summary.lossesCents))}`}</Txt></View>
            </Row>
          </View>
          <EvolutionCard points={d.points} period={period} setPeriod={setPeriod} />
          <ClassBreakdown classes={d.summary.classes} />
        </>
      )}
      <View style={{ gap: 10 }}>
        <SectionHeader title="Minhas metas" action={<TextLink href="/couple/goals/new?de=meu" size={15}>Nova meta</TextLink>} />
        {d.myGoals.length === 0 ? (
          <Txt size={13} color={colors.mutedForeground} style={{ paddingHorizontal: 4 }}>Aposentadoria, curso, um sonho só seu: crie uma meta e faça seus investimentos contarem para ela.</Txt>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {d.myGoals.map((g) => (
              <Press key={g.id} href={`/couple/goals/${g.id}`} style={[box, { padding: 14, gap: 8, width: "48%" }]}>
                <Row gap={6}><TargetIcon size={14} color={color === "blue" ? "#2B4579" : "#8A4320"} strokeWidth={2} /><Txt size={12} weight="medium" color={color === "blue" ? "#2B4579" : "#8A4320"} numberOfLines={1} style={{ flex: 1 }}>{g.name}</Txt></Row>
                <Txt size={18} weight="medium" tabular>{formatBRL(g.savedCents)}</Txt>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}><View style={{ height: 6, width: `${Math.min(100, g.percent)}%`, backgroundColor: PERSON_BG[color] }} /></View>
                <Txt size={12} color={colors.mutedForeground} tabular>{`${g.percent}% de ${formatBRL(g.targetCents)}${g.deadlineLabel ? ` · ${g.deadlineLabel}` : ""}`}</Txt>
                {g.earnedCents > 0 ? <Txt size={12} tabular color={UP}>{`+${formatBRL(g.earnedCents)} rendidos`}</Txt> : null}
              </Press>
            ))}
          </View>
        )}
      </View>
      {d.assets.length + d.withdrawn.length > 0 ? (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Investimentos" action={<Txt size={12} color={colors.mutedForeground}>{d.assets.length === 1 ? "1 ativo" : `${d.assets.length} ativos`}</Txt>} />
          <List assets={d.assets} withdrawn={d.withdrawn} />
        </View>
      ) : null}
      {d.assets.length === 0 ? <Button href="/investments/new">Cadastrar à mão</Button> : null}
    </>
  );
}

function Nosso({ d, period, setPeriod }: { d: Extract<Data, { mode: "nosso" }>; period: Period; setPeriod: (p: Period) => void }) {
  const [filter, setFilter] = useState<"todos" | "fixa" | "variavel">("todos");
  // "Sempre juntos, sempre na mesma ordem": the blue person first.
  const names = (d.me.color === "blue" ? [d.me, d.partner!] : [d.partner!, d.me]).map((p) => p.name).join(" e ");
  return (
    <>
      <View style={{ gap: 4 }}>
        <Txt size={24} weight="medium" tracking={-0.48}>Investimentos</Txt>
        <Txt size={12} color={colors.mutedForeground}>{`Do casal · ${names} veem tudo`}</Txt>
      </View>
      {d.assets.length === 0 ? (
        <EmptyState title="Nenhum investimento no Nosso">Abra um investimento seu e escolha “Nosso” para que ele conte para os dois.</EmptyState>
      ) : (
        <>
          <View style={{ borderRadius: radius.lg, backgroundColor: colors.primary, padding: 20, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Label color={colors.onPrimaryMuted}>Patrimônio do casal</Label>
              <Txt size={40} weight="medium" tabular tracking={-1.2} lh={44} color="#fff">{formatBRL(d.summary.totalCents)}</Txt>
              <Row gap={8}><GainPill onPrimary cents={d.summary.gainCents} ratio={d.summary.gainRatio} /><Txt size={13} color={colors.onPrimaryMuted}>desde o início</Txt></Row>
            </View>
            <Row gap={8} style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)", paddingTop: 14 }}>
              <Figure light label="Aplicado">{formatBRL(d.summary.investedCents)}</Figure>
              <Figure light label={`Rendeu em ${d.monthLabel}`}>{d.monthGainCents === null ? "—" : `${d.monthGainCents >= 0 ? "+" : "−"}${formatBRL(Math.abs(d.monthGainCents))}`}</Figure>
              <Figure light label="Proventos">{formatBRL(d.incomeCents)}</Figure>
            </Row>
          </View>
          <EvolutionCard points={d.points} period={period} setPeriod={setPeriod} />
          <ClassBreakdown classes={d.summary.classes} note={d.assets.length === 1 ? "1 investimento" : `${d.assets.length} investimentos`} />
          {d.goals.length > 0 ? (
            <View style={{ gap: 10 }}>
              <SectionHeader title="Por meta" action={<TextLink href="/couple/goals" size={15}>Metas</TextLink>} />
              <ListGroup>
                {[
                  ...d.goals.map((g) => (
                    <Press key={g.id} href={`/couple/goals/${g.id}`} style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 6 }} pressedStyle={{ backgroundColor: colors.rowPress }}>
                      <Row style={{ justifyContent: "space-between" }}><Txt size={13} weight="medium" numberOfLines={1} style={{ flex: 1 }}>{g.name}</Txt><Txt size={13} weight="medium" tabular>{formatBRL(g.savedCents)}</Txt></Row>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}><View style={{ height: 6, width: `${Math.min(100, g.percent)}%`, backgroundColor: colors.primary }} /></View>
                      <Txt size={12} color={colors.mutedForeground}>{`${g.investmentCount === 0 ? "Sem investimentos" : g.investmentCount === 1 ? "1 investimento" : `${g.investmentCount} investimentos`} · ${g.percent}% de ${formatBRL(g.targetCents)}${g.earnedCents > 0 ? ` · +${formatBRL(g.earnedCents)} rendidos` : ""}`}</Txt>
                    </Press>
                  )),
                  d.free ? (
                    <View key="free" style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 2 }}>
                      <Row style={{ justifyContent: "space-between" }}><Txt size={13} weight="medium">Sem meta</Txt><Txt size={13} weight="medium" tabular>{formatBRL(d.free.cents)}</Txt></Row>
                      <Txt size={12} color={colors.mutedForeground}>{`${d.free.names} · livres para resgatar ou vincular`}</Txt>
                    </View>
                  ) : null,
                ]}
              </ListGroup>
            </View>
          ) : null}
          <View style={{ gap: 10 }}>
            <SectionHeader title="Investimentos" action={<Txt size={12} color={colors.mutedForeground}>{d.assets.length === 1 ? "1 ativo" : `${d.assets.length} ativos`}</Txt>} />
            <Segmented small value={filter} onChange={setFilter} options={[{ value: "todos", label: "Todos" }, { value: "fixa", label: "Renda fixa" }, { value: "variavel", label: "Variável" }]} label="Filtrar" />
            <List assets={d.assets} withdrawn={d.withdrawn} filter={filter} />
          </View>
        </>
      )}
      <View style={{ gap: 8 }}>
        <SectionHeader title="Fora do Nosso" />
        <ListGroup>
          <Row key="me" style={{ paddingHorizontal: 16, paddingVertical: 14, justifyContent: "space-between" }}>
            <View><Txt size={13} weight="medium">Você</Txt><Txt size={12} color={colors.mutedForeground}>Seus investimentos no Meu</Txt></View>
            <Txt size={13} weight="medium" tabular>{formatBRL(d.outside.myTotalCents)}</Txt>
          </Row>
          <Row key="partner" style={{ paddingHorizontal: 16, paddingVertical: 14, justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}><Txt size={13} weight="medium">{d.partner!.name}</Txt><Txt size={12} color={colors.mutedForeground}>{d.outside.partnerTotalCents === null ? "Não compartilha os investimentos do Meu" : d.outside.partnerShares ? "Total e os ativos que compartilha" : "Só o total"}</Txt></View>
            <Txt size={13} weight="medium" tabular>{d.outside.partnerTotalCents === null ? "—" : formatBRL(d.outside.partnerTotalCents)}</Txt>
          </Row>
        </ListGroup>
        {d.outside.shared.length > 0 ? <ListGroup>{d.outside.shared.map((a) => <AssetRow key={a.id} a={a} />)}</ListGroup> : null}
      </View>
    </>
  );
}
