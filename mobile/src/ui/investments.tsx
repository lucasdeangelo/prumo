// Investment pieces from the design ("InvMeu", "InvNosso", "InvCDB", "InvAcao"), as on the web.
import { formatBRL } from "@domain/money";
import { useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Path, Line as SvgLine } from "react-native-svg";

import { useHideValues } from "@/lib/hide-values";
import { LinkIcon, TargetIcon } from "@/ui/icons";
import { Press, Row, Txt } from "@/ui/kit";
import { colors, fonts, radius } from "@/ui/theme";

export type AssetClass = "fixed" | "equity" | "real_estate" | "funds" | "pension" | "crypto" | "other";

/** One color per asset class, fixed (validated on the web: every pair apart for color-blind readers). */
export const CLASS_COLOR: Record<AssetClass, string> = {
  fixed: "#1D4D3F",
  equity: "#3A5BA0",
  real_estate: "#B4582A",
  crypto: "#D4A72C",
  funds: "#9B6BC0",
  pension: "#8C908A",
  other: "#C9CCC6",
};

const TILE: Record<AssetClass, { bg: string; fg: string }> = {
  fixed: { bg: "#E3EDE8", fg: "#123329" },
  equity: { bg: "#E6ECF6", fg: "#2B4579" },
  real_estate: { bg: "#F6E8DE", fg: "#8A4320" },
  crypto: { bg: "#F5EDD8", fg: "#5E4200" },
  funds: { bg: "#EFE8F6", fg: "#5A3D7A" },
  pension: { bg: colors.muted, fg: colors.mutedForeground },
  other: { bg: colors.muted, fg: colors.mutedForeground },
};

export const UP = "#2B7350";
export const DOWN = "#A8352A";

export function AssetTile({ badge, cls, size = 40 }: { badge: string; cls: AssetClass; size?: number }) {
  const t = TILE[cls] ?? TILE.other;
  return (
    <View style={{ width: size, height: size, borderRadius: size >= 48 ? 12 : 10, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>
      <Txt mono size={size >= 48 ? 11 : 10} weight="medium" color={t.fg}>{badge}</Txt>
    </View>
  );
}

const pct = (ratio: number) => `${ratio >= 0 ? "+" : "−"}${Math.abs(ratio * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
export const signedBRL = (cents: number) => `${cents >= 0 ? "+" : "−"}${formatBRL(Math.abs(cents))}`;

/** "▲ +R$ 400,00 · +6,90%": arrow and sign carry the meaning, color only repeats it. */
export function GainPill({ cents, ratio, onPrimary }: { cents: number; ratio: number | null; onPrimary?: boolean }) {
  const up = cents >= 0;
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: onPrimary ? "rgba(255,255,255,0.15)" : up ? "#E4F0E9" : "#F7E4E1" }}>
      <Txt size={11} weight="medium" tabular color={onPrimary ? "#fff" : up ? "#1F5A3D" : "#8F2C22"}>{`${up ? "▲" : "▼"} ${signedBRL(cents)}${ratio !== null ? ` · ${pct(ratio)}` : ""}`}</Txt>
    </View>
  );
}

export function GainText({ cents, ratio, size = 12 }: { cents: number; ratio?: number | null; size?: number }) {
  return <Txt size={size} tabular color={cents >= 0 ? UP : DOWN}>{`${signedBRL(cents)}${ratio != null ? ` · ${pct(ratio)}` : ""}`}</Txt>;
}

export type Chip = { label: string; tone: "ours" | "mine" | "none" } | null;

export function GoalChip({ chip }: { chip: Chip }) {
  if (!chip) return null;
  const tone = chip.tone === "ours" ? { bg: "#E3EDE8", fg: "#123329" } : chip.tone === "mine" ? { bg: "#E6ECF6", fg: "#2B4579" } : { bg: "transparent", fg: colors.mutedForeground };
  return (
    <Row gap={5} style={{ alignSelf: "flex-start", marginTop: 6, borderRadius: radius.full, paddingLeft: 6, paddingRight: 8, paddingVertical: 3, backgroundColor: tone.bg, ...(chip.tone === "none" ? { borderWidth: 1, borderStyle: "dashed", borderColor: "#C9CCC6" } : {}) }}>
      <TargetIcon size={12} color={tone.fg} strokeWidth={2} />
      <Txt size={11} weight="medium" color={tone.fg} numberOfLines={1} style={{ flexShrink: 1 }}>{chip.label}</Txt>
    </Row>
  );
}

export type AssetView = {
  id: string;
  name: string;
  badge: string;
  cls: AssetClass;
  describe: string;
  amountCents: number;
  gain: { cents: number; ratio: number | null } | null;
  withdrawn: boolean;
  owner: string | null;
  chip: Chip;
  note?: string | null;
  status?: string;
};

/** One line of an investment list. */
export function AssetRow({ a, href, extra }: { a: AssetView; href?: string; extra?: string | null }) {
  return (
    <Press href={href ?? `/investments/${a.id}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 14 }} pressedStyle={{ backgroundColor: colors.rowPress }}>
      <AssetTile badge={a.badge} cls={a.cls} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={13} weight="medium" numberOfLines={1}>{a.name}</Txt>
        <Txt size={12} color={colors.mutedForeground}>{a.describe}</Txt>
        {a.owner ? <Txt size={12} color={colors.mutedForeground}>De {a.owner}</Txt> : null}
        {a.note ? <Txt size={12} color={colors.mutedForeground}>{a.note}</Txt> : null}
        {extra ? <Txt size={12} color={colors.mutedForeground}>{extra}</Txt> : null}
        <GoalChip chip={a.chip} />
      </View>
      <View style={{ alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
        <Txt size={13} weight="medium" tabular>{formatBRL(a.amountCents)}</Txt>
        {a.gain ? <GainText cents={a.gain.cents} ratio={a.gain.ratio} /> : null}
      </View>
    </Press>
  );
}

