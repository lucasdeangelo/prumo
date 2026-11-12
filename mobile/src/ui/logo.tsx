import { View } from "react-native";

import { PrumoSymbol } from "./icons";
import { Txt } from "./kit";
import { colors } from "./theme";

/** Symbol + lowercase wordmark, as on the sign-in screen. */
export function PrumoLogo({ size = "md" }: { size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <View accessibilityLabel="Prumo" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <PrumoSymbol height={lg ? 28 : 24} color={colors.primary} strokeWidth={2} />
      <Txt size={lg ? 28 : 22} weight="semibold" tracking={lg ? -1.26 : -0.99} lh={lg ? 34 : 28}>prumo</Txt>
    </View>
  );
}
