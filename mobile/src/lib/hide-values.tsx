import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useSyncExternalStore } from "react";

// "Esconder valores", same as the web eye button: every amount shows as "R$ ••••".
// The choice lives on this phone. It is read together with the session (lib/session.tsx), so the
// first screen already comes masked.
const KEY = "prumo_hide_values";

let hidden = false;
const listeners = new Set<() => void>();

export async function loadHideValues() {
  hidden = (await SecureStore.getItemAsync(KEY).catch(() => null)) === "1";
  listeners.forEach((l) => l());
}

export function setHideValues(next: boolean) {
  hidden = next;
  listeners.forEach((l) => l());
  (next ? SecureStore.setItemAsync(KEY, "1") : SecureStore.deleteItemAsync(KEY)).catch(() => {});
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
