"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import {
  createInvite,
  decideProposal,
  ensureHousehold,
  joinHousehold,
  leaveHousehold,
  propose,
  updateMember,
} from "@/lib/application/household";
import { createPrivacyRule, deletePrivacyRule, setAccountVisibility, setSurprise, setTransactionPrivacy } from "@/lib/application/privacy";
import { DomainError } from "@/lib/application/transactions";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBRL } from "@/lib/domain/money";
import { normalizePixKey } from "@/lib/domain/pix";
import { safeRelativePath } from "@/lib/safe-path";
import { SPACE_COOKIE } from "@/lib/space";

export type ActionState = { error?: string; ok?: string; code?: string } | undefined;

function friendly(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  console.error("couple action failed", error instanceof Error ? error.message : error);
  return "Algo deu errado. Tente novamente.";
}

function safePath(value: FormDataEntryValue | null, fallback: string): string {
  return safeRelativePath(value, fallback);
}

/** Switches Meu | Nosso and remembers it, so Início opens the last space used. */
export async function setSpaceAction(formData: FormData) {
  await requireUser();
  const space = formData.get("space") === "nosso" ? "nosso" : "meu";
  (await cookies()).set(SPACE_COOKIE, space, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect(safePath(formData.get("returnTo"), "/overview"));
}

export async function createInviteAction(): Promise<ActionState> {
  const { user } = await requireUser();
  try {
    const { code } = await createInvite(user.id);
    return { code };
  } catch (error) {
    return { error: friendly(error) };
  }
}

export async function joinHouseholdAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireUser();
  const code = String(formData.get("code") ?? "").trim();
  if (code.replace(/[^A-Za-z0-9]/g, "").length < 6) return { error: "Digite o código do convite." };
  try {
    await joinHousehold(user.id, code);
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath("/", "layout");
  redirect("/couple?entrou=1");
}

export async function leaveHouseholdAction() {
  const { user } = await requireUser();
  await leaveHousehold(user.id);
  (await cookies()).set(SPACE_COOKIE, "meu", { path: "/" });
  revalidatePath("/", "layout");
  redirect("/settings");
}

const memberSchema = z.object({ income: z.string().optional(), pixKey: z.string().max(77).optional() });

export async function updateMemberAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireUser();
  const parsed = memberSchema.safeParse({ income: formData.get("income") ?? undefined, pixKey: formData.get("pixKey") ?? undefined });
  if (!parsed.success) return { error: "Dados inválidos." };
  const incomeText = parsed.data.income?.trim();
  const incomeCents = incomeText ? parseBRL(incomeText) : null;
  if (incomeText && !incomeCents) return { error: "Renda inválida. Ex.: 5.800,00" };
  const pix = parsed.data.pixKey?.trim();
  if (pix && normalizePixKey(pix).length < 5) return { error: "Chave Pix inválida." };
  try {
    await ensureHousehold(user.id);
    await updateMember(user.id, { incomeCents, pixKey: pix || null });
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath("/", "layout");
  return { ok: "Salvo." };
}

export async function decideProposalAction(formData: FormData) {
  const { user } = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  const accept = formData.get("accept") === "1";
  try {
    await decideProposal(user.id, id, accept);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
  }
  revalidatePath("/", "layout");
  redirect(safePath(formData.get("returnTo"), "/couple"));
}

export async function proposeSplitAction(formData: FormData) {
  const { user } = await requireUser();
  const defaultSplit = formData.get("defaultSplit") === "equal" ? "equal" : "income";
  const rules = String(formData.get("equalCategories") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((category) => ({ category, method: "equal" }));
  await propose(user.id, "split", { defaultSplit, rules });
  revalidatePath("/", "layout");
  redirect("/couple");
}

// ---------- Privacy (only the owner's own data; never notifies the partner) ----------

const visibilityValue = z.enum(["private", "totals", "details"]);

export async function setVisibilityAction(formData: FormData) {
  const { user } = await requireUser();
  const parsed = z.object({ accountId: z.uuid(), visibility: visibilityValue }).safeParse({ accountId: formData.get("accountId"), visibility: formData.get("visibility") });
  if (parsed.success) await setAccountVisibility(user.id, parsed.data.accountId, parsed.data.visibility);
  revalidatePath("/", "layout");
  redirect(safePath(formData.get("returnTo"), "/privacy/visibility"));
}

export async function setPartnerCardAction(formData: FormData) {
  const { user } = await requireUser();
  const accountId = z.uuid().safeParse(formData.get("accountId"));
  const last4 = String(formData.get("last4") ?? "").replace(/\D/g, "").slice(-4);
  if (accountId.success) {
    await createAdminClient().from("accounts").update({ partner_card_last4: last4.length === 4 ? last4 : null }).eq("user_id", user.id).eq("id", accountId.data);
    if (last4.length === 4) {
      await createAdminClient().from("transactions").update({ scope: "partner" }).eq("user_id", user.id).eq("account_id", accountId.data).eq("card_last4", last4).eq("scope", "mine");
    }
  }
  revalidatePath("/", "layout");
  redirect("/privacy/visibility");
}

export async function txPrivacyAction(formData: FormData) {
  const { user } = await requireUser();
  const parsed = z
    .object({
      id: z.uuid(),
      scope: z.enum(["mine", "ours"]).optional(),
      privacy: z.enum(["account", "category_only", "hidden"]).optional(),
      freeMoney: z.enum(["0", "1"]).optional(),
    })
    .safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (parsed.success) {
    const { id, scope, privacy, freeMoney } = parsed.data;
    try {
      await setTransactionPrivacy(user.id, id, { scope, privacy, freeMoney: freeMoney === undefined ? undefined : freeMoney === "1" });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
    }
  }
  revalidatePath("/", "layout");
  redirect(safePath(formData.get("returnTo"), "/monthly"));
}

export async function surpriseAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Movimentação inválida." };
  const preset = String(formData.get("preset") ?? "");
  const until = preset && preset !== "custom" ? preset : String(formData.get("until") ?? "");
  try {
    await setSurprise(user.id, id.data, until || null, formData.get("hideAmount") === "on");
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath("/", "layout");
  redirect(`/transactions/${id.data}`);
}

export async function clearSurpriseAction(formData: FormData) {
  const { user } = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  await setSurprise(user.id, id, null, false);
  revalidatePath("/", "layout");
  redirect(`/transactions/${id}`);
}

export async function createPrivacyRuleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireUser();
  const parsed = z
    .object({
      matchType: z.enum(["tag", "merchant", "account"]),
      tagId: z.string().optional(),
      accountId: z.string().optional(),
      pattern: z.string().max(60).optional(),
      action: z.enum(["category_only", "hidden", "ask_surprise"]),
      apply90: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Preencha a regra." };
  const d = parsed.data;
  if (d.matchType === "tag" && !d.tagId) return { error: "Escolha a categoria." };
  if (d.matchType === "account" && !d.accountId) return { error: "Escolha a conta." };
  if (d.matchType === "merchant" && (d.pattern ?? "").trim().length < 2) return { error: "Digite parte do nome da loja." };
  try {
    await createPrivacyRule(user.id, { matchType: d.matchType, tagId: d.tagId || null, accountId: d.accountId || null, pattern: d.pattern ?? null, action: d.action }, d.apply90 === "on" ? 90 : null);
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath("/", "layout");
  return { ok: "Regra criada." };
}

export async function deletePrivacyRuleAction(formData: FormData) {
  const { user } = await requireUser();
  await deletePrivacyRule(user.id, z.uuid().parse(formData.get("id")));
  revalidatePath("/privacy/rules");
}
