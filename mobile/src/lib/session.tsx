import type { Session } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import type { Space } from "./api";
import { loadHideValues } from "./hide-values";
import { queryClient } from "./query";
import { supabase } from "./supabase";

type SessionValue = {
  ready: boolean;
  session: Session | null;
  space: Space;
  setSpace: (space: Space) => void;
};

const SessionContext = createContext<SessionValue>({ ready: false, session: null, space: "meu", setSpace: () => {} });
const SPACE_KEY = "prumo_space";

/** Signed-in person and the space used last ("Início abre o último espaço usado"). */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [space, setSpaceState] = useState<Space>("meu");

  useEffect(() => {
    let alive = true;
    Promise.all([supabase.auth.getSession(), SecureStore.getItemAsync(SPACE_KEY).catch(() => null), loadHideValues()]).then(([{ data }, saved]) => {
      if (!alive) return;
      setSession(data.session);
      if (saved === "nosso") setSpaceState("nosso");
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // Another person may sign in on this phone: never show the previous one's data.
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        setSpaceState("meu");
        SecureStore.deleteItemAsync(SPACE_KEY).catch(() => {});
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      session,
      space,
      setSpace: (next) => {
        setSpaceState(next);
        SecureStore.setItemAsync(SPACE_KEY, next).catch(() => {});
      },
    }),
    [ready, session, space],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
