"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { setInvestmentPreference } from "@/lib/application/investments";
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
