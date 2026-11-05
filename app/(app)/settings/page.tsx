import { ChevronRight, LogOut, Tags } from "lucide-react";
import Link from "next/link";

import { archiveAccountAction, pluggyDisconnectAction, whatsappUnlinkAction } from "@/app/(app)/actions";
import { Amount, PageHeader } from "@/components/app/bits";
import { ManualAccountForm, SyncButton } from "@/components/app/forms";
import { PluggyConnectButton } from "@/components/app/pluggy-connect-button";
import { WhatsappLinkCode } from "@/components/app/whatsapp-link";
import { Card, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env.server";
import { getWhatsappLink, listAccounts, listPluggyItems } from "@/lib/repositories/reads";

export const metadata = { title: "Ajustes · Prumo" };

const STATUS_LABEL: Record<string, string> = {
  UPDATED: "Atualizada",
  UPDATING: "Atualizando…",
  LOGIN_ERROR: "Precisa reconectar",
  OUTDATED: "Desatualizada",
  WAITING_USER_INPUT: "Aguardando você",
};

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function SettingsPage() {
  const { user, db } = await requireUser();
  const env = getServerEnv();
  const [items, accounts, link] = await Promise.all([listPluggyItems(db, user.id), listAccounts(db, user.id), getWhatsappLink(db, user.id)]);
  const pluggyReady = Boolean(env.PLUGGY_CLIENT_ID && env.PLUGGY_CLIENT_SECRET);
  const linked = link?.verified_at ? link : null;

  return (
    <div className="grid gap-4">
      <PageHeader title="Ajustes" subtitle={user.email ?? undefined} />

      <Card>
        <CardTitle>Bancos (Open Finance)</CardTitle>
        {items.length > 0 ? (
          <ul className="mb-4 grid gap-4">
            {items.map((item) => {
              const itemAccounts = accounts.filter((a) => a.pluggy_item_id === item.id);
              return (
                <li key={item.id} className="grid gap-2 rounded-[10px] border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{item.institution_name ?? "Banco"}</p>
                    <span className="text-xs text-muted-foreground">{STATUS_LABEL[item.status ?? ""] ?? item.status}</span>
                  </div>
                  {itemAccounts.map((a) => (
                    <div key={a.id} className="flex justify-between text-sm">
                      <span className="truncate text-muted-foreground">{a.name}</span>
                      {a.balance_cents !== null ? <Amount cents={a.balance_cents} className="text-sm font-medium" /> : null}
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Última sincronização: {item.last_sync_at ? dateTime.format(new Date(item.last_sync_at)) : "nunca"}</p>
                  <SyncButton itemId={item.pluggy_item_id} />
                  {item.status === "LOGIN_ERROR" || item.status === "OUTDATED" ? <PluggyConnectButton updateItemId={item.pluggy_item_id} label="Reconectar" /> : null}
                  <form action={pluggyDisconnectAction}>
                    <input type="hidden" name="itemId" value={item.pluggy_item_id} />
                    <SubmitButton variant="ghost" className="w-full text-danger" pendingText="Desconectando…">Desconectar (mantém o histórico)</SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">Conecte sua conta pela Pluggy para importar entradas e saídas com tags automáticas. O Prumo não vê sua senha do banco.</p>
        )}
        {items.some((item) => item.institution_name === "MeuPluggy") ? (
          <p className="mb-3 rounded-[10px] bg-muted p-3 text-sm text-muted-foreground">
            O MeuPluggy reúne todos os seus bancos numa conexão só. Para incluir outro banco, conecte-o em{" "}
            <a href="https://meu.pluggy.ai" target="_blank" rel="noreferrer" className="font-medium text-primary underline">meu.pluggy.ai</a>. Ele entra na próxima atualização automática da Pluggy (a cada 24 h); depois toque em <strong>Sincronizar agora</strong>.
          </p>
        ) : null}
        {pluggyReady ? <PluggyConnectButton /> : <p className="rounded-[10px] bg-muted p-3 text-sm text-muted-foreground">Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no servidor para habilitar.</p>}
      </Card>

      <Card>
        <CardTitle>WhatsApp</CardTitle>
        {linked ? (
          <div className="grid gap-3">
            <p className="text-sm">
              {linked.chat_id?.endsWith("@lid") ? "WhatsApp vinculado" : <>Vinculado ao número <strong className="tabular">{linked.phone_normalized}</strong></>}
              . Envie <em>ajuda</em> para o bot ver os comandos.
            </p>
            <form action={whatsappUnlinkAction}>
              <SubmitButton variant="ghost" className="w-full text-danger" pendingText="…">Desvincular</SubmitButton>
            </form>
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">Registre gastos por mensagem e receba avisos de contas e assinaturas.</p>
            <WhatsappLinkCode botNumber={process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER} />
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Contas manuais</CardTitle>
        {accounts.filter((a) => a.is_manual).length > 0 ? (
          <ul className="mb-4 grid gap-2">
            {accounts.filter((a) => a.is_manual).map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{a.name}</span>
                {a.balance_cents !== null ? <Amount cents={a.balance_cents} className="text-sm" /> : null}
                <form action={archiveAccountAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton variant="ghost" pendingText="…" className="text-xs">Arquivar</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <ManualAccountForm />
      </Card>

      <Link href="/settings/tags" className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4">
        <Tags aria-hidden="true" className="size-5 text-muted-foreground" />
        <span className="flex-1 font-medium">Tags e regras automáticas</span>
        <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
      </Link>

      <form action="/auth/signout" method="post">
        <button type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-medium text-muted-foreground hover:bg-muted">
          <LogOut aria-hidden="true" className="size-4" /> Sair
        </button>
      </form>
    </div>
  );
}
