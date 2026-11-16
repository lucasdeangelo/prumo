"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { setInvestmentPreference } from "@/lib/application/investments";
import { linkInvestment, unlinkInvestment } from "@/lib/application/plans";
import { DomainError } from "@/lib/application/transactions";
import { parseBRL } from "@/lib/domain/money";
import { requireUser } from "@/lib/auth/session";
import { safeRelativePath } from "@/lib/safe-path";

const preference = z.discriminatedUnion("field", [
  z.object({ field: z.literal("scope"), value: z.enum(["mine", "ours"]) }),
  z.object({ field: z.literal("visibility"), value: z.enum(["private", "totals", "details"]) }),
  z.object({ field: z.literal("include"), value: z.enum(["true", "false"]) }),
]);

/** One choice about one asset, from a segmented control that submits on tap. */
export async function investmentPreferenceAction(formData: FormData) {
  const { user } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = preference.safeParse({ field: formData.get("field"), value: formData.get("value") });
  if (id.success && parsed.success) {
    const { field, value } = parsed.data;
    await setInvestmentPreference(
      user.id,
      id.data,
      field === "scope" ? { scope: value } : field === "visibility" ? { visibility: value } : { include: value === "true" },
    );
  }
  revalidatePath("/", "layout");
  redirect(safeRelativePath(formData.get("returnTo"), "/investments"));
}

export type LinkState = { error?: string } | undefined;

/** "Vincular à meta": the whole asset or a part of it counts for one goal. */
export async function linkInvestmentAction(_: LinkState, formData: FormData): Promise<LinkState> {
  const { user } = await requireUser();
  const parsed = z
    .object({ id: z.uuid(), goalId: z.uuid({ message: "Escolha uma meta." }), mode: z.enum(["all", "part"]) })
    .safeParse({ id: formData.get("id"), goalId: formData.get("goalId"), mode: formData.get("mode") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const part = parsed.data.mode === "part" ? parseBRL(String(formData.get("part") ?? "")) : null;
  if (parsed.data.mode === "part" && !part) return { error: "Informe quanto deste investimento conta para a meta." };
  try {
    await linkInvestment(user.id, parsed.data.id, parsed.data.goalId, parsed.data.mode, part);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    console.error("link investment failed", error instanceof Error ? error.message : error);
    return { error: "Algo deu errado. Tente novamente." };
  }
  revalidatePath("/", "layout");
  redirect(safeRelativePath(formData.get("returnTo"), `/investments/${parsed.data.id}`));
}

export async function unlinkInvestmentAction(formData: FormData) {
  const { user } = await requireUser();
  const parsed = z.object({ id: z.uuid(), goalId: z.uuid() }).safeParse({ id: formData.get("id"), goalId: formData.get("goalId") });
  if (parsed.success) {
    try {
      await unlinkInvestment(user.id, parsed.data.id, parsed.data.goalId);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
    }
  }
  revalidatePath("/", "layout");
  redirect(safeRelativePath(formData.get("returnTo"), "/investments"));
}
