import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { Children, memo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { maskMoney, useHideValues, useHideValuesSetting } from "@/lib/hide-values";

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon, EyeOffIcon } from "./icons";
import { colors, fonts, radius, segmentShadow } from "./theme";

// ---------- Text ----------

type Weight = "regular" | "medium" | "semibold" | "bold";
export type TxtProps = TextProps & {
  size?: number;
  weight?: Weight;
  color?: string;
  mono?: boolean;
  tabular?: boolean;
  center?: boolean;
  lh?: number;
  tracking?: number;
};

const family = (weight: Weight, mono?: boolean) => (mono ? (weight === "regular" ? fonts.mono : fonts.monoMedium) : weight === "medium" ? fonts.medium : weight === "semibold" ? fonts.semibold : weight === "bold" ? fonts.bold : fonts.regular);

/**
 * All copy goes through here: Geist at the design sizes, tabular numbers where asked.
 * With "Esconder valores" on, every "R$ 1.234,56" in the text shows as "R$ ••••".
 */
export function Txt({ size = 15, weight = "regular", color = colors.foreground, mono, tabular, center, lh, tracking, style, children, ...rest }: TxtProps) {
  const hidden = useHideValues();
  return (
    <Text
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      style={[
        { fontFamily: family(weight, mono), fontSize: size, color, lineHeight: lh ?? Math.round(size * 1.4), letterSpacing: tracking },
        tabular && styles.tabular,
        center && { textAlign: "center" },
        style,
      ]}
      {...rest}
    >
      {hidden ? Children.map(children, (c) => (typeof c === "string" ? maskMoney(c) : c)) : children}
    </Text>
  );
}

/** "Rótulo · Mono, uppercase" (.label-mono). */
export function Label({ children, color = colors.mutedForeground, style }: { children: React.ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return (
    <Txt mono size={11} lh={16} color={color} style={[{ letterSpacing: 0.88, textTransform: "uppercase" }, style]}>
      {children}
    </Txt>
  );
}

export const Title = ({ children, size = 24 }: { children: React.ReactNode; size?: number }) => (
  <Txt size={size} weight="medium" tracking={-0.02 * size} lh={Math.round(size * 1.25)}>{children}</Txt>
);
export const Muted = ({ children, size = 14, style, center }: { children: React.ReactNode; size?: number; style?: StyleProp<TextStyle>; center?: boolean }) => (
  <Txt size={size} color={colors.mutedForeground} style={style} center={center}>{children}</Txt>
);

// ---------- Layout ----------

export const Stack = ({ gap = 16, children, style }: { gap?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ gap }, style]}>{children}</View>;
export const Row = ({ gap = 12, children, style, align = "center" }: { gap?: number; children: React.ReactNode; style?: StyleProp<ViewStyle>; align?: ViewStyle["alignItems"] }) => (
  <View style={[{ flexDirection: "row", alignItems: align, gap }, style]}>{children}</View>
);
export const Flex = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ flex: 1, minWidth: 0 }, style]}>{children}</View>;

export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[styles.card, padded && { padding: 20 }, style]}>{children}</View>;
}

export function CardTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: "space-between", marginBottom: 12 }}>
      <Txt size={16} weight="semibold" style={{ flexShrink: 1 }}>{children}</Txt>
      {action}
    </Row>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <Txt weight="medium" center>{title}</Txt>
      {children ? <Txt size={14} color={colors.mutedForeground} center style={{ marginTop: 8 }}>{children}</Txt> : null}
    </View>
  );
}

/** Rounded list with dividers (`divide-y … rounded-2xl border bg-card`). */
export function ListGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <View style={[styles.list, style]}>
      {items.map((child, i) => (
        <View key={i} style={i > 0 ? styles.divider : undefined}>{child}</View>
      ))}
    </View>
  );
}

// ---------- Navigation ----------

export function go(href: string) {
  router.push(href as never);
}

