import { QueryClient, useQuery } from "@tanstack/react-query";
import { router, usePathname } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, callAction, fetchScreen, RedirectSignal, type ActionState, type Fields } from "./api";
import { useSession } from "./session";

/**
 * Screens show what is cached at once and refresh in the background. Writes invalidate every
 * screen, the same as the web's revalidatePath("/", "layout"). Nothing is persisted to disk:
 * financial data lives only in memory.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (count, error) => !(error instanceof ApiError && [401, 404].includes(error.status)) && !(error instanceof RedirectSignal) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

/** Follows a server redirect. Same screen: just update its params. Earlier screen: go back to it. */
export function follow(to: string, current: string) {
  const [pathname, query = ""] = to.split("?");
  if (pathname === current) {
    const params = Object.fromEntries(new URLSearchParams(query).entries());
    if (query) router.setParams(params);
    return;
  }
  router.dismissTo(to as never);
}

export function useScreen<T>(path: string, options: { enabled?: boolean } = {}) {
  const { space } = useSession();
  const current = usePathname();
  const query = useQuery({
    queryKey: ["screen", space, path],
    queryFn: () => fetchScreen<T>(path, space),
    enabled: options.enabled ?? true,
  });
  // Pages that need a partner (or a different space) send people elsewhere, like the web.
  const redirected = query.error instanceof RedirectSignal ? query.error.to : null;
  useEffect(() => {
    if (redirected) router.replace(redirected as never);
  }, [redirected, current]);
  return query;
}

export function prefetchScreen(path: string, space: "meu" | "nosso") {
  return queryClient.prefetchQuery({ queryKey: ["screen", space, path], queryFn: () => fetchScreen(path, space) });
}

export function refreshAll() {
  return queryClient.invalidateQueries({ queryKey: ["screen"] });
}

/**
 * A server action, like a web form: `run` sends the fields, `pending` drives the button label and
 * `state` holds { error } / { ok } for FormMessage. Redirects navigate like the web does.
 */
export function useAction<T = ActionState>(name: string, options: { onRedirect?: (to: string) => void } = {}) {
  const { space } = useSession();
  const current = usePathname();
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<T | undefined>();
  const busy = useRef(false);
  const onRedirect = options.onRedirect;

  const run = useCallback(
    async (fields?: Fields, args?: unknown[]): Promise<T | undefined> => {
      if (busy.current) return undefined;
      busy.current = true;
      setPending(true);
      try {
        const result = await callAction<T>(name, { fields, args }, space);
        setState(result);
        await refreshAll();
        return result;
      } catch (error) {
        if (error instanceof RedirectSignal) {
          setState(undefined);
          refreshAll();
          if (onRedirect) onRedirect(error.to);
          else follow(error.to, current);
          return undefined;
        }
        const failure = { error: error instanceof Error ? error.message : "Algo deu errado. Tente novamente." } as T;
        setState(failure);
        return failure;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [name, space, current, onRedirect],
  );

  return { run, pending, state, setState };
}
