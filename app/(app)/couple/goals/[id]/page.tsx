import { notFound } from "next/navigation";

import { confirmGoalAction } from "@/app/(app)/couple/plan-actions";
import { PageHeader, SectionHeader } from "@/components/app/bits";
import { Avatar, PERSON_BG, SegmentBar } from "@/components/app/couple";
import { ContributeForm } from "@/components/app/plan-forms";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { Money } from "@/components/app/money";
import { requireUser } from "@/lib/auth/session";
import { goalsOverview } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
import { todayIn } from "@/lib/domain/dates";
import { centsToInput } from "@/lib/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Meta · Prumo" };

const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household) notFound();
  const goal = (await goalsOverview(household.id, todayIn())).find((g) => g.id === id);
  if (!goal) notFound();
  const admin = createAdminClient();
  const [{ data: contributions }, { data: milestones }] = await Promise.all([
    admin.from("goal_contributions").select("id, user_id, amount_cents, contributed_on, automatic").eq("goal_id", id).order("contributed_on", { ascending: false }).limit(50),
    admin.from("goal_milestones").select("percent, reached_at").eq("goal_id", id),
  ]);
  const people = household.partner ? (household.me.color === "blue" ? [household.me, household.partner] : [household.partner, household.me]) : [household.me];
  const byId = new Map(people.map((p) => [p.userId, p]));
  const myMember = goal.members.find((m) => m.user_id === user.id);
  const waitingMe = goal.status === "pending" && myMember && !myMember.confirmed_at;
  const plan = (userId: string) => {
    const member = goal.members.find((m) => m.user_id === userId);
    if (!member) return "";
    if (member.monthly_cents) return <> · <Money cents={member.monthly_cents} />/mês</>;
    if (member.percent !== null && goal.progress.neededMonthlyCents) return <> · <Money cents={Math.round((goal.progress.neededMonthlyCents * Number(member.percent)) / 100)} />/mês</>;
    return "";
  };
  const timeline = [
    ...(contributions ?? []).map((c) => ({ kind: "deposit" as const, date: c.contributed_on as string, userId: c.user_id as string, cents: c.amount_cents as number, automatic: c.automatic as boolean, key: c.id as string })),
    ...(milestones ?? []).map((m) => ({ kind: "milestone" as const, date: (m.reached_at as string).slice(0, 10), percent: m.percent as number, key: `m${m.percent}` })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const suggestion = myMember?.monthly_cents ?? (goal.progress.neededMonthlyCents && myMember?.percent ? Math.round((goal.progress.neededMonthlyCents * Number(myMember.percent)) / 100) : 0);

  return (
    <div className="grid gap-4">
      <PageHeader title={`${goal.icon ? `${goal.icon} ` : ""}${goal.name}`} subtitle={goal.deadline ? `Prazo: ${monthYear.format(new Date(`${goal.deadline}T00:00:00Z`))}` : "Sem prazo"} back="/couple/goals" />

      {waitingMe ? (
        <Card className="grid gap-2">
          <p className="text-[15px] font-medium">Confirme sua parte</p>
          <p className="text-sm text-muted-foreground">
            {myMember?.percent !== null && myMember?.percent !== undefined ? `${Number(myMember.percent)}% do que for guardado` : <><Money cents={myMember?.monthly_cents ?? 0} /> por mês</>}. A meta começa quando os dois confirmarem.
          </p>
          <form action={confirmGoalAction}>
            <input type="hidden" name="id" value={goal.id} />
            <SubmitButton className="w-full">Confirmar minha parte</SubmitButton>
          </form>
        </Card>
      ) : goal.status === "pending" ? (
        <p className="rounded-[10px] bg-muted px-3 py-2.5 text-sm text-muted-foreground">Aguardando {household.partner?.name ?? "seu par"} confirmar a parte dele.</p>
      ) : null}

      <Card className="grid gap-3">
        <div className="flex items-end justify-between">
          <span className="tabular text-[32px] font-medium tracking-[-0.03em]"><Money cents={goal.savedCents} /></span>
          <span className="text-sm text-muted-foreground">de <Money cents={goal.targetCents} /></span>
        </div>
        <SegmentBar total={goal.targetCents} label={`${goal.progress.percent}% guardado`} segments={people.map((p) => ({ value: goal.byUser[p.userId] ?? 0, color: PERSON_BG[p.color] }))} />
        <div className="flex justify-between text-[12px] text-muted-foreground">{[25, 50, 75, 100].map((p) => <span key={p} className={goal.progress.percent >= p ? "font-medium text-foreground" : ""}>{p}%</span>)}</div>
        {people.length > 1 ? (
          <div className="grid grid-cols-2 gap-2">
            {people.map((p) => (
              <div key={p.userId} className="flex items-center gap-2 rounded-[10px] bg-muted px-3 py-2">
                <Avatar person={p} size={28} />
                <span className="min-w-0">
                  <span className="block text-[13px] text-muted-foreground">{p.name}{plan(p.userId)}</span>
                  <span className="tabular block text-[15px] font-medium"><Money cents={goal.byUser[p.userId] ?? 0} /></span>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      {goal.status === "active" && goal.progress.reachMonth ? (
        <Card className="grid gap-1 bg-secondary text-secondary-foreground">
          <p className="text-[15px] font-medium">No ritmo atual, {people.length > 1 ? "vocês chegam" : "você chega"} lá em {monthYear.format(new Date(`${goal.progress.reachMonth}-01T00:00:00Z`))}</p>
          <p className="text-sm">
            {goal.progress.monthsAhead !== null && goal.progress.monthsAhead > 0
              ? <>{goal.progress.monthsAhead === 1 ? "Um mês" : `${goal.progress.monthsAhead} meses`} antes do prazo, guardando <Money cents={goal.monthlyPaceCents} /> por mês{people.length > 1 ? " juntos" : ""}.</>
              : goal.progress.extraMonthlyCents > 0
                ? <>Para chegar no prazo, faltam <Money cents={goal.progress.extraMonthlyCents} /> por mês a mais.</>
                : <>Guardando <Money cents={goal.monthlyPaceCents} /> por mês.</>}
          </p>
        </Card>
      ) : null}

      {goal.status === "active" ? (
        <Card><ContributeForm goalId={goal.id} suggestion={suggestion ? centsToInput(suggestion) : ""} /></Card>
      ) : null}

      <section className="grid gap-2">
        <SectionHeader title="Aportes" action={<span className="text-[13px] text-muted-foreground">{(contributions ?? []).length} no total</span>} />
        {timeline.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {timeline.map((item) =>
              item.kind === "milestone" ? (
                <li key={item.key} className="flex min-h-14 items-center gap-3 bg-secondary/50 px-4 py-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{item.percent}%</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{item.percent === 50 ? "Metade do caminho" : item.percent === 100 ? "Meta concluída" : `${item.percent}% do caminho`}</span>
                    <span className="block text-[13px] capitalize text-muted-foreground">{dayLong.format(new Date(`${item.date}T00:00:00Z`))}</span>
                  </span>
                </li>
              ) : (
                <li key={item.key} className="flex min-h-14 items-center gap-3 px-4 py-3">
                  {byId.get(item.userId) ? <Avatar person={byId.get(item.userId)!} size={32} /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{byId.get(item.userId)?.name ?? "Alguém"} guardou</span>
                    <span className="block text-[13px] capitalize text-muted-foreground">{dayLong.format(new Date(`${item.date}T00:00:00Z`))}{item.automatic ? " · automático" : ""}</span>
                  </span>
                  <span className="tabular text-[15px] font-medium text-success">+ <Money cents={item.cents} /></span>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="px-1 text-sm text-muted-foreground">Nenhum aporte ainda.</p>
        )}
      </section>
    </div>
  );
}
