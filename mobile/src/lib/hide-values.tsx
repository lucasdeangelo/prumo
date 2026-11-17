import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useSyncExternalStore } from "react";
import { AppState } from "react-native";

// "Esconder valores", same as the web eye button: every amount shows as "R$ ••••".
// Every opening starts hidden: on launch, and when the app comes back after a while in the
// background. Showing them lasts until then. Nothing is stored on the phone any more.
const LEGACY_KEY = "prumo_hide_values";
// Back from the bank's app or a quick share keeps what you chose; a longer pause hides again.
const RESUME_GRACE_MS = 60_000;

let hidden = true;
let backgroundSince: number | null = null;
const listeners = new Set<() => void>();

function set(next: boolean) {
  hidden = next;
  listeners.forEach((l) => l());
}

/** Called with the session on launch (lib/session.tsx), so the first screen already comes masked. */
export async function loadHideValues() {
  set(true);
  // Before every opening started hidden, the choice was kept here; it is no longer used.
  await SecureStore.deleteItemAsync(LEGACY_KEY).catch(() => {});
}

AppState.addEventListener("change", (state) => {
  if (state === "background") backgroundSince = Date.now();
  else if (state === "active") {
    if (backgroundSince !== null && Date.now() - backgroundSince > RESUME_GRACE_MS && !hidden) set(true);
    backgroundSince = null;
  }
});

export function setHideValues(next: boolean) {
  set(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Inside <ShowValues> (the image someone chooses to share) amounts stay visible. */
const ShowValuesContext = createContext(false);
export const ShowValues = ({ children }: { children: React.ReactNode }) => <ShowValuesContext.Provider value>{children}</ShowValuesContext.Provider>;

/** True while amounts should be masked here. */
export function useHideValues() {
  const on = useSyncExternalStore(subscribe, () => hidden, () => hidden);
  const show = useContext(ShowValuesContext);
  return on && !show;
}

/** The raw switch (for the toggle button), ignoring <ShowValues>. */
export function useHideValuesSetting(): [boolean, (next: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => hidden, () => hidden), setHideValues];
}

// What formatBRL produces: "R$ 1.234,56", "-R$ 5,00" (Intl puts a no-break space after R$).
const BRL_IN_TEXT = /-?R\$[\s ]?\d[\d.]*,\d{2}/g;
export const MASK = "R$ ••••";

export function maskMoney(text: string) {
  return text.replace(BRL_IN_TEXT, MASK);
}