/** "Onde está": one bar split by class with 2px gaps, then each class with value and share. */
export function ClassBreakdown({ classes, note }: { classes: { cls: AssetClass; label: string; cents: number; ratio: number }[]; note?: string }) {
  return (
    <View style={{ gap: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 18 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt size={16} weight="semibold">Onde está</Txt>
        {note ? <Txt size={12} color={colors.mutedForeground}>{note}</Txt> : null}
      </Row>
      <View accessibilityLabel={classes.map((c) => `${c.label} ${Math.round(c.ratio * 100)}%`).join(", ")} style={{ height: 10, borderRadius: 5, overflow: "hidden", flexDirection: "row", gap: 2, backgroundColor: colors.border }}>
        {classes.filter((c) => c.cents > 0).map((c) => <View key={c.cls} style={{ flex: c.ratio, backgroundColor: CLASS_COLOR[c.cls] }} />)}
      </View>
      <View style={{ gap: 8 }}>
        {classes.map((c) => (
          <Row key={c.cls} gap={12}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CLASS_COLOR[c.cls] }} />
            <Txt size={13} style={{ flex: 1 }}>{c.label}</Txt>
            <Txt size={13} weight="medium" tabular>{formatBRL(c.cents)}</Txt>
            <Txt size={12} tabular color={colors.mutedForeground} style={{ width: 36, textAlign: "right" }}>{`${Math.round(c.ratio * 100)}%`}</Txt>
          </Row>
        ))}
      </View>
    </View>
  );
}

export type EvolutionPoint = { date: string; label: string; amountCents: number; investedCents: number };

/**
 * Value against what was put in: line over a light fill, invested dashed. Tap a point to read it.
 */
