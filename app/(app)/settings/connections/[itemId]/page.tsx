import Link from "next/link";
import { notFound } from "next/navigation";

import { Amount, PageHeader } from "@/components/app/bits";
import { InstitutionMark, UpdatedAt, VisibilityBadge } from "@/components/app/couple";
import { SyncButton } from "@/components/app/forms";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/application/connections";
import { loadCategoryNames, loadFacts } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
import { addDays, formatDayShort, todayIn } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { transactionLabel } from "@/lib/types";

export const metadata = { title: "Conexão · Prumo" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function ConnectionPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const { user } = await requireUser();
  const [connections, household] = await Promise.all([listConnections(user.id), getHousehold(user.id)]);
  const group = connections.filter((c) => c.pluggyItemId === itemId);
  if (group.length === 0) notFound();
  const c = group[0];
  const accounts = group.flatMap((g) => g.accounts);
  const institution = group.map((g) => g.institution).join(", ");
  const partnerName = household?.partner?.name;
  const dataUntil = c.lastSuccessAt ? day.format(new Date(c.lastSuccessAt)) : "—";

  if (c.state === "expired") {
    const main = accounts.find((a) => a.type !== "CREDIT") ?? accounts[0];
    const recent = main ? (await loadFacts([user.id], addDays(todayIn(), -60), todayIn())).filter((f) => f.account_id === main.id).slice(0, 3) : [];
    const categories = await loadCategoryNames([user.id]);
    return (
      <div className="grid gap-4">
        <PageHeader title={institution} back="/settings/connections" />
        <Card className="grid gap-2 border-danger/30">
          <p className="text-[15px] font-medium">A autorização com {institution} venceu{c.consentExpiresAt ? ` em ${day.format(new Date(c.consentExpiresAt))}` : ""}</p>
          <p className="text-sm text-muted-foreground">Os dados desta conexão estão parados em {dataUntil}. Reconectar leva uns 2 minutos e não apaga nada.</p>
          <Link href="/connect?step=5" className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">Reconectar</Link>
        </Card>
        {main ? (
          <Card className="grid gap-2">
            <p className="label-mono">Saldo em {dataUntil}</p>
            <p className="tabular text-2xl font-medium">{main.balance_cents !== null ? formatBRL(Math.abs(main.balance_cents)) : "—"}</p>
            {partnerName ? <VisibilityBadge kind={main.visibility} /> : null}
            <UpdatedAt at={c.lastSuccessAt} state="expired" />
          </Card>
        ) : null}
        {recent.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {recent.map((f) => (
              <li key={f.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{transactionLabel(f)}</span>
                  <span className="block text-[13px] text-muted-foreground">{formatDayShort(f.transaction_date)} · {(f.tag_id ? categories.get(f.tag_id)?.name : null) ?? "Outros"}{f.scope === "ours" ? " · Nosso" : ""}</span>
                </span>
                <Amount cents={f.amount_cents} type={f.type} className="text-[15px]" />
              </li>
            ))}
          </ul>
        ) : null}
        {partnerName ? <p className="text-[13px] text-muted-foreground">{partnerName} continua vendo os dados até {dataUntil}, com a mesma data de atualização. Ele não recebe aviso sobre a autorização.</p> : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={institution} back="/settings/connections" />
      <Card className="flex items-center gap-3">
        <InstitutionMark name={group[0].institution} />
        <div className="min-w-0">
          {c.state === "failed" ? (
            <>
              <p className="text-[15px] font-medium">A atualização de hoje não funcionou</p>
              <p className="text-sm text-muted-foreground">O banco não respondeu ao MeuPluggy. Nova tentativa amanhã, por volta das 6h. Seus dados estão de {dataUntil}.</p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium">Tudo certo</p>
              <UpdatedAt at={c.lastSuccessAt} />
            </>
          )}
        </div>
      </Card>

      {c.history.length > 0 ? (
        <Card className="grid gap-2">
          <p className="label-mono">Últimas atualizações</p>
          <ul className="grid gap-2">
            {c.history.slice(0, 5).map((h) => (
              <li key={h.at} className="flex items-center justify-between text-sm">
                <span className="capitalize">{dateTime.format(new Date(h.at))}</span>
                <span className={h.ok ? "text-muted-foreground" : "font-medium text-danger"}>{h.ok ? "Atualizado" : "Falhou"}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="grid gap-2">
        <p className="text-[15px] font-medium">Por que não tem “atualizar agora”?</p>
        <p className="text-sm text-muted-foreground">O MeuPluggy busca os dados do banco uma vez por dia. Se uma falha se repetir por 3 dias, avisamos para você conferir a conexão no MeuPluggy. O botão abaixo só traz o que o MeuPluggy já tem.</p>
      </Card>
      <SyncButton itemId={itemId} />
      <a href="https://meu.pluggy.ai" target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-full border border-foreground px-6 text-[15px] font-medium text-foreground hover:text-foreground">
        Ver a conexão no MeuPluggy
      </a>
    </div>
  );
}
