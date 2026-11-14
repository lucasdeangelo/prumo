import { formatDayLabel, formatDayShort } from "@domain/dates";
import { formatAxisBRL, formatBRL } from "@domain/money";
import { memo, useMemo, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { G, Line as SvgLine, Path, Rect, Text as SvgText } from "react-native-svg";

import { useHideValues } from "@/lib/hide-values";
import { useSession } from "@/lib/session";

import { BankIcon, CalendarIcon, ChatIcon, EyeIcon, GiftIcon, LockIcon, SparkIcon, TotalsIcon, WalletIcon } from "./icons";
import { Card, Flex, HideValuesButton, Label, ListGroup, Press, Row, Txt } from "./kit";
import { colors, fonts, PERSON_BG, radius, segmentShadow, spaceColor, type Person, type PersonColor } from "./theme";

// ---------- Money ----------

/** Signed amount: entries carry "+", spending "−". Color is a secondary cue, the sign is primary. */
export const Amount = memo(function Amount({ cents, type, size = 15, color, weight = "medium" }: { cents: number; type?: "credit" | "debit" | "in" | "out"; size?: number; color?: string; weight?: "medium" | "semibold" }) {
  const positive = type === "credit" || type === "in";
  const negative = type === "debit" || type === "out";
  return (
    <Txt size={size} weight={weight} tabular numberOfLines={1} color={color ?? (positive ? colors.success : colors.foreground)} lh={Math.round(size * 1.25)}>
      {positive ? "+ " : negative ? "− " : ""}
      {formatBRL(cents)}
    </Txt>
  );
});

export const TagDot = ({ color, size = 8 }: { color?: string | null; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? colors.mutedForeground }} />
);

export function StatTile({ label, cents, tone, hint }: { label: string; cents: number; tone?: "in" | "out"; hint?: string }) {
  return (
    <View style={[styles.tile]}>
      <Row gap={6}>
        {tone ? <TagDot color={tone === "in" ? colors.income : colors.expense} /> : null}
        <Txt size={13} color={colors.mutedForeground}>{label}</Txt>
      </Row>
      <Txt size={19} weight="medium" tabular numberOfLines={1} adjustsFontSizeToFit>{formatBRL(cents)}</Txt>
      {hint ? <Txt size={12} color={colors.mutedForeground}>{hint}</Txt> : null}
    </View>
  );
}

/** Balance of the checking accounts; below zero means the overdraft is in use. */
export function BalanceCard({ balanceCents, hasBalance }: { balanceCents: number; hasBalance: boolean }) {
  return (
    <View style={styles.balance}>
      <Label color={colors.onPrimaryMuted}>Saldo em Conta</Label>
      {hasBalance ? (
        <Txt size={40} weight="medium" color="#ffffff" tabular tracking={-1.2} lh={44} adjustsFontSizeToFit numberOfLines={balanceCents < 0 ? 3 : 1}>
          {formatBRL(balanceCents)}
          {balanceCents < 0 ? " · usando o cheque especial" : ""}
        </Txt>
      ) : (
        <Txt size={28} weight="medium" color="#ffffff" tracking={-0.8} lh={32}>Conecte um banco em Ajustes para ver o saldo.</Txt>
      )}
    </View>
  );
}

// ---------- Couple ----------

export function Avatar({ person, size = 36, ring }: { person: Pick<Person, "initial" | "color">; size?: number; ring?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: PERSON_BG[person.color], alignItems: "center", justifyContent: "center", borderWidth: ring ? 2 : 0, borderColor: colors.background }}>
      <Txt size={Math.round(size * 0.36)} weight="semibold" color="#ffffff" lh={Math.round(size * 0.5)}>{person.initial}</Txt>
    </View>
  );
}

/** "Casal · avatares: sempre juntos, sempre na mesma ordem." */
export function CoupleAvatars({ people, size = 36 }: { people: Pick<Person, "initial" | "color" | "name">[]; size?: number }) {
  return (
    <View accessibilityLabel={people.map((p) => p.name).join(" e ")} style={{ flexDirection: "row" }}>
      {people.map((p, i) => (
        <View key={p.name + i} style={{ marginLeft: i === 0 ? 0 : -Math.round(size / 3) }}><Avatar person={p} size={size} ring /></View>
      ))}
    </View>
  );
}

