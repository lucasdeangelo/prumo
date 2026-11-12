import { useQuery } from "@tanstack/react-query";
import { monthOf, todayIn } from "@domain/dates";
import { Stack, router, usePathname } from "expo-router";
import { memo, useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchScreen } from "@/lib/api";
import { prefetchScreen } from "@/lib/query";
import { useSession } from "@/lib/session";
import { CalendarIcon, CardIcon, HomeIcon, PlusIcon, RepeatIcon, SlidersIcon } from "@/ui/icons";
import { Txt } from "@/ui/kit";
import { colors, fabShadow, spaceColor } from "@/ui/theme";

// Navigation map: fixed bottom bar Início · Mês · Cartões · Assinaturas · Ajustes.
// Upcoming bills live under Mês; tags and connections under Ajustes.
const ITEMS = [
  { href: "/overview", label: "Início", icon: HomeIcon, match: ["/overview"] },
  { href: "/monthly", label: "Mês", icon: CalendarIcon, match: ["/monthly", "/upcoming", "/transactions"] },
  { href: "/cards", label: "Cartões", icon: CardIcon, match: ["/cards"] },
  { href: "/subscriptions", label: "Assinaturas", icon: RepeatIcon, match: ["/subscriptions"] },
  { href: "/settings", label: "Ajustes", icon: SlidersIcon, match: ["/settings"] },
] as const;

export default function AppLayout() {
  const { space } = useSession();
  const keyboard = useKeyboardOpen();

  // Warm the main tabs right after sign-in so switching tabs is instant.
  useEffect(() => {
    const month = monthOf(todayIn());
    for (const path of ["overview", `monthly/${month}`, "cards", "subscriptions", "settings"]) prefetchScreen(path, space).catch(() => {});
  }, [space]);

  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "slide_from_right", gestureEnabled: true }} />
      <SpaceRule />
      {keyboard ? null : (
        <>
          <Fab />
          <BottomNav />
        </>
      )}
    </View>
  );
}

/** The top rule tells where you are: your color in Meu, Prumo green in Nosso. */
function SpaceRule() {
  const { space } = useSession();
  const { data } = useQuery({
    queryKey: ["screen", space, "overview"],
    queryFn: () => fetchScreen<{ me: { color: "blue" | "terracotta" }; partner: unknown }>("overview", space),
    staleTime: 30_000,
  });
  if (!data) return <View style={styles.rule} />;
  return <View style={[styles.rule, { backgroundColor: spaceColor(data.partner ? space : "meu", data.me.color) }]} />;
}

function Fab() {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nova movimentação"
      onPress={() => router.push("/transactions/new")}
      style={({ pressed }) => [styles.fab, { bottom: 88 + insets.bottom, backgroundColor: pressed ? colors.primaryPress : colors.primary }]}
    >
      <PlusIcon size={24} color="#ffffff" strokeWidth={1.8} />
    </Pressable>
  );
}

const BottomNav = memo(function BottomNav() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={[styles.nav, { paddingBottom: 8 + insets.bottom }]}>
      {ITEMS.map(({ href, label, icon: Icon, match }) => {
        const active = match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
        const target = href === "/monthly" ? `/monthly/${monthOf(todayIn())}` : href;
        return (
          <Pressable
            key={href}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            onPress={() => {
              if (pathname === target) return;
              // Tabs reuse the screen already in history, so going back and forth stays instant.
              router.dismissTo(target as never);
            }}
            style={styles.navItem}
          >
            <Icon size={22} color={active ? colors.primary : colors.mutedForeground} strokeWidth={active ? 2 : 1.6} />
            <Txt size={11} weight={active ? "semibold" : "medium"} color={active ? colors.primary : colors.mutedForeground} lh={14}>{label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
});

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setOpen(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  rule: { position: "absolute", top: 0, left: 0, right: 0, height: 3, backgroundColor: "transparent" },
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", ...fabShadow },
  nav: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", paddingHorizontal: 8, paddingTop: 6, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  navItem: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", gap: 4 },
});
