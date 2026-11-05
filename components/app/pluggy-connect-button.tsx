"use client";

import { Landmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { pluggyConnectTokenAction, pluggyRegisterItemAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";

function explainPluggyError(code: string): string {
  if (code.includes("ITEM_USER_ALREADY_EXISTS")) {
    return "Essa conexão já existe. O MeuPluggy reúne todos os seus bancos numa conexão só: conecte o novo banco em meu.pluggy.ai e ele entra na próxima atualização automática (a cada 24 h). Depois toque em “Sincronizar agora”.";
  }
  return `Pluggy: ${code}`;
}

/** Opens the Pluggy Connect widget. The token is created server-side; bank credentials never touch our app. */
export function PluggyConnectButton({ updateItemId, label = "Conectar banco" }: { updateItemId?: string; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; ok?: string }>();

  async function open() {
    setMessage(undefined);
    const result = await pluggyConnectTokenAction(updateItemId);
    if (!result.token) {
      setMessage({ error: result.error ?? "Não foi possível abrir a conexão." });
      return;
    }
    const { PluggyConnect } = await import("pluggy-connect-sdk");
    const widget = new PluggyConnect({
      connectToken: result.token,
      includeSandbox: result.includeSandbox,
      updateItem: updateItemId,
      language: "pt",
      theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      onSuccess: ({ item }) => {
        setMessage({ ok: "Importando movimentações…" });
        startTransition(async () => {
          const saved = await pluggyRegisterItemAction(item.id);
          setMessage(saved);
          router.refresh();
        });
      },
      onError: ({ message: error }) => setMessage({ error: explainPluggyError(error) }),
    });
    await widget.init();
  }

  return (
    <div className="grid gap-2">
      <Button type="button" onClick={() => startTransition(open)} disabled={pending} variant={updateItemId ? "outline" : "default"} className="w-full">
        <Landmark aria-hidden="true" /> {pending ? "Aguarde…" : label}
      </Button>
      <FormMessage state={message} />
    </div>
  );
}