/** 01 · Seletor de espaço: Meu | Nosso with the "who sees" caption. Switching is instant. */
export function SpaceSwitcher({ me, partner, hideValues }: { me: Person; partner: Person | null; hideValues?: boolean }) {
  const { space, setSpace } = useSession();
  const pair = partner ? (me.color === "blue" ? [me, partner] : [partner, me]) : [me];
  const caption = space === "nosso" ? `${pair.map((p) => p.name).join(" e ")} veem este espaço` : `Seu espaço. ${partner?.name ?? "Seu par"} só vê o que você compartilha.`;
  return (
    <View style={{ gap: 8 }}>
      <Row>
        <View style={styles.spaceTrack} accessibilityLabel="Espaço">
          {(["meu", "nosso"] as const).map((value) => {
            const active = value === space;
            return (
              <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setSpace(value)} style={[styles.spaceButton, active && styles.spaceActive]}>
                <Txt size={14} weight={active ? "semibold" : "medium"} color={active ? spaceColor(value, me.color) : colors.mutedForeground}>{value === "meu" ? "Meu" : "Nosso"}</Txt>
              </Pressable>
            );
          })}
        </View>
        {space === "nosso" && partner ? <CoupleAvatars people={pair} size={32} /> : <Avatar person={me} size={32} />}
        {hideValues ? <View style={{ marginLeft: -8, marginRight: -12 }}><HideValuesButton /></View> : null}
      </Row>
      <Txt size={13} color={colors.mutedForeground} style={{ paddingHorizontal: 4 }}>{caption}</Txt>
    </View>
  );
}

/** Small chip next to "Voltar": which space this belongs to and who sees it. */
export function SpaceChip({ space, caption, me }: { space: "meu" | "nosso"; caption: string; me: PersonColor }) {
  const color = spaceColor(space, me);
  return (
    <View style={styles.spaceChip}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Txt size={12} weight="medium" color={color} numberOfLines={1} style={{ flexShrink: 1 }}>{caption}</Txt>
    </View>
  );
}

export type VisibilityKind = "private" | "totals" | "details" | "hidden" | "category_only" | "surprise";
const VISIBILITY_LABEL = { private: "Só eu vejo", totals: "Só totais", details: "Com detalhes", hidden: "Oculto", category_only: "Só categoria" } as const;

/** 02 · Selo de visibilidade: 11px, radius 6, line border; icon + text. Only the surprise is colored. */
export function VisibilityBadge({ kind, partnerName, until }: { kind: VisibilityKind; partnerName?: string; until?: string }) {
  const text =
    kind === "surprise" ? `Surpresa até ${until ?? ""}` : kind === "hidden" ? `Oculto de ${partnerName ?? "seu par"}` : kind === "category_only" ? `${partnerName ?? "Seu par"} vê só categoria` : VISIBILITY_LABEL[kind];
  const surprise = kind === "surprise";
  const color = surprise ? "#8A4A1E" : colors.mutedForeground;
  const Icon = kind === "private" || kind === "hidden" ? LockIcon : kind === "totals" ? TotalsIcon : surprise ? GiftIcon : EyeIcon;
  return (
    <View style={[styles.visibility, surprise ? { borderColor: "#E8D9C7", backgroundColor: "#FBF4EC" } : { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Icon size={12} color={color} strokeWidth={2} />
      <Txt size={11} weight="medium" color={color} lh={14}>{text}</Txt>
    </View>
  );
}

const updatedFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** 06 · "Atualizado em": on every screen with balances. Tapping opens the daily update help. */
export function UpdatedAt({ at, state = "ok" }: { at: string | null | undefined; state?: "ok" | "expired" | "failed" }) {
  if (!at) return null;
  const [date, time] = updatedFormat.format(new Date(at)).split(/,?\s+/);
  const text = state === "failed" ? `Falhou hoje · dados de ${date}` : state === "expired" ? `Atualizado em ${date} · autorização vencida` : `Atualizado em ${date} às ${time}`;
  const ok = state === "ok";
  return (
    <Press href="/help/updates" style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 24 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ok ? colors.primary : colors.danger }} />
      <Txt size={13} color={ok ? colors.mutedForeground : colors.danger}>{text}</Txt>
    </Press>
  );
}

/** 04 · Barra de progresso: 8px, segments with 2px gap, always with the value in text nearby. */
export function SegmentBar({ segments, total, label }: { segments: { value: number; color: string }[]; total: number; label: string }) {
  const sum = segments.reduce((s, x) => s + x.value, 0);
  const scale = Math.max(total, sum, 1);
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={styles.bar}>
      {segments.filter((s) => s.value > 0).map((s, i) => <View key={i} style={{ width: `${(s.value / scale) * 100}%`, backgroundColor: s.color }} />)}
    </View>
  );
}

