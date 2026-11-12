import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Share } from "react-native";

import { Button } from "./kit";

/** Copies text; on phones it can open the share sheet so the code goes straight to the partner. */
export function CopyButton({ text, label, share = false }: { text: string; label: string; share?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      onPress={async () => {
        try {
          await Clipboard.setStringAsync(text);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setDone(true);
          if (share) await Share.share({ message: text });
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copiado" : label}
    </Button>
  );
}