/** Pressable row/card that opens a path. Highlights while pressed (the web's hover). */
export const Press = memo(function Press({ href, onPress, style, pressedStyle, children, disabled, label }: { href?: string; onPress?: () => void; style?: StyleProp<ViewStyle>; pressedStyle?: StyleProp<ViewStyle>; children: React.ReactNode; disabled?: boolean; label?: string }) {
  return (
    <Pressable
      accessibilityRole={href ? "link" : "button"}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress ?? (href ? () => go(href) : undefined)}
      style={({ pressed }) => [style, pressed && (pressedStyle ?? { opacity: 0.7 })]}
    >
      {children}
    </Pressable>
  );
});

/** Inline green link text ("Ver mês", "Todas"). */
export function TextLink({ href, onPress, children, size = 14, color = colors.primary }: { href?: string; onPress?: () => void; children: React.ReactNode; size?: number; color?: string }) {
  return (
    <Press href={href} onPress={onPress} style={{ minHeight: 44, justifyContent: "center" }}>
      <Txt size={size} weight="medium" color={color}>{children}</Txt>
    </Press>
  );
}

// ---------- Buttons ----------

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "danger";

const BUTTON: Record<ButtonVariant, { bg: string; press: string; fg: string; border?: string }> = {
  default: { bg: colors.primary, press: colors.primaryPress, fg: colors.primaryForeground },
  secondary: { bg: colors.secondary, press: colors.secondaryPress, fg: colors.secondaryForeground },
  outline: { bg: "transparent", press: colors.card, fg: colors.foreground, border: colors.foreground },
  ghost: { bg: "transparent", press: colors.muted, fg: colors.foreground },
  danger: { bg: colors.danger, press: "#8f2c22", fg: "#ffffff" },
};

/** "05 Componentes · Botões": pill, 48px, 15px medium. */
export function Button({ children, onPress, href, variant = "default", size = "default", disabled, pending, pendingText = "Salvando…", color, style, full = true }: { children: React.ReactNode; onPress?: () => void; href?: string; variant?: ButtonVariant; size?: "default" | "sm"; disabled?: boolean; pending?: boolean; pendingText?: string; color?: string; style?: StyleProp<ViewStyle>; full?: boolean }) {
  const v = BUTTON[variant];
  const off = disabled || pending;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={onPress ?? (href ? () => go(href) : undefined)}
      style={({ pressed }) => [
        styles.button,
        size === "sm" && { minHeight: 44, paddingHorizontal: 16 },
        { backgroundColor: off && variant !== "ghost" && variant !== "outline" ? colors.border : pressed ? v.press : v.bg },
        v.border ? { borderWidth: 1, borderColor: v.border } : null,
        !full && { alignSelf: "flex-start" },
        style,
      ]}
    >
      {typeof children === "string" || pending ? (
        <Txt size={size === "sm" ? 14 : 15} weight="medium" color={off && variant !== "ghost" && variant !== "outline" ? colors.disabledText : color ?? v.fg} center numberOfLines={1}>
          {pending ? pendingText : children}
        </Txt>
      ) : (
        children
      )}
    </Pressable>
  );
}

/** Round 44px icon button used in headers ("+", export). */
export function IconButton({ href, onPress, label, tone = "plain", children }: { href?: string; onPress?: () => void; label: string; tone?: "plain" | "tint"; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress ?? (href ? () => go(href) : undefined)}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, tone === "tint" ? { backgroundColor: pressed ? colors.secondaryPress : colors.secondary } : pressed && { backgroundColor: colors.muted }]}
    >
      {children}
    </Pressable>
  );
}

// ---------- Headers ----------

/** The eye in the headers: hides every amount on this phone until tapped again. */
export function HideValuesButton() {
  const [hidden, setHidden] = useHideValuesSetting();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hidden ? "Mostrar valores" : "Esconder valores"}
      accessibilityState={{ selected: hidden }}
      onPress={() => setHidden(!hidden)}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.muted }]}
    >
      {hidden ? <EyeOffIcon size={20} strokeWidth={1.8} /> : <EyeIcon size={20} strokeWidth={1.8} />}
    </Pressable>
  );
}

