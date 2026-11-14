import Link from "next/link";

import { PageHeader, SectionHeader } from "@/components/app/bits";
import { PERSON_BG, SegmentBar, SpaceChip } from "@/components/app/couple";
import { EmptyState } from "@/components/ui/card";
import { Money } from "@/components/app/money";
import { requireUser } from "@/lib/auth/session";
import { goalsOverview } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
import { todayIn } from "@/lib/domain/dates";

export const metadata = { title: "Metas · Prumo" };

const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const monthOnly = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

export default async function GoalsPage() {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const goals = household ? await goalsOverview(household.id, todayIn()) : [];
  const people = household?.partner ? (household.me.color === "blue" ? [household.me, household.partner] : [household.partner, household.me]) : household ? [household.me] : [];
  const open = goals.filter((g) => g.status === "active" || g.status === "pending");
  const done = goals.filter((g) => g.status === "done");
  const saved = goals.reduce((s, g) => s + g.savedCents, 0);

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <PageHeader title="" back="/overview" />
        {household?.partner ? <SpaceChip space="nosso" caption={`Nosso · ${people.map((p) => p.name).join(" e ")} veem`} me={household.me.color} /> : null}
      </div>
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-[-0.02em]">Metas</h1>
          <p className="text-sm text-muted-foreground"><Money cents={saved} /> guardados{household?.partner ? " juntos" : ""}</p>
        </div>
        <Link href="/couple/goals/new" className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">Nova meta</Link>
      </header>

      {open.length === 0 ? <EmptyState title="Nenhuma meta em andamento">Viagem, reserva de emergência, reforma: comecem por uma.</EmptyState> : null}

      <ul className="grid gap-3">
        {open.map((g) => (
          <li key={g.id}>
            <Link href={`/couple/goals/${g.id}`} className="grid gap-2 rounded-2xl border border-border bg-card p-4 text-foreground no-underline hover:text-foreground">
              <div className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-[15px] font-medium">{g.icon ? `${g.icon} ` : ""}{g.name}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {g.status === "pending" ? "Aguardando confirmação" : g.deadline ? `Prazo: ${monthYear.format(new Date(`${g.deadline}T00:00:00Z`))}` : "Sem prazo"}
                  </span>
                </span>
                {g.status === "active" && g.progress.monthsAhead !== null && g.progress.monthsAhead > 0 ? (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">{g.progress.monthsAhead === 1 ? "1 mês adiantada" : `${g.progress.monthsAhead} meses adiantada`}</span>
                ) : g.status === "active" && g.progress.extraMonthlyCents > 0 ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">+<Money cents={g.progress.extraMonthlyCents} />/mês</span>
                ) : null}
              </div>
              <div className="flex items-center justify-between text-sm"><span className="tabular"><Money cents={g.savedCents} /> de <Money cents={g.targetCents} /></span><span className="tabular font-medium">{g.progress.percent}%</span></div>
              <SegmentBar total={g.targetCents} label={`${g.progress.percent}% guardado`} segments={people.map((p) => ({ value: g.byUser[p.userId] ?? 0, color: PERSON_BG[p.color] }))} />
              {people.length > 1 ? <span className="text-[13px] text-muted-foreground">{people.map((p, i) => <span key={p.userId}>{i > 0 ? " · " : ""}{p.name} <Money cents={g.byUser[p.userId] ?? 0} /></span>)}</span> : null}
              {g.status === "active" && g.deadline && g.progress.extraMonthlyCents > 0 && g.progress.reachMonth ? (
                <span className="text-[13px] text-muted-foreground">No ritmo atual, chegam em {monthYear.format(new Date(`${g.progress.reachMonth}-01T00:00:00Z`))}. Com +<Money cents={g.progress.extraMonthlyCents} />/mês, no prazo.</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {done.length > 0 ? (
        <section className="grid gap-2">
          <SectionHeader title="Concluídas" />
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {done.map((g) => (
              <li key={g.id}>
                <Link href={`/couple/goals/${g.id}`} className="flex min-h-14 items-center justify-between px-4 py-3 text-foreground no-underline hover:text-foreground">
                  <span className="text-[15px] font-medium">{g.name}</span>
                  <span className="text-[13px] text-muted-foreground"><Money cents={g.targetCents} />{g.completedAt ? ` · concluída em ${monthOnly.format(new Date(g.completedAt))}` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
