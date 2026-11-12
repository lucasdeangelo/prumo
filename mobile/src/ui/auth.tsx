import { router } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, Txt } from "./kit";
import { PrumoLogo } from "./logo";
import { colors } from "./theme";

/** Sign-in screens as designed: logo above a single white card on paper. */
export function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", gap: 40, paddingHorizontal: 20, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40, width: "100%", maxWidth: 384, alignSelf: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable accessibilityRole="link" onPress={() => router.dismissTo("/")} style={{ alignSelf: "center" }}>
          <PrumoLogo size="lg" />
        </Pressable>
        <Card style={{ padding: 24 }}>
          <Txt size={24} weight="medium" tracking={-0.48} lh={32} style={{ marginBottom: subtitle ? 4 : 20 }}>{title}</Txt>
          {subtitle ? <Txt size={14} color={colors.mutedForeground} style={{ marginBottom: 20 }}>{subtitle}</Txt> : null}
          <View style={{ gap: 16 }}>{children}</View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
