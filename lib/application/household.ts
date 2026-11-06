import "server-only";

import { randomInt } from "node:crypto";

import { cache } from "react";

import { firstShare, type SplitMethod } from "@/lib/domain/couple";
import { requireServerEnv } from "@/lib/env.server";
import { hmacHex, rateLimit } from "@/lib/internal/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { DomainError } from "./transactions";

export type Member = {
  userId: string;
  name: string;
  initial: string;
  color: "blue" | "terracotta";
  incomeCents: number | null;
  pixKey: string | null;
};

export type Household = {
  id: string;
  defaultSplit: "equal" | "income";
  budgetAlerts: boolean;
  approvalThresholdCents: number | null;
  me: Member;
  partner: Member | null;
  /** Household-level share of the first member in `members` order (me first). */
  myShare: number;
  createdAt: string;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashInvite(code: string): string {
  return hmacHex(requireServerEnv("INTERNAL_API_SECRET"), `household-invite:${code.toUpperCase().replace(/[^A-Z0-9]/g, "")}`);
}

function toMember(row: { user_id: string; color: string; monthly_income_cents: number | null; pix_key: string | null }, name: string | null): Member {
  const display = (name ?? "").trim() || "Você";
  return {
    userId: row.user_id,
    name: display.split(" ")[0],
    initial: display.charAt(0).toUpperCase(),
    color: row.color as Member["color"],
    incomeCents: row.monthly_income_cents,
    pixKey: row.pix_key,
  };
}

/** The household of a user (with both members), or null when they are on their own. Cached per request. */
export const getHousehold = cache(async (userId: string): Promise<Household | null> => {
  const admin = createAdminClient();
  const { data: mine } = await admin.from("household_members").select("household_id").eq("user_id", userId).maybeSingle();
  if (!mine) return null;
  const [{ data: household }, { data: members }] = await Promise.all([
    admin.from("households").select("id, default_split, budget_alerts, approval_threshold_cents, created_at").eq("id", mine.household_id).single(),
    admin.from("household_members").select("user_id, color, monthly_income_cents, pix_key").eq("household_id", mine.household_id),
  ]);
  if (!household || !members) return null;
  const { data: profiles } = await admin.from("profiles").select("id, display_name").in("id", members.map((m) => m.user_id));
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string | null]));
  const meRow = members.find((m) => m.user_id === userId)!;
  const partnerRow = members.find((m) => m.user_id !== userId);
  const me = toMember(meRow, names.get(userId) ?? null);
  const partner = partnerRow ? toMember(partnerRow, names.get(partnerRow.user_id) ?? null) : null;
  return {
    id: household.id,
    defaultSplit: household.default_split,
    budgetAlerts: household.budget_alerts,
    approvalThresholdCents: household.approval_threshold_cents,
    me,
    partner,
    myShare: firstShare(household.default_split as SplitMethod, [me.incomeCents, partner?.incomeCents ?? null]),
    createdAt: household.created_at,
  };
});

/** Starts a household for a person on their own (idempotent). */
export async function ensureHousehold(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("household_members").select("household_id").eq("user_id", userId).maybeSingle();
  if (existing) return existing.household_id as string;
  const { data: household, error } = await admin.from("households").insert({}).select("id").single();
  if (error || !household) throw new Error(`Falha ao criar a casa: ${error?.message}`);
  const { error: memberError } = await admin.from("household_members").insert({ household_id: household.id, user_id: userId, color: "blue" });
  if (memberError) {
    await admin.from("households").delete().eq("id", household.id);
    if (memberError.code === "23505") return ensureHousehold(userId);
    throw new Error(`Falha ao entrar na casa: ${memberError.message}`);
  }
  return household.id as string;
}

/** A single-use invite code, valid for 7 days. Only a household with one person can invite. */
export async function createInvite(userId: string) {
  const householdId = await ensureHousehold(userId);
  const admin = createAdminClient();
  const { count } = await admin.from("household_members").select("user_id", { count: "exact", head: true }).eq("household_id", householdId);
  if ((count ?? 0) >= 2) throw new DomainError("Vocês já estão juntos no Prumo.");
  await admin.from("household_invites").delete().eq("household_id", householdId).is("used_at", null);
  const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const { error } = await admin.from("household_invites").insert({ household_id: householdId, created_by: userId, code_hash: hashInvite(code), expires_at: expiresAt });
  if (error) throw new Error(`Falha ao criar convite: ${error.message}`);
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt };
}

