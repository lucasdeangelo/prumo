import { formatBRL } from "@domain/money";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { CheckIcon, TargetIcon } from "@/ui/icons";
import { AssetTile, Evolution, GainPill, LinkCard, UP, DOWN, type AssetClass, type EvolutionPoint } from "@/ui/investments";
import { Button, ListGroup, PageHeader, Press, Row, SectionHeader, Segmented, TextLink, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius } from "@/ui/theme";

type Period = "6m" | "1a" | "tudo";
type Line = { label: string; note?: string; cents?: number; text?: string; sign?: "+" | "−" | "≈" | "±"; tone?: "up" | "down"; strong?: boolean };
type GoalCard = { goalId: string; scope: "mine" | "ours"; name: string; percent: number; savedCents: number; targetCents: number; deadlineLabel: string | null; partCents: number | null; maturesBefore: string | null };
type Data = {
  id: string;
  name: string;
  badge: string;
  cls: AssetClass;
  subtitle: string;
  fixed: boolean;
  withdrawn: boolean;
  amountCents: number;
  gain: { cents: number; ratio: number | null } | null;
  gainCaption: string;
  hasBasis: boolean;
  chip: { text: string; tone: "ours" | "mine" | "partner" } | null;
  points: EvolutionPoint[];
  loss: boolean;
  lines: Line[];
  noAdvice: string | null;
  movements: { id: string; label: string; dateLabel: string; quantity: number | null; unit: string; amountCents: number }[];
  appliedOn: { date: string; cents: number } | null;
  goalCards: GoalCard[];
  owner: boolean;
  canLink: boolean;
  manual: { valuation: "index" | "quote" | "total"; open: boolean } | null;
  preferences: { scope: "mine" | "ours"; visibility: "private" | "totals" | "details"; partnerName: string | null } | null;
  footer: string[];
};

const PERIODS: { value: Period; label: string }[] = [{ value: "6m", label: "6M" }, { value: "1a", label: "1A" }, { value: "tudo", label: "Tudo" }];
const box = { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card } as const;
const CHIP = { ours: { bg: "#E3EDE8", fg: "#123329" }, mine: { bg: "#E6ECF6", fg: "#2B4579" }, partner: { bg: "#F6E8DE", fg: "#8A4320" } } as const;

export default function InvestmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [period, setPeriod] = useState<Period>("6m");
  return (
    <Screen<Data> path={`investments/${id}${period === "6m" ? "" : `?periodo=${period}`}`} gap={16} fallbackBack="/investments">
      {(d) => <Detail d={d} period={period} setPeriod={setPeriod} />}
    </Screen>
  );
}

function money(line: Line): string {
  if (line.text) return line.text;
  if (line.cents === undefined) return "";
  return `${line.sign === "≈" ? "≈ " : line.sign ?? ""}${formatBRL(line.cents)}`;
}

