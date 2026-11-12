import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import { View } from "react-native";
import { captureRef } from "react-native-view-shot";

import { Button, Txt } from "./kit";
import { colors } from "./theme";

/**
 * Draws a simple summary card (couple totals and goals only, never individual values) and opens
 * the share sheet. Same 1080×1350 layout as the web canvas, rendered off screen at 1/3 scale.
 */
export function ShareImageButton({ title, lines, label = "Compartilhar resumo como imagem" }: { title: string; lines: string[]; label?: string }) {
  const card = useRef<React.ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const uri = await captureRef(card as never, { format: "png", quality: 1, width: 1080, height: 1350, result: "tmpfile" });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: title, UTI: "public.png" });
    } catch {
      // The person closed the share sheet.
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View pointerEvents="none" style={{ position: "absolute", left: -2000, top: 0 }}>
        <View ref={card} collapsable={false} style={{ width: 360, height: 450, backgroundColor: "#F5F6F3" }}>
          <View style={{ height: 4, backgroundColor: "#1D4D3F" }} />
          <View style={{ paddingHorizontal: 32, flex: 1 }}>
            <Txt size={15} weight="semibold" style={{ marginTop: 34 }}>prumo</Txt>
            <Txt size={24} weight="medium" lh={29} style={{ marginTop: 50 }}>{title}</Txt>
            <View style={{ marginTop: 70, gap: 13 }}>
              {lines.map((line) => <Txt key={line} size={15} lh={20} color="#3d413b">{line}</Txt>)}
            </View>
            <Txt size={11} color={colors.mutedForeground} style={{ position: "absolute", left: 32, bottom: 26 }}>Finanças a dois, no prumo.</Txt>
          </View>
        </View>
      </View>
      <Button variant="outline" pending={busy} pendingText="Preparando…" onPress={share}>{label}</Button>
    </>
  );
}
