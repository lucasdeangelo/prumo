import { config } from "./config";
import { supabase } from "./supabase";

export type Space = "meu" | "nosso";
export type ActionState = { error?: string; ok?: string; code?: string } | undefined;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** The server would navigate (Next's redirect()): the app follows to the same path. */
export class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const value = data.session?.access_token;
  if (!value) throw new ApiError("Não autenticado", 401);
  return value;
}

async function request(path: string, init: RequestInit, space: Space) {
  if (!config.apiUrl) throw new ApiError("Configure EXPO_PUBLIC_API_URL.", 0);
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${await token()}`, "x-prumo-space": space, Accept: "application/json" },
    });
  } catch {
    throw new ApiError("Sem conexão. Verifique a internet e tente de novo.", 0);
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.status === 401) {
    await supabase.auth.signOut();
    throw new ApiError("Sua sessão expirou. Entre de novo.", 401);
  }
  if (!response.ok) throw new ApiError(typeof body?.error === "string" ? body.error : "Algo deu errado. Tente novamente.", response.status);
  if (body && typeof body.redirect === "string") throw new RedirectSignal(body.redirect);
  return body;
}

/** Data for one screen, by its web path ("monthly/2026-11", "cards?card=…&m=1"). */
export async function fetchScreen<T>(path: string, space: Space): Promise<T> {
  return (await request(`/api/mobile/screen/${path.replace(/^\//, "")}`, { method: "GET" }, space)) as T;
}

export type Fields = Record<string, string | number | boolean | null | undefined | string[]>;

/** Runs a server action by name. Resolves to its result, or rejects with RedirectSignal. */
export async function callAction<T = ActionState>(name: string, input: { fields?: Fields; args?: unknown[] }, space: Space): Promise<T> {
  const body = await request(`/api/mobile/action/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, space);
  return (body?.result ?? undefined) as T;
}

export async function authHeader(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await token()}` };
}