function Detail({ d, period, setPeriod }: { d: Data; period: Period; setPeriod: (p: Period) => void }) {
  return (
    <>
      <PageHeader back="/investments" action={d.chip ? <View style={{ borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: CHIP[d.chip.tone].bg }}><Txt size={11} weight="medium" color={CHIP[d.chip.tone].fg}>{d.chip.text}</Txt></View> : undefined} />
      <Row gap={12} style={{ alignItems: "flex-start" }}>
        <AssetTile badge={d.badge} cls={d.cls} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={22} weight="medium" tracking={-0.44} lh={26}>{d.name}</Txt>
          <Txt size={13} color={colors.mutedForeground}>{d.subtitle}</Txt>
        </View>
      </Row>
      <View style={{ gap: 8 }}>
        <Txt size={40} weight="medium" tabular tracking={-1.2} lh={44}>{formatBRL(d.amountCents)}</Txt>
        {d.gain ? (
          <Row gap={8}><GainPill cents={d.gain.cents} ratio={d.gain.ratio} /><Txt size={13} color={colors.mutedForeground}>{d.gainCaption}</Txt></Row>
        ) : (
          <Txt size={13} color={colors.mutedForeground}>{d.withdrawn ? "Resgatado. Os números abaixo são do último valor informado." : "O banco não informou quanto foi aplicado."}</Txt>
        )}
      </View>

      <View style={[box, { padding: 18, gap: 10 }]}>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt size={16} weight="semibold">Evolução</Txt>
          <View style={{ width: 160 }}><Segmented small value={period} onChange={setPeriod} options={PERIODS} label="Período" /></View>
        </Row>
        <Evolution points={d.points} valueLabel="Valor bruto" investedLabel="Aplicado" color={d.loss ? DOWN : undefined} />
      </View>

      <View style={[box, { paddingHorizontal: 18, paddingVertical: 6 }]}>
        {d.lines.map((l, i) => (
          <Row key={l.label} style={{ justifyContent: "space-between", paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <Txt size={14} weight={l.strong ? "medium" : "regular"} color={l.strong ? colors.foreground : colors.mutedForeground} style={{ flex: 1 }}>
              {l.label}{l.note ? <Txt size={12} color={colors.mutedForeground}>{` ${l.note}`}</Txt> : null}
            </Txt>
            <Txt size={14} weight={l.strong ? "medium" : "regular"} tabular color={l.tone === "up" ? UP : l.tone === "down" ? DOWN : colors.foreground}>{money(l)}</Txt>
          </Row>
        ))}
      </View>

      {d.goalCards.length > 0
        ? d.goalCards.map((g) => (
            <View key={g.goalId} style={[box, { padding: 18, gap: 14, borderColor: g.scope === "ours" ? "#C8DCD2" : colors.border }]}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row gap={5} style={{ borderRadius: radius.full, paddingLeft: 6, paddingRight: 8, paddingVertical: 3, backgroundColor: g.scope === "ours" ? "#E3EDE8" : "#E6ECF6" }}>
                  <TargetIcon size={12} color={g.scope === "ours" ? "#123329" : "#2B4579"} strokeWidth={2} />
                  <Txt size={11} weight="medium" color={g.scope === "ours" ? "#123329" : "#2B4579"}>{g.scope === "ours" ? "Meta do casal" : "Minha meta"}</Txt>
                </Row>
                {d.canLink ? <TextLink href={`/investments/${d.id}/link`}>Trocar</TextLink> : null}
              </Row>
              <Press href={`/couple/goals/${g.goalId}`} style={{ gap: 8 }}>
                <Row style={{ justifyContent: "space-between" }}><Txt size={15} weight="medium" style={{ flex: 1 }}>{g.name}</Txt><Txt size={13} tabular color={colors.mutedForeground}>{`${g.percent}%`}</Txt></Row>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" }}><View style={{ height: 8, width: `${Math.min(100, g.percent)}%`, backgroundColor: colors.primary }} /></View>
                <Txt size={12} tabular color={colors.mutedForeground}>{`${formatBRL(g.savedCents)} de ${formatBRL(g.targetCents)}${g.deadlineLabel ? ` · prazo ${g.deadlineLabel}` : ""}${g.partCents ? ` · este investimento conta ${formatBRL(g.partCents)}` : ""}`}</Txt>
              </Press>
              {g.maturesBefore ? (
                <Row gap={10} style={{ alignItems: "flex-start", borderRadius: radius.md, backgroundColor: "#E3EDE8", paddingHorizontal: 14, paddingVertical: 12 }}>
                  <CheckIcon size={18} color="#123329" strokeWidth={2} />
                  <Txt size={13} color="#123329" style={{ flex: 1 }}>{`Vence em ${g.maturesBefore}, antes do prazo da meta.`}</Txt>
                </Row>
              ) : null}
            </View>
          ))
        : d.canLink ? <LinkCard href={`/investments/${d.id}/link`} /> : null}

      {d.owner && d.manual?.open ? <ManualActions id={d.id} how={d.manual.valuation} /> : null}

      {d.noAdvice ? (
        <View style={[box, { paddingHorizontal: 16, paddingVertical: 14 }]}>
          <Txt size={13} color={colors.mutedForeground}>{d.noAdvice}</Txt>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHeader title="Movimentações" />
        {d.movements.length > 0 ? (
          <ListGroup>
            {d.movements.map((m) => (
              <Row key={m.id} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt size={13} weight="medium">{m.label}</Txt>
                  <Txt size={12} color={colors.mutedForeground}>{`${m.dateLabel}${m.quantity ? ` · ${m.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} ${m.unit}` : ""}`}</Txt>
                </View>
                <Txt size={13} weight="medium" tabular>{formatBRL(m.amountCents)}</Txt>
              </Row>
            ))}
          </ListGroup>
        ) : (
          <View style={[box, { paddingHorizontal: 16, paddingVertical: 14, gap: 2 }]}>
            {d.appliedOn ? <Txt size={13}>{`Aplicado em ${d.appliedOn.date}: ${formatBRL(d.appliedOn.cents)}`}</Txt> : null}
            <Txt size={13} color={colors.mutedForeground}>O banco não enviou as movimentações deste investimento.</Txt>
          </View>
        )}
      </View>

      {d.preferences ? <Preferences id={d.id} p={d.preferences} manual={Boolean(d.manual)} /> : null}

      <View style={{ alignItems: "center", gap: 4, paddingVertical: 4 }}>
        {d.footer.map((f) => <Txt key={f} size={12} color={colors.mutedForeground} center>{f}</Txt>)}
      </View>
    </>
  );
}

/** D4: movement buttons only on assets typed by hand. */
function ManualActions({ id, how }: { id: string; how: "index" | "quote" | "total" }) {
  const href = (tipo: string) => `/investments/${id}/movement?tipo=${tipo}`;
  return (
    <View style={{ gap: 10 }}>
      <Row gap={10}>
        <View style={{ flex: 1 }}><Button variant="outline" href={href(how === "quote" ? "venda" : "resgate")}>{how === "quote" ? "Registrar venda" : "Resgatar"}</Button></View>
        <View style={{ flex: 1 }}><Button href={href(how === "quote" ? "compra" : "aporte")}>{how === "quote" ? "Registrar compra" : "Registrar aporte"}</Button></View>
      </Row>
      {how === "quote" ? <TextLink href={href("cotacao")} size={15}>Atualizar cotação</TextLink> : null}
      {how === "total" ? <TextLink href={href("valor")} size={15}>Atualizar valor</TextLink> : null}
    </View>
  );
}

function Preferences({ id, p, manual }: { id: string; p: NonNullable<Data["preferences"]>; manual: boolean }) {
  const pref = useAction("investmentPreference");
  const remove = useAction("deleteManual");
  const set = (field: "scope" | "visibility" | "include", value: string) => pref.run({ id, field, value, returnTo: field === "include" ? "/investments" : `/investments/${id}` });
  return (
    <View style={[box, { padding: 18, gap: 16 }]}>
      <Txt size={16} weight="semibold">Este investimento</Txt>
      {p.partnerName ? (
        <View style={{ gap: 8 }}>
          <Txt size={13} weight="medium">De quem é</Txt>
          <Segmented value={p.scope} onChange={(v) => set("scope", v)} options={[{ value: "mine", label: "Meu" }, { value: "ours", label: "Nosso" }]} label="De quem é" />
          <Txt size={12} color={colors.mutedForeground}>{p.scope === "ours" ? `Investimentos do Nosso aparecem para você e ${p.partnerName}, com os detalhes.` : "Só conta no seu espaço Meu."}</Txt>
        </View>
      ) : null}
      {p.partnerName && p.scope === "mine" ? (
        <View style={{ gap: 8 }}>
          <Txt size={13} weight="medium">{`O que ${p.partnerName} vê`}</Txt>
          <Segmented small value={p.visibility} onChange={(v) => set("visibility", v)} options={[{ value: "private", label: "Nada" }, { value: "totals", label: "Só o total" }, { value: "details", label: "Detalhes" }]} label={`O que ${p.partnerName} vê`} />
        </View>
      ) : null}
      {manual ? (
        <View style={{ gap: 4 }}>
          <Button variant="ghost" pending={remove.pending} onPress={() => remove.run({ id })}>Apagar este investimento</Button>
          <Txt size={12} color={colors.mutedForeground} center>Some das telas, dos totais e das metas.</Txt>
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <Button variant="ghost" pending={pref.pending} onPress={() => set("include", "false")}>Não trazer este investimento</Button>
          <Txt size={12} color={colors.mutedForeground} center>Some das telas e dos totais. Dá para trazer de volta em Ajustes → Conexões.</Txt>
        </View>
      )}
    </View>
  );
}
