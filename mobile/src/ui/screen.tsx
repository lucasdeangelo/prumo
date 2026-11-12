import { useIsFetching } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Animated, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "@/lib/api";
import { useScreen } from "@/lib/query";

import { Button, EmptyState, PageHeader, Stack } from "./kit";
import { colors } from "./theme";

/** Space under the content for the bottom bar and the "+" button (the web's pb-[9rem]). */
export const BOTTOM_SPACE = 144;

/** Shown at once while a screen loads its data, so a tap never feels ignored (app/(app)/loading.tsx). */
export function Skeleton() {
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const block = (style: StyleProp<ViewStyle>) => <Animated.View style={[{ backgroundColor: colors.muted, opacity: pulse }, style]} />;
  return (
    <View accessibilityLabel="Carregando" style={{ gap: 20 }}>
      {block({ height: 40, width: 160, borderRadius: 20 })}
      <View style={{ gap: 8 }}>
        {block({ height: 28, width: 224, borderRadius: 8 })}
        {block({ height: 16, width: 128, borderRadius: 8 })}
      </View>
      {block({ height: 128, borderRadius: 16 })}
      {block({ height: 192, borderRadius: 16 })}
      {block({ height: 96, borderRadius: 16 })}
    </View>
  );
}

/** Scrollable page body with the web's paddings (px-5, safe-area top) and pull-to-refresh. */
export function Page({ children, onRefresh, refreshing = false, gap = 20, keyboard }: { children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; gap?: number; keyboard?: boolean }) {
  const insets = useSafeAreaInsets();
  const body = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(28, insets.top + 12), paddingBottom: BOTTOM_SPACE + insets.bottom, gap }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
    >
      {children}
    </ScrollView>
  );
  return keyboard ? <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>{body}</KeyboardAvoidingView> : body;
}

/**
 * Loads `path` from the API and renders it. Cached data appears instantly while a fresh copy
 * loads in the background; pull down to refresh.
 */
export function Screen<T>({ path, children, gap, keyboard, fallbackBack }: { path: string; children: (data: T) => React.ReactNode; gap?: number; keyboard?: boolean; fallbackBack?: string }) {
  const query = useScreen<T>(path);
  const [pulled, setPulled] = useState(false);
  const fetching = useIsFetching({ queryKey: ["screen"] }) > 0;
  const refresh = async () => {
    setPulled(true);
    await query.refetch();
    setPulled(false);
  };

  if (query.data !== undefined) {
    return <Page gap={gap} keyboard={keyboard} onRefresh={refresh} refreshing={pulled && fetching}>{children(query.data)}</Page>;
  }
  if (query.error && !(query.error instanceof Error && query.error.message.startsWith("redirect"))) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Page>
        <PageHeader back={fallbackBack ?? true} />
        <Stack>
          <EmptyState title={notFound ? "Não encontrado" : "Não foi possível carregar"}>{notFound ? "Isso não existe mais ou não é seu." : query.error.message}</EmptyState>
          {!notFound ? <Button variant="outline" onPress={() => query.refetch()}>Tentar de novo</Button> : null}
        </Stack>
      </Page>
    );
  }
  return <Page><Skeleton /></Page>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, width: "100%", maxWidth: 672, alignSelf: "center" },
});