/** Budget bar: green inside, amber from 80%, red only when the household budget is over. */
export function BudgetBar({ spentCents, limitCents }: { spentCents: number; limitCents: number }) {
  const ratio = limitCents > 0 ? spentCents / limitCents : 0;
  const color = ratio > 1 ? colors.danger : ratio >= 0.8 ? colors.amber : colors.primary;
  return (
    <View accessibilityRole="image" accessibilityLabel={`${Math.round(ratio * 100)}% de ${formatBRL(limitCents)}`} style={[styles.bar, { gap: 0 }]}>
      <View style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

/** Row icon for an institution: two letters in a soft square ("Nu", "In", "XP"). */
export const InstitutionMark = memo(function InstitutionMark({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const short = name.replace(/[^A-Za-zÀ-ú0-9 ]/g, "").trim().slice(0, 2) || "?";
  const lower = name.toLowerCase();
  const bg = lower.includes("nu") ? "#820AD1" : lower.includes("inter") ? "#FF7A00" : lower.includes("itau") || lower.includes("itaú") ? "#EC7000" : lower.includes("xp") ? "#121512" : lower.includes("c6") ? "#242424" : "#5E625C";
  const d = size === "sm" ? 28 : 40;
  return (
    <View style={{ width: d, height: d, borderRadius: size === "sm" ? 7 : 10, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Txt size={size === "sm" ? 11 : 13} weight="semibold" color="#ffffff">{short.charAt(0).toUpperCase() + short.slice(1).toLowerCase()}</Txt>
    </View>
  );
});

// ---------- Transactions ----------

export type ListTx = { id: string; label: string; tagId: string | null; source: string; auto: boolean; cents: number; type: "credit" | "debit"; date: string };
export type TagView = { id: string; name: string; color: string | null };

const SOURCE_ICON = { pluggy: BankIcon, whatsapp: ChatIcon, manual: WalletIcon, upcoming_reconciliation: CalendarIcon } as const;

/** One row of the "Lançamentos" component: origin badge, label, tag (✦ when automatic), amount. */
export const TransactionRow = memo(function TransactionRow({ tx, tag }: { tx: ListTx; tag?: TagView }) {
  const Icon = SOURCE_ICON[tx.source as keyof typeof SOURCE_ICON] ?? WalletIcon;
  return (
    <Press href={`/transactions/${tx.id}`} style={styles.txRow} pressedStyle={{ backgroundColor: colors.rowPress }}>
      <View style={styles.origin}><Icon size={20} color={colors.primary} /></View>
      <Flex>
        <Txt size={15} weight="medium" numberOfLines={1}>{tx.label}</Txt>
        <Row gap={6} style={{ marginTop: 2 }}>
          <TagDot color={tag?.color} />
          <Txt size={13} color={colors.mutedForeground} numberOfLines={1} style={{ flexShrink: 1 }}>{tag?.name ?? "Sem tag"}</Txt>
          {tx.auto ? <SparkIcon size={12} color={colors.mutedForeground} /> : null}
        </Row>
      </Flex>
      <Amount cents={tx.cents} type={tx.type} />
    </Press>
  );
});

/** Ungrouped list (Recentes). Long, day-grouped lists use a virtualized list instead (Mês). */
export function TransactionList({ transactions, tags }: { transactions: ListTx[]; tags: TagView[] }) {
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  return <ListGroup>{transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} tag={tx.tagId ? byId.get(tx.tagId) : undefined} />)}</ListGroup>;
}

export const DayHeader = ({ date }: { date: string }) => <Label style={{ paddingHorizontal: 4, marginBottom: 8 }}>{formatDayLabel(date)}</Label>;

// ---------- Charts ----------

export type CategoryRow = { tagId: string | null; name: string; color: string | null; cents: number; href?: string };

/** Spending by tag as labelled horizontal bars (magnitude, one hue). */
export function CategoryBars({ rows, totalCents, limit = 6, onPress }: { rows: CategoryRow[]; totalCents: number; limit?: number; onPress?: (row: CategoryRow) => void }) {
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit).reduce((sum, r) => sum + r.cents, 0);
  const all = rest > 0 ? [...shown, { tagId: "rest", name: "Outras tags", color: null, cents: rest }] : shown;
  const max = Math.max(...all.map((r) => r.cents), 1);
  return (
    <View style={{ gap: 12 }}>
      {all.map((row) => {
        const share = totalCents > 0 ? Math.round((row.cents / totalCents) * 100) : 0;
        const body = (
          <>
            <Row gap={8} style={{ marginBottom: 4 }}>
              <TagDot color={row.color} />
              <Txt size={14} numberOfLines={1} style={{ flex: 1 }}>{row.name}</Txt>
              <Txt size={14} weight="medium" tabular>{formatBRL(row.cents)}</Txt>
              <Txt size={12} color={colors.mutedForeground} tabular style={{ width: 36, textAlign: "right" }}>{share}%</Txt>
            </Row>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted }}>
              <View style={{ height: 8, borderRadius: 4, width: `${Math.max(2, (row.cents / max) * 100)}%`, backgroundColor: colors.expense }} />
            </View>
          </>
        );
        return onPress && row.tagId !== "rest" ? <Press key={row.tagId ?? "none"} onPress={() => onPress(row)}>{body}</Press> : <View key={row.tagId ?? "none"}>{body}</View>;
      })}
    </View>
  );
}

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  return [width, (e) => setWidth(Math.round(e.nativeEvent.layout.width))];
}