/** Joins the inviter's household. A person alone in their own household moves over (their data stays theirs). */
export async function joinHousehold(userId: string, code: string) {
  // 10 tries per 15 minutes per person on top of 32^8 codes that expire in 7 days.
  if (!rateLimit(`household-join:${userId}`, 10, 15 * 60_000)) throw new DomainError("Muitas tentativas. Tente de novo em 15 minutos.");
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("household_invites")
    .select("id, household_id, created_by, expires_at, used_at")
    .eq("code_hash", hashInvite(code))
    .maybeSingle();
  if (!invite || invite.used_at || new Date(invite.expires_at as string).getTime() < Date.now()) {
    throw new DomainError("Convite inválido ou vencido. Peça um novo ao seu par.");
  }
  if (invite.created_by === userId) throw new DomainError("Esse convite é seu. Envie para o seu par.");

  const { data: current } = await admin.from("household_members").select("household_id").eq("user_id", userId).maybeSingle();
  if (current && current.household_id === invite.household_id) return invite.household_id as string;
  if (current) {
    const { count } = await admin.from("household_members").select("user_id", { count: "exact", head: true }).eq("household_id", current.household_id);
    if ((count ?? 0) > 1) throw new DomainError("Você já está numa casa com outra pessoa. Saia dela antes.");
    await admin.from("household_members").delete().eq("user_id", userId);
    await admin.from("households").delete().eq("id", current.household_id);
  }

  const { error } = await admin.from("household_members").insert({ household_id: invite.household_id, user_id: userId, color: "terracotta" });
  if (error) {
    throw new DomainError(error.code === "23514" || error.code === "23505" ? "Essa casa já está completa." : "Não foi possível entrar na casa.");
  }
  await admin.from("household_invites").update({ used_at: new Date().toISOString(), used_by: userId }).eq("id", invite.id);
  return invite.household_id as string;
}

/**
 * Leaving ends the shared space for both. The old household keeps its history (goals, combinados,
 * settle-ups) but nobody belongs to it anymore, so a future partner of either person never sees it.
 * Each person keeps their own facts; what was "Nosso" stops being shared.
 */
export async function leaveHousehold(userId: string) {
  const admin = createAdminClient();
  const { data: member } = await admin.from("household_members").select("household_id").eq("user_id", userId).maybeSingle();
  if (!member) return;
  const { data: members } = await admin.from("household_members").select("user_id").eq("household_id", member.household_id);
  const ids = (members ?? []).map((m) => m.user_id as string);
  await admin.from("household_members").delete().eq("household_id", member.household_id);
  await admin.from("household_invites").delete().eq("household_id", member.household_id).is("used_at", null);
  await admin.from("household_proposals").update({ status: "withdrawn", decided_at: new Date().toISOString(), decided_by: userId }).eq("household_id", member.household_id).eq("status", "pending");
  for (const id of ids) {
    await admin.from("transactions").update({ scope: "mine" }).eq("user_id", id).neq("scope", "mine");
    await admin.from("upcoming_bills").update({ scope: "mine" }).eq("user_id", id).eq("scope", "ours");
    await admin.from("subscriptions").update({ scope: "mine" }).eq("user_id", id).eq("scope", "ours");
  }
}

export async function updateMember(userId: string, patch: { incomeCents?: number | null; pixKey?: string | null }) {
  const update: Record<string, unknown> = {};
  if (patch.incomeCents !== undefined) update.monthly_income_cents = patch.incomeCents;
  if (patch.pixKey !== undefined) update.pix_key = patch.pixKey;
  const { error } = await createAdminClient().from("household_members").update(update).eq("user_id", userId);
  if (error) throw new Error(`Falha ao salvar: ${error.message}`);
}

// ---------- Proposals: one proposes, the other confirms ----------

export type ProposalKind = "free_money" | "approval_threshold" | "budget" | "split";