/** Screen title (Título · 24/32 · 500), optional back arrow and a trailing action. */
export function PageHeader({ title, subtitle, back, action, children }: { title?: string; subtitle?: string; back?: string | true; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Row gap={8} style={{ paddingBottom: 8 }}>
      {back ? (
        <IconButton label="Voltar" onPress={() => (router.canGoBack() ? router.back() : typeof back === "string" ? router.replace(back as never) : router.replace("/overview"))}>
          <ChevronLeftIcon size={20} strokeWidth={1.8} />
        </IconButton>
      ) : null}
      {children}
      <Flex style={back ? { marginLeft: -4 } : undefined}>
        {title ? <Txt size={24} weight="medium" tracking={-0.48} lh={32} numberOfLines={1}>{title}</Txt> : null}
        {subtitle ? <Txt size={14} color={colors.mutedForeground} numberOfLines={1}>{subtitle}</Txt> : null}
      </Flex>
      {action}
    </Row>
  );
}

/** Section heading above a list: "Movimentações … Ver todas". */
export function SectionHeader({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Row style={{ minHeight: 44, justifyContent: "space-between", paddingHorizontal: 4 }}>
      {typeof title === "string" ? <Txt size={16} weight="semibold" style={{ flexShrink: 1 }}>{title}</Txt> : title}
      {action}
    </Row>
  );
}

/** Month navigation as drawn on "Mês": arrows around the month name, no box. */
export function MonthSwitcher({ label, onPrev, onNext, caption }: { label: string; onPrev: () => void; onNext?: () => void; caption?: string }) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <View style={{ marginLeft: -12 }}><IconButton label="Mês anterior" onPress={onPrev}><ChevronLeftIcon size={20} strokeWidth={1.8} /></IconButton></View>
      <View style={{ alignItems: "center", gap: 2 }}>
        <Txt size={22} weight="medium" tracking={-0.44} lh={28}>{label}</Txt>
        {caption ? <Txt size={12} color={colors.mutedForeground}>{caption}</Txt> : null}
      </View>
      <View style={{ marginRight: -12, width: 44 }}>{onNext ? <IconButton label="Próximo mês" onPress={onNext}><ChevronRightIcon size={20} strokeWidth={1.8} /></IconButton> : null}</View>
    </Row>
  );
}

// ---------- Badges ----------

export function Pill({ children, bg = colors.muted, color = colors.mutedForeground, size = 11 }: { children: React.ReactNode; bg?: string; color?: string; size?: number }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Txt size={size} weight="medium" color={color} lh={16}>{children}</Txt>
    </View>
  );
}

const STATE: Record<string, [string, string, string]> = {
  overdue: ["Vencida", colors.dangerBg, colors.danger],
  confirmed: ["Registrada", colors.secondary, colors.secondaryForeground],
  predicted: ["Prevista", colors.muted, colors.mutedForeground],
  candidate: ["Sugerida", colors.warningBg, colors.warningFg],
  active: ["Ativa", colors.secondary, colors.secondaryForeground],
  paused: ["Pausada", colors.muted, colors.mutedForeground],
  cancelled: ["Cancelada", colors.muted, colors.mutedForeground],
  rejected: ["Ignorada", colors.muted, colors.mutedForeground],
};

export function StateBadge({ state }: { state: string }) {
  const [label, bg, fg] = STATE[state] ?? STATE.predicted;
  return <Pill bg={bg} color={fg}>{label}</Pill>;
}

/** Filter chip (Tudo · Saídas · Entradas, 30/90/180 dias). */
export function Chip({ label, active, onPress, children }: { label: string; active: boolean; onPress: () => void; children?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active ? { backgroundColor: colors.foreground } : { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }]}>
      <Txt size={14} color={active ? "#ffffff" : colors.foreground}>{label}</Txt>
      {children}
    </Pressable>
  );
}

// ---------- Forms ----------

export function Field({ label, hint, children, style }: { label: string; hint?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Txt size={14} weight="medium">{label}</Txt>
      {children}
      {hint ? <Txt size={13} color={colors.mutedForeground}>{hint}</Txt> : null}
    </View>
  );
}

