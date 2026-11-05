import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { loadAccounts, type AccountRow } from "./couple-data";

export type ConnectionState = "ok" | "failed" | "expired";

export type Connection = {
  id: string;
  pluggyItemId: string;
  institution: string;
  status: string | null;
  errorCode: string | null;
  state: ConnectionState;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  consentExpiresAt: string | null;
  history: Array<{ at: string; ok: boolean }>;
  accounts: AccountRow[];
  createdAt: string;
};

const EXPIRED_CODES = new Set(["USER_AUTHORIZATION_REVOKED", "USER_AUTHORIZATION_NOT_GRANTED", "INVALID_CREDENTIALS", "ACCOUNT_CREDENTIALS_RESET"]);

/** Consent over or revoked → expired; the last attempt failed → failed; otherwise ok. */
export function connectionState(input: { status: string | null; errorCode: string | null; consentExpiresAt: string | null; lastSuccessAt: string | null; lastAttemptAt: string | null }, now = new Date()): ConnectionState {
  if (input.consentExpiresAt && new Date(input.consentExpiresAt).getTime() < now.getTime()) return "expired";
  if (input.status === "LOGIN_ERROR" || (input.errorCode && EXPIRED_CODES.has(input.errorCode))) return "expired";
  if (input.status === "OUTDATED" || input.errorCode) return "failed";
  if (input.lastAttemptAt && input.lastSuccessAt && input.lastSuccessAt.slice(0, 10) < input.lastAttemptAt.slice(0, 10)) return "failed";
  return "ok";
}

/** One row per bank: a MeuPluggy connection holds several banks, grouped by institution. */
export async function listConnections(userId: string): Promise<Connection[]> {
  const { data } = await createAdminClient()
    .from("pluggy_items")
    .select("id, pluggy_item_id, institution_name, status, error_code, consent_expires_at, last_success_at, last_attempt_at, last_sync_at, history, created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at");
  const accounts = await loadAccounts([userId]);
  const result: Connection[] = [];
  for (const item of data ?? []) {
    const itemAccounts = accounts.filter((a) => a.pluggy_item_id === item.id);
    const byInstitution = new Map<string, AccountRow[]>();
    for (const account of itemAccounts) {
      const key = account.institution ?? (item.institution_name as string | null) ?? "Banco";
      byInstitution.set(key, [...(byInstitution.get(key) ?? []), account]);
    }
    if (byInstitution.size === 0) byInstitution.set((item.institution_name as string | null) ?? "Banco", []);
    const base = {
      status: item.status as string | null,
      errorCode: item.error_code as string | null,
      consentExpiresAt: (item.consent_expires_at as string | null) ?? oneYearAfter(item.created_at as string),
      lastSuccessAt: (item.last_success_at as string | null) ?? (item.last_sync_at as string | null),
      lastAttemptAt: item.last_attempt_at as string | null,
    };
    for (const [institution, list] of byInstitution) {
      result.push({
        id: item.id as string,
        pluggyItemId: item.pluggy_item_id as string,
        institution,
        ...base,
        state: connectionState(base),
        history: (item.history as Array<{ at: string; ok: boolean }>) ?? [],
        accounts: list,
        createdAt: item.created_at as string,
      });
    }
  }
  return result;
}

function oneYearAfter(iso: string): string {
  const date = new Date(iso);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
}
