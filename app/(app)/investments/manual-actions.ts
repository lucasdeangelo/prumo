"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createManualInvestment, deleteManualInvestment, MANUAL_KINDS, recordManualMovement, type ManualKind, type MovementInput } from "@/lib/application/manual-investments";
import { DomainError } from "@/lib/application/transactions";
import { requireUser } from "@/lib/auth/session";
import { isIsoDate } from "@/lib/domain/dates";
import { parseBRL } from "@/lib/domain/money";

export type ManualState = { error?: string } | undefined;

/** "6,5" or "110" or "0,0042": a typed decimal, never through BRL parsing (no cents rounding). */
function decimal(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim().replace(/\s|%/g, "");
  if (!text) return null;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function friendly(error: unknown): ManualState {
  if (error instanceof DomainError) return { error: error.message };
  console.error("manual investment failed", error instanceof Error ? error.message : error);
  return { error: "Algo deu errado. Tente novamente." };
}

export async function createManualInvestmentAction(_: ManualState, formData: FormData): Promise<ManualState> {
  const { user } = await requireUser();
  const base = z
    .object({
      kind: z.enum(Object.keys(MANUAL_KINDS) as [ManualKind, ...ManualKind[]]),
      scope: z.enum(["mine", "ours"]).default("mine"),
      date: z.string().refine(isIsoDate, "Informe a data."),
      index: z.enum(["cdi", "selic", "pre", "ipca"]).optional(),
      due: z.string().optional(),
      goalId: z.string().optional(),
      name: z.string().max(160).optional(),
      institution: z.string().max(80).optional(),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!base.success) return { error: base.error.issues[0].message };
  const d = base.data;
  const due = d.due && isIsoDate(d.due) ? d.due : null;
  const goalId = d.goalId && z.uuid().safeParse(d.goalId).success ? d.goalId : null;
  let id: string;
  try {
    id = await createManualInvestment(user.id, {
      kind: d.kind,
      scope: d.scope,
      name: d.name ?? null,
      institution: d.institution ?? null,
      date: d.date,
      goalId,
      amountCents: parseBRL(String(formData.get("amount") ?? "")) ?? undefined,
      index: d.index,
      rate: decimal(formData.get("rate")),
      due,
      quantity: decimal(formData.get("quantity")) ?? undefined,
      priceCents: parseBRL(String(formData.get("price") ?? "")) ?? undefined,
    });
  } catch (error) {
    return friendly(error);
  }
  revalidatePath("/", "layout");
  redirect(`/investments/${id}`);
}

export async function recordMovementAction(_: ManualState, formData: FormData): Promise<ManualState> {
  const { user } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  const kind = z.enum(["aporte", "resgate", "compra", "venda", "cotacao", "valor"]).safeParse(formData.get("kind"));
  if (!id.success || !kind.success) return { error: "Movimentação inválida." };
  const date = String(formData.get("date") ?? "");
  const amount = parseBRL(String(formData.get("amount") ?? ""));
  const price = parseBRL(String(formData.get("price") ?? ""));
  const quantity = decimal(formData.get("quantity"));
  let input: MovementInput;
  if (kind.data === "cotacao") {
    if (!price) return { error: "Informe a cotação." };
    input = { kind: "cotacao", priceCents: price };
  } else if (kind.data === "valor") {
    if (amount === null) return { error: "Informe o valor atual." };
    input = { kind: "valor", amountCents: amount };
  } else if (!isIsoDate(date)) {
    return { error: "Informe a data." };
  } else if (kind.data === "aporte" || kind.data === "resgate") {
    if (!amount) return { error: "Informe o valor." };
    input = { kind: kind.data, amountCents: amount, date };
  } else {
    if (!quantity || !price) return { error: "Informe a quantidade e o preço." };
    input = { kind: kind.data, quantity, priceCents: price, date };
  }
  try {
    await recordManualMovement(user.id, id.data, input);
  } catch (error) {
    return friendly(error);
  }
  revalidatePath("/", "layout");
  redirect(`/investments/${id.data}`);
}

export async function deleteManualAction(formData: FormData) {
  const { user } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (id.success) {
    try {
      await deleteManualInvestment(user.id, id.data);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
    }
  }
  revalidatePath("/", "layout");
  redirect("/investments");
}
