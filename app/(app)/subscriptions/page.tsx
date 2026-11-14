import Link from "next/link";

import { subscriptionStatusAction } from "@/app/(app)/actions";
import { Amount, IconLink, PageHeader, StatTile, StateBadge } from "@/components/app/bits";
import { HideValuesToggle } from "@/components/app/hide-values";
import { PlusIcon, SparkIcon } from "@/components/app/icons";
import { DetectButton } from "@/components/app/forms";
import { Card, EmptyState } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { formatDayShort } from "@/lib/domain/dates";
import { FREQUENCY_LABEL, monthlyEquivalentCents } from "@/lib/domain/recurrence";
import { listSubscriptions } from "@/lib/repositories/reads";
import { UpdatedAt } from "@/components/app/couple";
import { Money } from "@/components/app/money";
import { lastSyncAt, loadSharedPlans } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
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

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  const { user, db } = await requireUser();
  const household = await getHousehold(user.id);
  const partner = household?.partner ?? null;
  const ours = Boolean(partner) && aba === "nossas";
  const memberIds = [user.id, partner?.userId].filter(Boolean) as string[];
  // Minhas: mine only. Nossas: what either of us marked as the couple's.
  const [subs, syncedAt] = await Promise.all([
    ours
      ? loadSharedPlans(memberIds).then((p) => p.subscriptions)
      : listSubscriptions(db, user.id).then((list) => list.filter((s) => !partner || s.scope !== "ours")),
    lastSyncAt(memberIds),
  ]);
  const active = subs.filter((s) => s.status === "active" || s.status === "paused");
  const candidates = subs.filter((s) => s.status === "candidate");
  const past = subs.filter((s) => s.status === "cancelled");
  const monthly = subs.filter((s) => s.status === "active").reduce((sum, s) => sum + monthlyEquivalentCents(s.amount_cents, s.frequency), 0);

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Assinaturas"
        action={<div className="flex items-center gap-1"><HideValuesToggle /><IconLink href="/subscriptions/new" label="Nova assinatura" tone="tint"><PlusIcon className="size-5" strokeWidth={1.8} /></IconLink></div>}
      />
      {partner ? (
        <div className="grid gap-2">
          <nav className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1" aria-label="De quem">
            {([["minhas", "Minhas"], ["nossas", "Nossas"]] as const).map(([value, label]) => {
              const active = (ours ? "nossas" : "minhas") === value;
              return (
                <Link key={value} href={`/subscriptions?aba=${value}`} aria-current={active ? "page" : undefined} className={active ? "flex min-h-10 items-center justify-center rounded-full bg-card text-sm font-semibold text-primary no-underline shadow-[0_1px_3px_rgba(18,21,18,0.1)]" : "flex min-h-10 items-center justify-center rounded-full text-sm font-medium text-muted-foreground no-underline hover:text-foreground"}>
                  {label}
                </Link>
              );
            })}
          </nav>
          {ours ? <p className="px-1 text-[13px] text-muted-foreground">{household!.me.name} e {partner.name} veem</p> : null}
        </div>
      ) : null}
      <UpdatedAt at={syncedAt} />
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
                  <div className={sub.user_id && sub.user_id !== user.id ? "hidden" : "grid grid-cols-2 gap-2"}>
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
                  <div className={sub.user_id && sub.user_id !== user.id ? "hidden" : "grid grid-cols-2 gap-2"}>
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
            {past.map((s) => <li key={s.id} className="flex justify-between"><span>{s.name}</span><span className="tabular"><Money cents={s.amount_cents} /></span></li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
