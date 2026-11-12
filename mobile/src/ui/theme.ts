// Prumo design system (same tokens as app/globals.css). Light theme only, as designed.
export const colors = {
  background: "#f5f6f3", // Papel
  foreground: "#121512", // Tinta
  card: "#ffffff",
  primary: "#1d4d3f", // verde Prumo
  primaryPress: "#123329",
  primaryForeground: "#ffffff",
  secondary: "#e3ede8",
  secondaryForeground: "#123329",
  secondaryPress: "#d3e3db",
  muted: "#ecede9",
  mutedForeground: "#5e625c",
  subtle: "#f0f1ed",
  border: "#e3e5e0",
  dashed: "#cdd0ca",
  danger: "#a8352a",
  dangerBg: "#fbf1ef",
  success: "#2b7350",
  warning: "#8a6100",
  warningBg: "#f5edd8",
  warningFg: "#5e4200",
  amber: "#C08A1E",
  income: "#1d4d3f",
  expense: "#b4582a",
  chartGrid: "#e3e5e0",
  chartAxis: "#5e625c",
  onPrimaryMuted: "#cfe0d8",
  disabledText: "#6b6f69",
  rowPress: "#fafaf8",
  toggleOff: "#cdd0ca",
  radioOff: "#b9bdb6",
} as const;

/** Geist for interface (400/500/600), Geist Mono for labels and dates. Loaded in the root layout. */
export const fonts = {
  regular: "Geist-Regular",
  medium: "Geist-Medium",
  semibold: "Geist-SemiBold",
  mono: "GeistMono-Regular",
  monoMedium: "GeistMono-Medium",
} as const;

export const radius = { sm: 6, md: 10, lg: 16, full: 999 } as const;

/** Soft shadow used by selected segments ("0 1px 3px rgba(18,21,18,0.1)"). */
export const segmentShadow = {
  shadowColor: "#121512",
  shadowOpacity: 0.1,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;

export const fabShadow = {
  shadowColor: "#121512",
  shadowOpacity: 0.18,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
} as const;

export const PERSON_BG = { blue: "#3A5BA0", terracotta: "#B4582A" } as const;
export const PERSON_TINT = { blue: "#E6ECF6", terracotta: "#F6E8DE" } as const;
export const SPACE_NOSSO = "#1D4D3F";

export type PersonColor = keyof typeof PERSON_BG;
export type Person = { userId?: string; name: string; initial: string; color: PersonColor };

export function spaceColor(space: "meu" | "nosso", me: PersonColor): string {
  return space === "nosso" ? SPACE_NOSSO : PERSON_BG[me];
}
