
import { subscriptionStatusAction } from "@/app/(app)/actions";
import { Amount, IconLink, PageHeader, StatTile, StateBadge } from "@/components/app/bits";
import { PlusIcon, SparkIcon } from "@/components/app/icons";
import { DetectButton } from "@/components/app/forms";
import { Card, EmptyState } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { formatDayShort } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { FREQUENCY_LABEL, monthlyEquivalentCents } from "@/lib/domain/recurrence";
import { listSubscriptions } from "@/lib/repositories/reads";
import type { Subscription } from "@/lib/types";

export const metadata = { title: "Assinaturas · Prumo" };

function StatusButton({ id, status, label, variant = "outline" }: { id: string; status: string; label: string; variant?: "default" | "outline" | "ghost" }) {
  return (
    <form action={subscriptionStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={variant} pendingText="…" className="w-full">{label}</SubmitButton>
    </form>
  );
}

function Row({ sub, children }: { sub: Subscription; children?: React.ReactNode }) {
  return (
    <li className="grid gap-3 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{sub.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {FREQUENCY_LABEL[sub.frequency]}
            {sub.next_charge_date && sub.status === "active" ? <span>· próxima {formatDayShort(sub.next_charge_date)}</span> : null}
            <StateBadge state={sub.status} />
          </p>
        </div>
        <Amount cents={sub.amount_cents} className="text-sm" />
      </div>
      {children}
    </li>
  );
}

export default async function SubscriptionsPage() {
  const { user, db } = await requireUser();
  const subs = await listSubscriptions(db, user.id);
  const active = subs.filter((s) => s.status === "active" || s.status === "paused");
  const candidates = subs.filter((s) => s.status === "candidate");
  const past = subs.filter((s) => s.status === "cancelled");
  const monthly = subs.filter((s) => s.status === "active").reduce((sum, s) => sum + monthlyEquivalentCents(s.amount_cents, s.frequency), 0);

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Assinaturas"
        action={<IconLink href="/subscriptions/new" label="Nova assinatura" tone="tint"><PlusIcon className="size-5" strokeWidth={1.8} /></IconLink>}
      />
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Por mês" cents={monthly} tone="out" />
        <StatTile label="Por ano" cents={monthly * 12} hint={`${subs.filter((s) => s.status === "active").length} ativa(s)`} />
      </div>

      {candidates.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="flex items-center gap-1.5 px-1 text-sm font-semibold"><SparkIcon className="size-4" /> Parecem assinaturas</h2>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {candidates.map((sub) => (
                <Row key={sub.id} sub={sub}>
                  <p className="text-xs text-muted-foreground">
                    Detectada pelas cobranças repetidas{sub.detection_confidence ? ` · confiança ${Math.round(sub.detection_confidence * 100)}%` : ""}.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <StatusButton id={sub.id} status="active" label="É assinatura" variant="default" />
                    <StatusButton id={sub.id} status="rejected" label="Não é" />
                  </div>
                </Row>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-2">
        <h2 className="px-1 text-sm font-semibold">Ativas</h2>
        {active.length > 0 ? (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {active.map((sub) => (
                <Row key={sub.id} sub={sub}>
                  <div className="grid grid-cols-2 gap-2">
                    {sub.status === "active" ? <StatusButton id={sub.id} status="paused" label="Pausar" variant="ghost" /> : <StatusButton id={sub.id} status="active" label="Reativar" variant="ghost" />}
                    <StatusButton id={sub.id} status="cancelled" label="Cancelei" variant="ghost" />
                  </div>
                </Row>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState title="Nenhuma assinatura ativa">Adicione com o + ou deixe o Prumo encontrar nas suas movimentações.</EmptyState>
        )}
      </section>

      <DetectButton />

      {past.length > 0 ? (
        <details className="rounded-2xl border border-border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">Canceladas ({past.length})</summary>
          <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
            {past.map((s) => <li key={s.id} className="flex justify-between"><span>{s.name}</span><span className="tabular">{formatBRL(s.amount_cents)}</span></li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
