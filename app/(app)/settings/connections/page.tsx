import Link from "next/link";

import { PageHeader, SectionHeader } from "@/components/app/bits";
import { Avatar, InstitutionMark, UpdatedAt, VisibilityBadge } from "@/components/app/couple";
import { Card, EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/application/connections";
import { loadAccounts } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
import { getServerEnv } from "@/lib/env.server";

export const metadata = { title: "Conexões · Prumo" };

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ desconectado?: string }> }) {
  const { user } = await requireUser();
  const { desconectado } = await searchParams;
  const [connections, household] = await Promise.all([listConnections(user.id), getHousehold(user.id)]);
  const partner = household?.partner ?? null;
  const partnerShared = partner ? (await loadAccounts([partner.userId])).filter((a) => a.visibility !== "private" && a.pluggy_item_id) : [];
  const pluggyReady = Boolean(getServerEnv().PLUGGY_CLIENT_ID);

  return (
    <div className="grid gap-4">
      <PageHeader title="Conexões" subtitle={`Pelo MeuPluggy${user.email ? ` · ${user.email}` : ""} · atualização diária`} back="/settings" />
      {desconectado ? <p role="status" className="rounded-[10px] bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">Banco desconectado.</p> : null}

      {connections.length === 0 ? (
        <EmptyState title="Nenhum banco conectado">Traga saldos e lançamentos pelo Open Finance, sem digitar nada.</EmptyState>
      ) : (
        connections.map((c) => (
          <Card key={`${c.id}-${c.institution}`} className="grid gap-3">
            <div className="flex items-center gap-3">
              <InstitutionMark name={c.institution} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">{c.institution}</p>
                {c.state === "ok" ? (
                  <UpdatedAt at={c.lastSuccessAt} />
                ) : (
                  <Link href={`/settings/connections/${c.pluggyItemId}`} className="text-[13px] font-medium text-danger hover:text-danger">
                    {c.state === "expired" ? "Autorização vencida · reconectar" : `Falhou hoje · dados de ${c.lastSuccessAt ? dateFormat.format(new Date(c.lastSuccessAt)).slice(0, 5) : "—"}`} · Detalhes
                  </Link>
                )}
              </div>
            </div>
            {c.accounts.length > 0 ? (
              <ul className="grid gap-2 border-t border-border pt-3">
                {c.accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{a.type === "CREDIT" ? `Cartão${a.card_last4 ? ` •• ${a.card_last4}` : ""}` : a.name}{!a.import_enabled ? " · não importado" : ""}</span>
                    {partner ? <VisibilityBadge kind={a.visibility} /> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {c.consentExpiresAt ? <p className="text-[13px] text-muted-foreground">Autorização válida até {dateFormat.format(new Date(c.consentExpiresAt))}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              {partner ? (
                <Link href="/privacy/visibility" className="inline-flex min-h-11 items-center justify-center rounded-full border border-border text-sm font-medium text-foreground hover:text-foreground">Alterar visibilidade</Link>
              ) : (
                <Link href={`/settings/connections/${c.pluggyItemId}`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border text-sm font-medium text-foreground hover:text-foreground">Detalhes</Link>
              )}
              <Link href={`/settings/connections/${c.pluggyItemId}/disconnect`} className="inline-flex min-h-11 items-center justify-center rounded-full text-sm font-medium text-danger hover:bg-danger-bg hover:text-danger">Desconectar</Link>
            </div>
          </Card>
        ))
      )}

      {pluggyReady ? (
        <Link href="/connect" className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">
          {connections.length ? "Conectar outro banco" : "Conectar bancos"}
        </Link>
      ) : (
        <p className="rounded-[10px] bg-muted p-3 text-sm text-muted-foreground">Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no servidor para habilitar.</p>
      )}
      {connections.length ? <p className="text-center text-[13px] text-muted-foreground">No MeuPluggy, todos os seus bancos ficam numa conexão só: adicione novos em meu.pluggy.ai e eles chegam na próxima atualização diária.</p> : null}

      {partner && partnerShared.length > 0 ? (
        <section className="grid gap-2">
          <SectionHeader title={`Compartilhado por ${partner.name}`} />
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {partnerShared.map((a) => (
              <li key={a.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
                <Avatar person={partner} size={28} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{a.institution ?? a.name} · {a.type === "CREDIT" ? `Cartão${a.card_last4 ? ` •• ${a.card_last4}` : ""}` : "Conta"}</span>
                <VisibilityBadge kind={a.visibility} />
              </li>
            ))}
          </ul>
          <p className="px-1 text-[13px] text-muted-foreground">{partner.name} conecta e gerencia os bancos dele. Você não pode alterar estas conexões.</p>
        </section>
      ) : null}
    </div>
  );
}