const AXIS = 54;
const axisText = { fill: colors.chartAxis, fontSize: 11, fontFamily: fonts.regular };

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return dashed ? <View style={{ width: 16, borderTopWidth: 2, borderStyle: "dashed", borderColor: color }} /> : <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />;
}

export type MonthBar = { month: string; label: string; incomeCents: number; expenseCents: number };

/** Income vs spending per month: two series, legend above, tap a month for its numbers. */
export function IncomeExpenseBars({ data }: { data: MonthBar[] }) {
  const hidden = useHideValues();
  const [width, onLayout] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const height = 192;
  const plotH = height - 22;
  const ticks = niceTicks(Math.max(1, ...data.flatMap((d) => [d.incomeCents, d.expenseCents])));
  const top = ticks[ticks.length - 1] || 1;
  const band = data.length ? (width - AXIS) / data.length : 0;
  const bar = Math.min(18, band * 0.36 - 1);
  const y = (v: number) => 4 + (plotH - 4) * (1 - v / top);
  const row = active !== null ? data[active] : null;
  return (
    <View>
      <Row gap={16} style={{ marginBottom: 8 }}>
        <Row gap={6}><Swatch color={colors.income} /><Txt size={12} color={colors.mutedForeground}>Entradas</Txt></Row>
        <Row gap={6}><Swatch color={colors.expense} /><Txt size={12} color={colors.mutedForeground}>Saídas</Txt></Row>
      </Row>
      <Pressable
        onLayout={onLayout}
        accessibilityLabel={hidden ? "Entradas e saídas por mês, valores ocultos" : data.map((d) => `${d.label}: entradas ${formatBRL(d.incomeCents)}, saídas ${formatBRL(d.expenseCents)}`).join(". ")}
        onPress={(e) => {
          const i = Math.floor((e.nativeEvent.locationX - AXIS) / band);
          setActive(i >= 0 && i < data.length && i !== active ? i : null);
        }}
        style={{ height }}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {ticks.map((t) => (
              <SvgLine key={t} x1={AXIS} x2={width} y1={y(t)} y2={y(t)} stroke={colors.chartGrid} strokeWidth={1} />
            ))}
            {hidden ? null : ticks.map((t) => (
              <SvgText key={`l${t}`} x={AXIS - 6} y={y(t) + 4} textAnchor="end" {...axisText}>{formatAxisBRL(t)}</SvgText>
            ))}
            {data.map((d, i) => {
              const cx = AXIS + band * i + band / 2;
              return (
                <G key={d.month}>
                  {active === i ? <Rect key={`h${d.month}`} x={AXIS + band * i} y={0} width={band} height={plotH} fill={colors.muted} opacity={0.6} /> : null}
                  <Path key={`i${d.month}`} d={barPath(cx - bar - 1, y(d.incomeCents), bar, plotH - y(d.incomeCents))} fill={colors.income} />
                  <Path key={`e${d.month}`} d={barPath(cx + 1, y(d.expenseCents), bar, plotH - y(d.expenseCents))} fill={colors.expense} />
                  <SvgText key={`x${d.month}`} x={cx} y={height - 4} textAnchor="middle" {...axisText}>{d.label}</SvgText>
                </G>
              );
            })}
          </Svg>
        ) : null}
      </Pressable>
      {row ? (
        <View style={styles.tooltip}>
          <Txt size={12} weight="semibold" style={{ textTransform: "capitalize" }}>{row.label}</Txt>
          <Row gap={8}><Swatch color={colors.income} /><Txt size={12} style={{ flex: 1 }}>Entradas</Txt><Txt size={12} weight="medium" tabular>{formatBRL(row.incomeCents)}</Txt></Row>
          <Row gap={8}><Swatch color={colors.expense} /><Txt size={12} style={{ flex: 1 }}>Saídas</Txt><Txt size={12} weight="medium" tabular>{formatBRL(row.expenseCents)}</Txt></Row>
          <Row style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4, marginTop: 2 }}>
            <Txt size={12} color={colors.mutedForeground} style={{ flex: 1 }}>Resultado</Txt>
            <Txt size={12} color={colors.mutedForeground} tabular>{formatBRL(row.incomeCents - row.expenseCents)}</Txt>
          </Row>
        </View>
      ) : null}
    </View>
  );
}

