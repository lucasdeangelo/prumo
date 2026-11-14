import Link from "next/link";
import { redirect } from "next/navigation";

import { decideProposalAction } from "@/app/(app)/couple-actions";
import { toggleBudgetAlertsAction } from "@/app/(app)/couple/plan-actions";
import { PageHeader } from "@/components/app/bits";
import { BudgetBar, SpaceChip, UpdatedAt } from "@/components/app/couple";
import { Card, EmptyState } from "@/components/ui/card";
import { Money } from "@/components/app/money";
import { requireUser } from "@/lib/auth/session";
import { budgetOverview, loadCoupleContext } from "@/lib/application/couple-data";
import { listProposals } from "@/lib/application/household";
import { daysLeftInMonth } from "@/lib/domain/couple";
import { formatMonthLong, todayIn } from "@/lib/domain/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata = { title: "Orçamento do lar · Prumo" };

const alertDay = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "America/Sao_Paulo" });

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ enviado?: string }> }) {
  const { enviado } = await searchParams;
  const { user } = await requireUser();
  const today = todayIn();
  const ctx = await loadCoupleContext(user.id);
  const household = ctx.household;
  if (!household?.partner) redirect("/couple");
  const [overview, proposals, { data: sent }] = await Promise.all([
    budgetOverview(household.id, ctx.facts, ctx.categories),
    listProposals(household.id),
    createAdminClient().from("budget_alerts_sent").select("category, threshold, sent_at").eq("household_id", household.id).eq("month", today.slice(0, 7)).order("sent_at", { ascending: false }),
  ]);
  const proposal = proposals.find((p) => p.kind === "budget");
  const days = daysLeftInMonth(today);
  const lastAlert = sent?.[0];
  const names = `${household.me.color === "blue" ? household.me.name : household.partner.name} e ${household.me.color === "blue" ? household.partner.name : household.me.name}`;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <PageHeader title="" back="/overview" />
        <SpaceChip space="nosso" caption={`Nosso · ${names} veem`} me={household.me.color} />
      </div>
      <header className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-medium tracking-[-0.02em]">Orçamento do lar</h1>
          <p className="text-sm text-muted-foreground">{formatMonthLong(today.slice(0, 7)).split(" ")[0]}</p>
          <UpdatedAt at={ctx.syncedAt} />
        </div>
        <Link href="/couple/budget/setup" className="flex min-h-11 items-center text-sm font-medium">Ajustar</Link>
      </header>

      {enviado ? <p role="status" className="rounded-[10px] bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">Enviado para {household.partner.name} revisar.</p> : null}

      {proposal ? (
        <Card className="grid gap-2">
          <p className="text-[15px] font-medium">{proposal.proposed_by === user.id ? `Aguardando ${household.partner.name} confirmar o novo orçamento` : `${household.partner.name} propôs um novo orçamento`}</p>
          <ul className="grid gap-1 text-sm text-muted-foreground">
            {((proposal.payload.lines as Array<{ category: string; amountCents: number }>) ?? []).map((l) => <li key={l.category} className="flex justify-between"><span>{l.category}</span><span className="tabular"><Money cents={l.amountCents} /></span></li>)}
          </ul>
          {proposal.proposed_by !== user.id ? (
            <form action={decideProposalAction} className="grid grid-cols-2 gap-2">
              <input type="hidden" name="id" value={proposal.id} />
              <input type="hidden" name="returnTo" value="/couple/budget" />
              <button type="submit" name="accept" value="0" className="min-h-12 rounded-full border border-foreground text-[15px] font-medium">Vamos conversar</button>
              <button type="submit" name="accept" value="1" className="min-h-12 rounded-full bg-primary text-[15px] font-medium text-primary-foreground hover:bg-primary-press">Confirmar</button>
            </form>
          ) : null}
        </Card>
      ) : null}

      {overview.lines.length === 0 ? (
        <EmptyState title="Ainda sem orçamento do lar">
          <Link href="/couple/budget/setup">Combinem quanto querem gastar juntos por mês</Link>, com sugestões pela média dos últimos meses.
        </EmptyState>
      ) : (
        <>
          <Card className="grid gap-1">
            <span className="label-mono">Ainda cabe no mês</span>
            <span className={cn("tabular text-[32px] font-medium tracking-[-0.03em]", overview.freeCents < 0 && "text-danger")}><Money cents={overview.freeCents} /></span>
            <span className="text-[13px] text-muted-foreground">
              <Money cents={overview.usedCents} /> de <Money cents={overview.limitCents} />
              {overview.freeCents > 0 ? <> · cerca de <Money cents={Math.floor(overview.freeCents / days / 100) * 100} /> por dia</> : ""}
            </span>
          </Card>

          {lastAlert ? (
            <div className="flex items-start gap-3 rounded-2xl bg-warning-bg px-4 py-3 text-warning-fg">
              <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" />
              <span className="text-sm">
                <span className="block font-medium">{lastAlert.category} {lastAlert.threshold === 100 ? "passou do combinado" : "chegou a 80%"}</span>
                Aviso enviado para {names} {alertDay.format(new Date(lastAlert.sent_at))}
              </span>
            </div>
          ) : null}

          <ul className="grid gap-3">
            {overview.lines.map((line) => (
              <li key={line.category} className="grid gap-2 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between text-[15px]">
                  <span className="font-medium">{line.category}</span>
                  <span className="tabular text-muted-foreground"><Money cents={line.spentCents} /> de <Money cents={line.limitCents} /></span>
                </div>
                <BudgetBar spentCents={line.spentCents} limitCents={line.limitCents} />
                <span className={cn("text-[13px]", line.state === "over" ? "font-medium text-danger" : "text-muted-foreground")}>
                  {line.state === "over" ? <>Passou <Money cents={-line.remainingCents} /> do combinado</> : line.state === "attention" ? <>{line.percent}% · restam <Money cents={line.remainingCents} /></> : <>Restam <Money cents={line.remainingCents} /></>}
                </span>
              </li>
            ))}
          </ul>

          <form action={toggleBudgetAlertsAction}>
            <button type="submit" name="enabled" value={household.budgetAlerts ? "0" : "1"} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left">
              <span>
                <span className="block text-[15px] font-medium">Avisar os dois em 80% e 100%</span>
                <span className="block text-[13px] text-muted-foreground">Uma notificação por categoria, sem repetir</span>
              </span>
              <span aria-hidden="true" className={cn("flex h-6 w-10 shrink-0 items-center rounded-full p-0.5", household.budgetAlerts ? "justify-end bg-primary" : "justify-start bg-[#cdd0ca]")}>
                <span className="size-5 rounded-full bg-white" />
              </span>
              <span className="sr-only">{household.budgetAlerts ? "Ligado" : "Desligado"}</span>
            </button>
          </form>
          <p className="text-center text-[13px] text-muted-foreground">Entra aqui só o que está marcado como Nosso. Gastos do espaço Meu não contam.</p>
        </>
      )}
    </div>
  );
}