/** "05 Componentes · Campos": 48px, 10px radius, line border that turns ink while focused. */
export function Input({ style, big, multiline, ...props }: TextInputProps & { big?: boolean }) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.mutedForeground}
      onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
      multiline={multiline}
      style={[
        styles.input,
        focus && { borderColor: colors.foreground },
        big && { fontSize: 24, fontFamily: fonts.semibold, fontVariant: ["tabular-nums"] },
        multiline && { minHeight: 88, paddingTop: 12, textAlignVertical: "top" },
        style,
      ]}
      {...props}
    />
  );
}

export type Option = { value: string; label: string; disabled?: boolean };

/** Native-feeling <select>: a field that opens a bottom sheet with the options. */
export function Select({ value, onChange, options, placeholder, label, style }: { value: string; onChange: (value: string) => void; options: Option[]; placeholder?: string; label?: string; style?: StyleProp<ViewStyle> }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable accessibilityRole="combobox" accessibilityLabel={label} onPress={() => setOpen(true)} style={[styles.input, styles.select, style]}>
        <Txt size={16} numberOfLines={1} color={current ? colors.foreground : colors.mutedForeground} style={{ flex: 1 }}>{current?.label ?? placeholder ?? "Escolha…"}</Txt>
        <View style={{ transform: [{ rotate: "90deg" }] }}><ChevronRightIcon size={16} color={colors.mutedForeground} /></View>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          {label ? <Txt size={16} weight="semibold" style={{ paddingHorizontal: 20, paddingVertical: 14 }}>{label}</Txt> : <View style={{ height: 12 }} />}
          <FlatList
            data={options}
            keyExtractor={(o) => o.value || "__empty"}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => (
              <Pressable
                disabled={item.disabled}
                onPress={() => { onChange(item.value); setOpen(false); }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.muted }]}
              >
                <Txt size={16} color={item.disabled ? colors.mutedForeground : colors.foreground} weight={item.value === value ? "semibold" : "regular"} style={{ flex: 1 }}>{item.label}</Txt>
                {item.value === value ? <CheckIcon size={18} color={colors.primary} strokeWidth={2} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const dayLabel = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (iso: string) => (iso ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) : new Date());

/** <input type="date">: the platform date picker, value as AAAA-MM-DD. */
export function DateInput({ value, onChange, label, placeholder = "Escolha a data" }: { value: string; onChange: (iso: string) => void; label?: string; placeholder?: string }) {
  const [iosOpen, setIosOpen] = useState(false);
  const open = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({ value: fromIso(value), mode: "date", onChange: (event, date) => { if (event.type === "set" && date) onChange(toIso(date)); } });
    } else setIosOpen(true);
  };
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={open} style={[styles.input, styles.select]}>
        <Txt size={16} color={value ? colors.foreground : colors.mutedForeground} tabular>{value ? dayLabel(value) : placeholder}</Txt>
      </Pressable>
      {Platform.OS === "ios" ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setIosOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: 32, alignItems: "center" }]}>
            <DateTimePicker value={fromIso(value)} mode="date" display="inline" locale="pt-BR" accentColor={colors.primary} onChange={(_, date) => { if (date) onChange(toIso(date)); }} />
            <View style={{ alignSelf: "stretch", paddingHorizontal: 20 }}><Button onPress={() => setIosOpen(false)}>Pronto</Button></View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

/** Segmented radio control for 2-3 options, drawn like the "Quem paga" selector. */
export function Segmented<T extends string>({ value, onChange, options, small, activeColor = colors.primary, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; small?: boolean; activeColor?: string; label?: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => onChange(o.value)} style={[styles.segment, active && styles.segmentActive]}>
            <Txt size={small ? 13 : 14} weight={active ? "semibold" : "medium"} color={active ? activeColor : colors.mutedForeground} numberOfLines={1}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } | null }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <View accessibilityRole={state.error ? "alert" : "text"} style={[styles.message, { backgroundColor: state.error ? colors.dangerBg : colors.secondary }]}>
      <Txt size={14} color={state.error ? colors.danger : colors.secondaryForeground}>{state.error ?? state.ok}</Txt>
    </View>
  );
}