/** Rect with the top corners rounded (radius 4), like the web bars. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0 || w <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

export type CumulativePoint = { day: number; expenseCents: number | null; previousCents: number | null };

/** Spending accumulated through the month, against the previous month as a dashed reference. */
export function CumulativeLine({ data }: { data: CumulativePoint[] }) {
  const hidden = useHideValues();
  const [width, onLayout] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const height = 176;
  const plotH = height - 22;
  const ticks = niceTicks(Math.max(1, ...data.flatMap((d) => [d.expenseCents ?? 0, d.previousCents ?? 0])));
  const top = ticks[ticks.length - 1] || 1;
  const span = Math.max(1, data.length - 1);
  const x = (i: number) => AXIS + 6 + ((width - AXIS - 12) * i) / span;
  const y = (v: number) => 6 + (plotH - 6) * (1 - v / top);
  const line = (key: "expenseCents" | "previousCents") =>
    data.reduce((d, p, i) => (p[key] === null ? d : `${d}${d && data[i - 1]?.[key] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]!).toFixed(1)}`), "");
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor((width - AXIS) / 28))));
  const point = active !== null ? data[active] : null;
  return (
    <View>
      <Row gap={16} style={{ marginBottom: 8 }}>
        <Row gap={6}><View style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: colors.expense }} /><Txt size={12} color={colors.mutedForeground}>Este mês</Txt></Row>
        <Row gap={6}><Swatch color={colors.chartAxis} dashed /><Txt size={12} color={colors.mutedForeground}>Mês anterior</Txt></Row>
      </Row>
      <Pressable
        onLayout={onLayout}
        onPress={(e) => {
          const i = Math.round(((e.nativeEvent.locationX - AXIS - 6) / (width - AXIS - 12)) * span);
          setActive(i >= 0 && i < data.length && i !== active ? i : null);
        }}
        style={{ height }}
      >
        {width > 0 && data.length > 0 ? (
          <Svg width={width} height={height}>
            {ticks.map((t) => <SvgLine key={t} x1={AXIS} x2={width} y1={y(t)} y2={y(t)} stroke={colors.chartGrid} strokeWidth={1} />)}
            {hidden ? null : ticks.map((t) => <SvgText key={`l${t}`} x={AXIS - 6} y={y(t) + 4} textAnchor="end" {...axisText}>{formatAxisBRL(t)}</SvgText>)}
            {data.map((p, i) => (i % labelEvery === 0 || i === data.length - 1 ? <SvgText key={`d${p.day}`} x={x(i)} y={height - 4} textAnchor="middle" {...axisText}>{p.day}</SvgText> : null))}
            {active !== null ? <SvgLine x1={x(active)} x2={x(active)} y1={6} y2={plotH} stroke={colors.chartAxis} strokeDasharray="3 3" /> : null}
            <Path d={line("previousCents")} stroke={colors.chartAxis} strokeWidth={2} strokeDasharray="4 4" fill="none" />
            <Path d={line("expenseCents")} stroke={colors.expense} strokeWidth={2} fill="none" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </Pressable>
      {point ? (
        <View style={styles.tooltip}>
          <Txt size={12} weight="semibold">Dia {point.day}</Txt>
          {point.expenseCents !== null ? <Row><Txt size={12} style={{ flex: 1 }}>Este mês</Txt><Txt size={12} weight="medium" tabular>{formatBRL(point.expenseCents)}</Txt></Row> : null}
          {point.previousCents !== null ? <Row><Txt size={12} color={colors.mutedForeground} style={{ flex: 1 }}>Mês anterior</Txt><Txt size={12} color={colors.mutedForeground} tabular>{formatBRL(point.previousCents)}</Txt></Row> : null}
        </View>
      ) : null}
    </View>
  );
}