export function Evolution({ points, valueLabel = "Patrimônio", investedLabel = "Valor aplicado", color = colors.income }: { points: EvolutionPoint[]; valueLabel?: string; investedLabel?: string; color?: string }) {
  const hidden = useHideValues();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 2) return <Txt size={13} color={colors.mutedForeground}>A evolução aparece conforme o Prumo acompanha seus investimentos: um ponto a cada atualização.</Txt>;
  const height = 128;
  const plot = height - 22;
  const values = points.flatMap((p) => [p.amountCents, p.investedCents]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, (max - min) * 0.15);
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const x = (i: number) => 8 + ((width - 16) * i) / (points.length - 1);
  const y = (v: number) => 6 + (plot - 12) * (1 - (v - lo) / (hi - lo || 1));
  const path = (key: "amountCents" | "investedCents") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const area = `${path("amountCents")}L${x(points.length - 1).toFixed(1)},${plot}L${x(0).toFixed(1)},${plot}Z`;
  const every = Math.max(1, Math.ceil(points.length / 6));
  const point = active !== null ? points[active] : null;
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}
        onPress={(e) => {
          const i = Math.round(((e.nativeEvent.locationX - 8) / Math.max(1, width - 16)) * (points.length - 1));
          setActive(i >= 0 && i < points.length && i !== active ? i : null);
        }}
        style={{ height }}
        accessibilityLabel={`${valueLabel} de ${formatBRL(points[0].amountCents)} para ${formatBRL(points[points.length - 1].amountCents)}`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Path d={area} fill={color} fillOpacity={0.08} />
            <Path d={path("investedCents")} stroke="#8C908A" strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
            <Path d={path("amountCents")} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
            {active !== null ? <SvgLine x1={x(active)} x2={x(active)} y1={4} y2={plot} stroke={colors.chartAxis} strokeDasharray="3 3" /> : null}
            {active !== null ? <Circle cx={x(active)} cy={y(points[active].amountCents)} r={4} fill={color} stroke="#fff" strokeWidth={2} /> : null}
          </Svg>
        ) : null}
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 }}>
          {points.map((p, i) => (i % every === 0 || i === points.length - 1 ? <Txt key={p.date} size={11} color={colors.chartAxis} style={{ fontFamily: fonts.regular }}>{p.label}</Txt> : null))}
        </View>
      </Pressable>
      {point && !hidden ? (
        <View style={{ alignSelf: "flex-start", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 8, gap: 2 }}>
          <Txt size={12} weight="semibold" tabular>{point.date.split("-").reverse().join("/")}</Txt>
          <Txt size={12}>{`${valueLabel}  ${formatBRL(point.amountCents)}`}</Txt>
          <Txt size={12} color={colors.mutedForeground}>{`Aplicado  ${formatBRL(point.investedCents)}`}</Txt>
        </View>
      ) : null}
      <Row gap={16}>
        <Row gap={6}><View style={{ width: 14, height: 2, backgroundColor: color }} /><Txt size={12} color={colors.mutedForeground}>{valueLabel}</Txt></Row>
        <Row gap={6}><View style={{ width: 14, borderTopWidth: 2, borderStyle: "dashed", borderColor: "#8C908A" }} /><Txt size={12} color={colors.mutedForeground}>{investedLabel}</Txt></Row>
      </Row>
    </View>
  );
}

/** "Sem meta · Vincular a uma meta sua ou do casal". */
export function LinkCard({ href }: { href: string }) {
  return (
    <Press href={href} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: "#C9CCC6", backgroundColor: colors.card, padding: 18 }}>
      <View style={{ width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: "#C9CCC6", alignItems: "center", justifyContent: "center" }}>
        <LinkIcon size={18} color={colors.mutedForeground} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={13} weight="medium">Sem meta</Txt>
        <Txt size={12} color={colors.mutedForeground}>Vincule a uma meta sua ou do casal</Txt>
      </View>
      <Txt size={13} weight="medium" color={colors.primary}>Vincular</Txt>
    </Press>
  );
}
