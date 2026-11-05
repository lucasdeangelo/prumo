"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { recordInvoiceSettlement, setAutoOurs, setInvoiceOwner } from "@/lib/application/cards";
import { DomainError } from "@/lib/application/transactions";

export type CardsState = { error?: string; ok?: string } | undefined;

const owner = z.enum(["ours", "holder", "partner"]);

function back(formData: FormData, fallback: string): string {
  const path = String(formData.get("returnTo") ?? "");
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}

/** Tap on the owner marker: Nosso → holder → partner → Nosso. */
export async function cycleOwnerAction(formData: FormData) {
  const { user } = await requireUser();
  const parsed = z.object({ id: z.uuid(), next: owner }).safeParse({ id: formData.get("id"), next: formData.get("next") });
  if (parsed.success) {
    try {
      await setInvoiceOwner(user.id, parsed.data.id, parsed.data.next);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
    }
  }
  revalidatePath("/", "layout");
  redirect(back(formData, "/cards"));
}

export async function batchOwnerAction(_: CardsState, formData: FormData): Promise<CardsState> {
  const { user } = await requireUser();
  const ids = formData.getAll("ids").map(String).filter((id) => z.uuid().safeParse(id).success);
  const parsed = z
    .object({ owner, method: z.enum(["equal", "income", "fixed"]), share: z.coerce.number().min(0).max(100).optional(), always: z.string().optional() })
    .safeParse({ owner: formData.get("owner"), method: formData.get("method") ?? "income", share: formData.get("share") || undefined, always: formData.get("always") ?? undefined });
  if (ids.length === 0) return { error: "Selecione ao menos uma compra." };
  if (!parsed.success) return { error: "Escolha de quem são as compras." };
  const { owner: to, method, share, always } = parsed.data;
  const split = to === "ours" ? { method, share: share !== undefined ? share / 100 : null } : undefined;
  try {
    for (const id of ids) await setInvoiceOwner(user.id, id, to, split);
    if (to === "ours" && always) await setAutoOurs(user.id, always, method, share !== undefined ? share / 100 : null);
  } catch (error) {
    return { error: error instanceof DomainError ? error.message : "Não foi possível aplicar." };
  }
  revalidatePath("/", "layout");
  redirect(back(formData, "/cards"));
}

export async function settleInvoiceAction(formData: FormData) {
  const { user } = await requireUser();
  const parsed = z
    .object({ cardId: z.uuid(), month: z.string().regex(/^\d{4}-\d{2}$/), amount: z.coerce.number().int().positive() })
    .safeParse({ cardId: formData.get("cardId"), month: formData.get("month"), amount: formData.get("amount") });
  if (parsed.success) {
    try {
      await recordInvoiceSettlement(user.id, parsed.data.cardId, parsed.data.month, parsed.data.amount);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
    }
  }
  revalidatePath("/", "layout");
  redirect(back(formData, "/cards"));
}
