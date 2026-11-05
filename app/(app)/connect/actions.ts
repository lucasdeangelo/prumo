"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { disconnectItem, stageConnection, syncItem } from "@/lib/application/pluggy-sync";
import { setAccountImport } from "@/lib/application/privacy";
import { ConfigurationError, getServerEnv } from "@/lib/env.server";
import { createConnectToken, PluggyError } from "@/lib/integrations/pluggy";
import { createAdminClient } from "@/lib/supabase/admin";


function friendly(error: unknown): string {
  if (error instanceof ConfigurationError) return `Integração não configurada (${error.variable}).`;
  if (error instanceof PluggyError) return error.message;
  console.error("connect action failed", error instanceof Error ? error.message : error);
  return "Algo deu errado. Tente novamente.";
}

export async function connectTokenAction(): Promise<{ token?: string; includeSandbox?: boolean; error?: string }> {
  const { user } = await requireUser();
  try {
    return { token: await createConnectToken(user.id), includeSandbox: getServerEnv().PLUGGY_INCLUDE_SANDBOX === "true" };
  } catch (error) {
    return { error: friendly(error) };
  }
}

/** After the widget: saves the connection and lists its accounts for step 6. */
export async function stageConnectionAction(itemId: string): Promise<{ itemId?: string; accounts?: number; error?: string }> {
  const { user } = await requireUser();
  const id = z.uuid().safeParse(itemId);
  if (!id.success) return { error: "Conexão inválida." };
  try {
    const staged = await stageConnection(user.id, id.data);
    return { itemId: staged.itemId, accounts: staged.accountCount };
  } catch (error) {
    return { error: friendly(error) };
  }
}

/** The MeuPluggy connection already exists ("ITEM_USER_ALREADY_EXISTS"): reuse it. */
export async function stageExistingAction(): Promise<{ itemId?: string; accounts?: number; error?: string }> {
  const { user } = await requireUser();
  const { data } = await createAdminClient()
    .from("pluggy_items")
    .select("pluggy_item_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { error: "Não encontramos sua conexão MeuPluggy. Tente de novo em alguns minutos." };
  return stageConnectionAction(data.pluggy_item_id as string);
}

export async function setImportAction(formData: FormData) {
  const { user } = await requireUser();
  const accountId = z.uuid().parse(formData.get("accountId"));
  await setAccountImport(user.id, accountId, formData.get("import") === "1");
  redirect(String(formData.get("returnTo") ?? "/connect?step=6"));
}

export async function importConnectionAction(itemId: string): Promise<{ imported?: number; accounts?: number; partial?: boolean; error?: string }> {
  const { user } = await requireUser();
  const id = z.uuid().safeParse(itemId);
  if (!id.success) return { error: "Conexão inválida." };
  try {
    const result = await syncItem(user.id, id.data);
    revalidatePath("/", "layout");
    return { imported: result.perAccount.reduce((s, a) => s + a.imported, 0), accounts: result.perAccount.length, partial: result.executionStatus === "PARTIAL_SUCCESS" };
  } catch (error) {
    return { error: friendly(error) };
  }
}

export async function disconnectAction(formData: FormData) {
  const { user } = await requireUser();
  const itemId = z.uuid().parse(formData.get("itemId"));
  await disconnectItem(user.id, itemId, { purge: formData.get("history") === "purge" });
  revalidatePath("/", "layout");
  redirect("/settings/connections?desconectado=1");
}
