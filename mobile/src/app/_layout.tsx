// Only the five weights the design uses (the package index would ship all of them).
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono/400Regular";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono/500Medium";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { configured } from "@/lib/config";
import { queryClient } from "@/lib/query";
import { SessionProvider, useSession } from "@/lib/session";
import { EmptyState, Txt } from "@/ui/kit";
import { colors } from "@/ui/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "Geist-Regular": Geist_400Regular,
    "Geist-Medium": Geist_500Medium,
    "Geist-SemiBold": Geist_600SemiBold,
    "GeistMono-Regular": GeistMono_400Regular,
    "GeistMono-Medium": GeistMono_500Medium,
  });
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <StatusBar style="dark" />
          {fontsLoaded || fontError ? <Navigation /> : null}
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const { ready, session } = useSession();
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!configured) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 20, backgroundColor: colors.background }}>
        <EmptyState title="App não configurado">
          <Txt size={14} color={colors.mutedForeground}>Defina EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (veja mobile/.env.example).</Txt>
        </EmptyState>
      </View>
    );
  }
  if (!ready) return null;
  const signedIn = Boolean(session);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "fade" }}>
      <Stack.Protected guard={signedIn} redirectTo="/">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo="/overview">
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
