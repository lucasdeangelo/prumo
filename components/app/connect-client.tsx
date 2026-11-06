"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { connectTokenAction, importConnectionAction, stageConnectionAction, stageExistingAction } from "@/app/(app)/connect/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";

const MEUPLUGGY_CONNECTOR_ID = 200;

/** Step 5: opens Pluggy Connect on the MeuPluggy connector, then moves to account choice. */
export function AuthorizeButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  async function staged(result: { itemId?: string; accounts?: number; error?: string }) {
    if (result.error || !result.itemId) {
      setError(result.error ?? "Não foi possível concluir a conexão.");
      return;
    }
    router.push(result.accounts ? `/connect?step=6&item=${result.itemId}` : `/connect?step=sem-banco&item=${result.itemId}`);
  }

  async function open() {
    setError(undefined);
    const token = await connectTokenAction();
    if (!token.token) {
      setError(token.error ?? "Não foi possível abrir a autorização.");
      return;
    }
    const { PluggyConnect } = await import("pluggy-connect-sdk");
    const widget = new PluggyConnect({
      connectToken: token.token,
      includeSandbox: token.includeSandbox,
      connectorIds: token.includeSandbox ? undefined : [MEUPLUGGY_CONNECTOR_ID],
      selectedConnectorId: token.includeSandbox ? undefined : MEUPLUGGY_CONNECTOR_ID,
      language: "pt",
      theme: "light",
      onSuccess: ({ item }) => start(async () => staged(await stageConnectionAction(item.id))),
      onError: ({ message }) => {
        // Older connect tokens could still refuse a second bank; fall back to the last connection.
        if (message.includes("ITEM_USER_ALREADY_EXISTS")) start(async () => staged(await stageExistingAction()));
        else setError(`Pluggy: ${message}`);
      },
    });
    await widget.init();
  }

  return (
    <div className="grid gap-2">
      <Button type="button" className="w-full" disabled={pending} onClick={() => start(open)}>
        {pending ? "Aguarde…" : "Autorizar e escolher contas"}
      </Button>
      <FormMessage state={error ? { error } : undefined} />
    </div>
  );
}

/** Step 7: imports the chosen accounts' history and moves on when done. */
export function InitialSync({ itemId, accounts }: { itemId: string; accounts: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string>();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    if (!started.current) {
      started.current = true;
      importConnectionAction(itemId).then((result) => {
        clearInterval(timer);
        if (result.error) setError(result.error);
        else router.replace(`/connect?step=${result.partial ? "parcial" : "8"}&item=${itemId}&n=${result.imported ?? 0}`);
      });
    }
    return () => clearInterval(timer);
  }, [itemId, router]);

  // An honest, slowing progress: it never claims to be done before the server says so.
  const progress = Math.min(92, Math.round(100 * (1 - Math.exp(-elapsed / 25))));

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-primary transition-[width] duration-1000" style={{ width: `${error ? 0 : progress}%` }} />
        </div>
        <p className="tabular text-[13px] text-muted-foreground">{error ? "Parou" : `${progress}%`}</p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {accounts.map((a) => (
          <li key={a.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{a.name}</span>
            <span className="text-[13px] text-muted-foreground">{error ? "—" : "trazendo…"}</span>
          </li>
        ))}
      </ul>
      <FormMessage state={error ? { error } : undefined} />
    </div>
  );
}

/** Step 3: opens MeuPluggy in a new tab and moves this screen to "De volta ao Prumo". */
export function OpenMeuPluggy({ label = "Abrir MeuPluggy", next = "/connect?step=4", variant = "default" }: { label?: string; next?: string; variant?: "default" | "outline" }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant={variant}
      className="w-full"
      onClick={() => {
        window.open("https://meu.pluggy.ai", "_blank", "noopener,noreferrer");
        router.push(next);
      }}
    >
      {label}
    </Button>
  );
}
