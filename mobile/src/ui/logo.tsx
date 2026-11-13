import { View } from "react-native";

import { PrumoSymbol } from "./icons";
import { Txt } from "./kit";
import { colors } from "./theme";

/** Symbol + lowercase wordmark, as on the sign-in screen ("Entrar": 32 px symbol, 30 px bold). */
export function PrumoLogo({ size = "md" }: { size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <View accessibilityLabel="Prumo" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <PrumoSymbol height={lg ? 32 : 24} color={colors.primary} strokeWidth={5.5} />
      <Txt size={lg ? 30 : 22} weight="bold" tracking={lg ? -1.5 : -1.1} lh={lg ? 36 : 28}>prumo</Txt>
    </View>
  );
}
