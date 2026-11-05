import "server-only";

import { requireServerEnv } from "@/lib/env.server";

// Contract checked against https://docs.pluggy.ai/en/reference on 2026-11-04.
const BASE_URL = "https://api.pluggy.ai";
const TIMEOUT_MS = 15_000;

export class PluggyError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "PluggyError";
  }
}

export type PluggyAccount = {
  id: string;
  type: "BANK" | "CREDIT" | string;
  subtype: string | null;
  name: string;
  marketingName?: string | null;
  number?: string | null;
  balance: number | null;
  currencyCode: string | null;
  itemId: string;
};

export type PluggyTransaction = {
  id: string;
  accountId: string;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  date: string;
  type: "DEBIT" | "CREDIT";
  status?: "PENDING" | "POSTED";
  category?: string | null;
  merchant?: { name?: string | null; businessName?: string | null } | null;
};

export type PluggyItemResponse = {
  id: string;
  status: string;
  executionStatus?: string;
  connector?: { id: number; name: string } | null;
  error?: { code?: string; message?: string } | null;
  clientUserId?: string | null;
};

// The API key lives 2 hours; refresh a little earlier.
let apiKey: { value: string; expiresAt: number } | null = null;

async function request<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (init.auth !== false) headers.set("X-API-KEY", await getApiKey());
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new PluggyError("Pluggy indisponível ou lento demais.");
  }
  if (response.status === 401 && init.auth !== false) apiKey = null;
  if (!response.ok) {
    let message = `Pluggy respondeu ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = `${message}: ${body.message}`;
    } catch {
      // Body is not JSON; keep the status only.
    }
    throw new PluggyError(message, response.status);
  }
  return (await response.json()) as T;
}

async function getApiKey(): Promise<string> {
  if (apiKey && apiKey.expiresAt > Date.now()) return apiKey.value;
  const body = { clientId: requireServerEnv("PLUGGY_CLIENT_ID"), clientSecret: requireServerEnv("PLUGGY_CLIENT_SECRET") };
  const data = await request<{ apiKey: string }>("/auth", { method: "POST", body: JSON.stringify(body), auth: false });
  apiKey = { value: data.apiKey, expiresAt: Date.now() + 100 * 60 * 1000 };
  return data.apiKey;
}

/** Connect token for the widget. clientUserId must go inside options or Pluggy discards it. */
export async function createConnectToken(clientUserId: string, itemId?: string) {
  const data = await request<{ accessToken: string }>("/connect_token", {
    method: "POST",
    body: JSON.stringify({ ...(itemId ? { itemId } : {}), options: { clientUserId, avoidDuplicates: true } }),
  });
  return data.accessToken;
}

export function getItem(itemId: string) {
  return request<PluggyItemResponse>(`/items/${encodeURIComponent(itemId)}`);
}

/** Asks Pluggy to refresh the connection with stored credentials. */
export function refreshItem(itemId: string) {
  return request<PluggyItemResponse>(`/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: "{}" });
}

export function deleteItem(itemId: string) {
  return request<unknown>(`/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
}

export async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
  const data = await request<{ results: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
  return data.results;
}

/** Cursor pagination over /v2/transactions. Bounded to avoid runaway loops. */
export async function listTransactions(accountId: string, dateFrom: string, dateTo: string): Promise<PluggyTransaction[]> {
  const all: PluggyTransaction[] = [];
  let query = `accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}&dateTo=${dateTo}`;
  for (let page = 0; page < 40; page += 1) {
    const data = await request<{ results: PluggyTransaction[]; next?: string | null }>(`/v2/transactions?${query}`);
    all.push(...data.results);
    if (!data.next) break;
    const after = new URLSearchParams(data.next.startsWith("?") ? data.next.slice(1) : data.next).get("after") ?? data.next;
    query = `accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}&dateTo=${dateTo}&after=${encodeURIComponent(after)}`;
  }
  return all;
}
