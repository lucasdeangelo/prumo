import { useState } from "react";
import { View } from "react-native";

import { Segmented, Txt, type Option } from "./kit";
import { colors } from "./theme";

type Named = { id: string; name: string };

export const tagOptions = (tags: Named[], emptyLabel: string): Option[] => [{ value: "", label: emptyLabel }, ...tags.map((t) => ({ value: t.id, label: t.name }))];
export const accountOptions = (accounts: Named[]): Option[] => [{ value: "", label: "Nenhuma" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))];
export const notifyOptions: Option[] = [0, 1, 2, 3, 5, 7].map((d) => ({ value: String(d), label: d === 0 ? "No dia" : `${d} dia(s)` }));

/** "De quem é": Meu or Nosso, with what it means for the partner. Shown only to people in a couple. */
export function OwnerChoice({ value, onChange, partnerName, nossoHint, mineLabel = "Meu", oursLabel = "Nosso" }: { value: "mine" | "ours"; onChange: (v: "mine" | "ours") => void; partnerName: string; nossoHint: string; mineLabel?: string; oursLabel?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt size={14} weight="medium" style={{ marginBottom: 4 }}>De quem é</Txt>
      <Segmented label="De quem é" value={value} onChange={onChange} options={[{ value: "mine", label: mineLabel }, { value: "ours", label: oursLabel }]} />
      <Txt size={13} color={colors.mutedForeground}>{value === "ours" ? nossoHint : `Só você vê, a não ser que a conta seja compartilhada com ${partnerName}.`}</Txt>
    </View>
  );
}

/** Small helper for form state objects. */
export function useFields<T extends Record<string, unknown>>(initial: T) {
  const [fields, setFields] = useState(initial);
  const set = <K extends keyof T>(key: K) => (value: T[K]) => setFields((f) => ({ ...f, [key]: value }));
  return [fields, set, setFields] as const;
}

/** Two fields side by side (grid-cols-2 gap-3). */
export function Pair({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", gap: 12 }}>{Array.isArray(children) ? children.map((c, i) => <View key={i} style={{ flex: 1 }}>{c}</View>) : children}</View>;
}
