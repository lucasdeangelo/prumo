import { useState } from "react";
import { Pressable, View } from "react-native";

import { useAction } from "@/lib/query";

import { Txt } from "./kit";
import { colors, radius, segmentShadow } from "./theme";

const OPTIONS = [
  { value: "private", label: "Só eu" },
  { value: "totals", label: "Totais" },
  { value: "details", label: "Detalhes" },
] as const;

type Visibility = (typeof OPTIONS)[number]["value"];

/** Three-way choice per account (Só eu · Totais · Detalhes). Applies on tap; no notice to the partner. */
export function VisibilitySegment({ accountId, value, returnTo, accountName }: { accountId: string; value: Visibility; returnTo: string; accountName: string }) {
  const { run } = useAction("setVisibility");
  // Optimistic: the choice moves at once and the server catches up.
  const [optimistic, setOptimistic] = useState<Visibility | null>(null);
  const shown = optimistic ?? value;
  return (
    <View accessibilityLabel={`O que seu par vê de ${accountName}`} style={{ flexDirection: "row", gap: 4, borderRadius: radius.full, backgroundColor: colors.muted, padding: 4 }}>
      {OPTIONS.map((option) => {
        const active = option.value === shown;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              setOptimistic(option.value);
              // Once the server answers, the refreshed screen data is the source of truth again.
              run({ accountId, visibility: option.value, returnTo }).finally(() => setOptimistic(null));
            }}
            style={[{ flex: 1, minHeight: 40, borderRadius: radius.full, alignItems: "center", justifyContent: "center" }, active && { backgroundColor: colors.card, ...segmentShadow }]}
          >
            <Txt size={13} weight={active ? "semibold" : "medium"} color={active ? colors.foreground : colors.mutedForeground}>{option.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