// ---------- Small shared rows ----------

/** Forecast line ("Próximos 14 dias"). */
export function ForecastLine({ date, description, state, amountCents, direction }: { date: string; description: string; state: string; amountCents: number; direction: "in" | "out" }) {
  return (
    <Row gap={12}>
      <Txt size={12} color={colors.mutedForeground} tabular style={{ width: 44 }}>{formatDayShort(date)}</Txt>
      <Txt size={14} numberOfLines={1} style={{ flex: 1 }}>{description}</Txt>
      <StateBadgeInline state={state} />
      <Amount cents={amountCents} type={direction} size={14} />
    </Row>
  );
}

function StateBadgeInline({ state }: { state: string }) {
  const map: Record<string, [string, string, string]> = {
    overdue: ["Vencida", colors.dangerBg, colors.danger],
    confirmed: ["Registrada", colors.secondary, colors.secondaryForeground],
    predicted: ["Prevista", colors.muted, colors.mutedForeground],
  };
  const [label, bg, fg] = map[state] ?? map.predicted;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Txt size={11} weight="medium" color={fg} lh={16}>{label}</Txt>
    </View>
  );
}

export { Card };

const styles = StyleSheet.create({
  tile: { flex: 1, gap: 6, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 14 },
  balance: { gap: 8, borderRadius: radius.lg, backgroundColor: colors.primary, padding: 24 },
  spaceTrack: { flex: 1, flexDirection: "row", gap: 4, borderRadius: radius.full, backgroundColor: colors.muted, padding: 4 },
  spaceButton: { flex: 1, minHeight: 40, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  spaceActive: { backgroundColor: colors.card, ...segmentShadow },
  spaceChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.full, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 4, flexShrink: 1 },
  visibility: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" },
  bar: { height: 8, flexDirection: "row", gap: 2, overflow: "hidden", borderRadius: 4, backgroundColor: colors.border },
  txRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  origin: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  tooltip: { marginTop: 8, gap: 2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 8 },
});
