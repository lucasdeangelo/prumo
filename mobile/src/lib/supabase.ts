import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";

import { config } from "./config";

/**
 * The session (tokens) is kept in the device keychain/keystore, never in plain storage. Some iOS
 * versions refuse values above ~2 KB, so long values are split into chunks.
 */
const CHUNK = 1800;
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (!count) return SecureStore.getItemAsync(k);
    const parts = await Promise.all(Array.from({ length: Number(count) }, (_, i) => SecureStore.getItemAsync(`${k}.${i}`)));
    return parts.some((p) => p === null) ? null : parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    await secureStorage.removeItem(key);
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, "gs")) ?? [""];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${k}.${i}`, p)));
    await SecureStore.setItemAsync(`${k}.n`, String(parts.length));
  },
  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const count = Number((await SecureStore.getItemAsync(`${k}.n`)) ?? 0);
    await Promise.all([
      SecureStore.deleteItemAsync(k),
      SecureStore.deleteItemAsync(`${k}.n`),
      ...Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${k}.${i}`)),
    ]);
  },
};

export const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Refresh tokens only while the app is in the foreground (Supabase's React Native guidance).
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