export async function listProposals(householdId: string) {
  const { data } = await createAdminClient()
    .from("household_proposals")
    .select("id, kind, payload, proposed_by, status, created_at")
    .eq("household_id", householdId)
    .eq("status", "pending");
  return (data ?? []) as Array<{ id: string; kind: ProposalKind; payload: Record<string, unknown>; proposed_by: string; status: string; created_at: string }>;
}

/** Replaces any pending proposal of the same kind. With no partner yet, it applies right away. */
export async function propose(userId: string, kind: ProposalKind, payload: Record<string, unknown>) {
  const household = await getHousehold(userId);
  const householdId = household?.id ?? (await ensureHousehold(userId));
  const admin = createAdminClient();
  await admin.from("household_proposals").update({ status: "withdrawn", decided_at: new Date().toISOString(), decided_by: userId }).eq("household_id", householdId).eq("kind", kind).eq("status", "pending");
  if (!household?.partner) {
    await applyProposal(householdId, kind, payload);
    return { applied: true };
  }
  const { error } = await admin.from("household_proposals").insert({ household_id: householdId, kind, payload, proposed_by: userId });
  if (error) throw new Error(`Falha ao enviar proposta: ${error.message}`);
  return { applied: false };
}

export async function decideProposal(userId: string, proposalId: string, accept: boolean) {
  const household = await getHousehold(userId);
  if (!household) throw new DomainError("Você ainda não tem uma casa no Prumo.");
  const admin = createAdminClient();
  const { data: proposal } = await admin
    .from("household_proposals")
    .select("id, kind, payload, proposed_by, status")
    .eq("id", proposalId)
    .eq("household_id", household.id)
    .maybeSingle();
  if (!proposal || proposal.status !== "pending") throw new DomainError("Essa proposta já foi resolvida.");
  if (accept && proposal.proposed_by === userId) throw new DomainError("Quem confirma é o seu par.");
  const { data: updated } = await admin
    .from("household_proposals")
    .update({ status: accept ? "accepted" : "withdrawn", decided_at: new Date().toISOString(), decided_by: userId })
    .eq("id", proposalId)
    .eq("status", "pending")
    .select("id");
  if (!updated?.length) return;
  if (accept) await applyProposal(household.id, proposal.kind as ProposalKind, proposal.payload as Record<string, unknown>);
}

async function applyProposal(householdId: string, kind: ProposalKind, payload: Record<string, unknown>) {
  const admin = createAdminClient();
  if (kind === "approval_threshold") {
    await admin.from("households").update({ approval_threshold_cents: (payload.amountCents as number | null) ?? null }).eq("id", householdId);
  } else if (kind === "split") {
    await admin.from("households").update({ default_split: payload.defaultSplit }).eq("id", householdId);
    const rules = (payload.rules as Array<{ category: string; method: string; fixedShare?: number | null }> | undefined) ?? [];
    await admin.from("split_rules").delete().eq("household_id", householdId);
    if (rules.length) {
      await admin.from("split_rules").insert(rules.map((r) => ({ household_id: householdId, category: r.category, method: r.method, fixed_share: r.fixedShare ?? null })));
    }
  } else if (kind === "budget") {
    const lines = (payload.lines as Array<{ category: string; amountCents: number }>) ?? [];
    await admin.from("household_budgets").delete().eq("household_id", householdId);
    if (lines.length) await admin.from("household_budgets").insert(lines.map((l) => ({ household_id: householdId, category: l.category, amount_cents: l.amountCents })));
  } else if (kind === "free_money") {
    const amounts = payload.amounts as Record<string, number>;
    const effectiveFrom = payload.effectiveFrom as string;
    const rows = Object.entries(amounts).map(([userId, amountCents]) => ({ household_id: householdId, user_id: userId, amount_cents: amountCents, effective_from: effectiveFrom }));
    await admin.from("free_money_allowances").upsert(rows, { onConflict: "household_id,user_id,effective_from" });
  }
}

/** Free money allowance in force for a person on a date (latest effective_from on or before it). */
export async function freeMoneyAllowance(householdId: string, userId: string, onDate: string): Promise<number | null> {
  const { data } = await createAdminClient()
    .from("free_money_allowances")
    .select("amount_cents")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .lte("effective_from", onDate)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.amount_cents as number | undefined) ?? null;
}