export function Notice({ children, tone = "ok" }: { children: React.ReactNode; tone?: "ok" | "error" | "muted" }) {
  const bg = tone === "error" ? colors.dangerBg : tone === "muted" ? colors.muted : colors.secondary;
  const fg = tone === "error" ? colors.danger : tone === "muted" ? colors.mutedForeground : colors.secondaryForeground;
  return (
    <View style={[styles.message, { backgroundColor: bg }]}>
      <Txt size={14} color={fg} center>{children}</Txt>
    </View>
  );
}

export function Checkbox({ checked, onChange, children, boxed }: { checked: boolean; onChange: (value: boolean) => void; children: React.ReactNode; boxed?: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={[{ flexDirection: "row", gap: 12, alignItems: "flex-start" }, boxed && { backgroundColor: colors.muted, borderRadius: radius.md, padding: 12 }]}>
      <View style={[styles.checkbox, checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>{checked ? <CheckIcon size={14} color="#fff" strokeWidth={2.4} /> : null}</View>
      <View style={{ flex: 1 }}>{typeof children === "string" ? <Txt size={14}>{children}</Txt> : children}</View>
    </Pressable>
  );
}

/** Radio option card (border turns ink when chosen). */
export function RadioCard({ selected, onPress, title, body, right }: { selected: boolean; onPress: () => void; title: string; body?: string; right?: string }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.radioCard, { borderColor: selected ? colors.foreground : colors.border }]}>
      <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.radioOff }]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Txt size={15} weight="medium">{title}</Txt>
        {body ? <Txt size={13} color={colors.mutedForeground}>{body}</Txt> : null}
      </View>
      {right ? <Txt size={13} color={colors.mutedForeground}>{right}</Txt> : null}
    </Pressable>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <View style={[styles.toggle, { backgroundColor: on ? colors.primary : colors.toggleOff, justifyContent: on ? "flex-end" : "flex-start" }]}>
      <View style={styles.toggleKnob} />
    </View>
  );
}

/** A full-width row with a title, body and an on/off switch (Dinheiro livre, avisos do orçamento). */
export function ToggleRow({ title, body, on, onPress, disabled }: { title: string; body: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.8 }]}>
      <View style={{ flex: 1 }}>
        <Txt size={15} weight="medium">{title}</Txt>
        <Txt size={13} color={colors.mutedForeground}>{body}</Txt>
      </View>
      <Toggle on={on} />
    </Pressable>
  );
}

export function Spinner() {
  return <ActivityIndicator color={colors.primary} />;
}

export const styles = StyleSheet.create({
  tabular: { fontVariant: ["tabular-nums"] },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  empty: { borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.dashed, backgroundColor: "rgba(255,255,255,0.6)", paddingHorizontal: 16, paddingVertical: 32 },
  list: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  divider: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.border },
  button: { minHeight: 48, borderRadius: radius.full, paddingHorizontal: 24, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  iconButton: { width: 44, height: 44, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  chip: { minHeight: 36, borderRadius: radius.sm, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 4 },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 14, fontSize: 16, fontFamily: fonts.regular, color: colors.foreground },
  select: { flexDirection: "row", alignItems: "center", gap: 8 },
  backdrop: { flex: 1, backgroundColor: "rgba(18,21,18,0.35)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  option: { minHeight: 52, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12 },
  segmented: { flexDirection: "row", gap: 4, backgroundColor: colors.muted, borderRadius: radius.full, padding: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: radius.full, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  segmentActive: { backgroundColor: colors.card, ...segmentShadow },
  message: { borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.radioOff, alignItems: "center", justifyContent: "center", marginTop: 1 },
  radioCard: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.card },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  toggle: { width: 40, height: 24, borderRadius: 12, padding: 2, flexDirection: "row", alignItems: "center" },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#ffffff" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
});
