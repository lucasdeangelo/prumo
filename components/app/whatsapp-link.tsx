"use client";

import { MessageCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { whatsappCodeAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";

export function WhatsappLinkCode({ botNumber }: { botNumber?: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ code?: string; expiresAt?: string; error?: string }>();

  const deepLink = result?.code && botNumber ? `https://wa.me/${botNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`vincular ${result.code}`)}` : null;

  return (
    <div className="grid gap-3">
      {result?.code ? (
        <div className="rounded-[10px] bg-muted p-3 text-center">
          <p className="text-xs text-muted-foreground">Envie para o número do bot:</p>
          <p className="tabular mt-1 select-all text-2xl font-semibold tracking-widest">vincular {result.code}</p>
          <p className="mt-1 text-xs text-muted-foreground">Válido por 15 minutos, uso único.</p>
        </div>
      ) : null}
      {deepLink ? (
        <a href={deepLink} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground">
          <MessageCircle aria-hidden="true" className="size-4" /> Abrir no WhatsApp
        </a>
      ) : null}
      <Button type="button" variant={result?.code ? "outline" : "default"} disabled={pending} onClick={() => startTransition(async () => setResult(await whatsappCodeAction()))}>
        {pending ? "Gerando…" : result?.code ? "Gerar outro código" : "Vincular WhatsApp"}
      </Button>
      <FormMessage state={result?.error ? { error: result.error } : undefined} />
    </div>
  );
}
