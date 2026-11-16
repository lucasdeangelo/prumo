import Link from "next/link";
import { notFound } from "next/navigation";

import { unlinkInvestmentAction } from "@/app/(app)/investments/actions";
import { PageHeader } from "@/components/app/bits";
import { AssetTile } from "@/components/app/investments";
import { LinkGoalForm, type GoalChoice } from "@/components/app/link-goal-form";
import { Money } from "@/components/app/money";
import { goalsOverview, type GoalOverview } from "@/lib/application/couple-data";
import { loadAssetGoals } from "@/lib/application/goal-links";
import { getHousehold } from "@/lib/application/household";
import { investmentForViewer } from "@/lib/application/investments";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";

export const metadata = { title: "Vincular a uma meta · Prumo" };

const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });

function caption(g: GoalOverview): string {
  const when = g.deadline ? monthShort.format(new Date(`${g.deadline}T00:00:00Z`)).replace(". de ", "/").replace(" de ", "/") : "sem prazo";
  return `${formatBRL(g.savedCents)} de ${formatBRL(g.targetCents)} · ${when}`;
}

/** InvVincular: which goal this asset counts for, and how much of it. Only its owner links it. */
export default async function LinkInvestmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ meta?: string; voltar?: string }> }) {
  const [{ id }, { meta, voltar }] = await Promise.all([params, searchParams]);
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const found = /^[0-9a-f-]{36}$/i.test(id) ? await investmentForViewer(user.id, household, id) : null;
  if (!found || !found.owner || found.row.status === "withdrawn") notFound();
  const { row } = found;
  const today = todayIn();
  const [ours, mine, current] = await Promise.all([
    household ? goalsOverview(household.id, today) : Promise.resolve([]),
    household ? goalsOverview(household.id, today, { ownerId: user.id }) : Promise.resolve([]),
    loadAssetGoals([row.id]).then((m) => m.get(row.id) ?? []),
  ]);
  const open = (g: GoalOverview) => g.status === "active" || g.status === "pending";
  const toChoice = (g: GoalOverview): GoalChoice => ({ id: g.id, name: g.name, caption: caption(g), scope: g.scope });
  const partner = household?.partner ?? null;
  const sharesAlready = row.scope === "ours" || row.visibility === "details" || current.some((g) => g.scope === "ours");
  const shareNote =
    partner && !sharesAlready
      ? `Numa meta do casal, ${partner.name} passa a ver este investimento e o valor dele. Hoje ${row.visibility === "totals" ? "vê só o seu total" : "não vê seus investimentos"}.`
      : null;
  const back = voltar === "meta" && meta ? `/couple/goals/${meta}` : `/investments/${row.id}`;

  return (
    <div className="grid gap-4">
      <PageHeader title="Vincular a uma meta" back={back} />
      <div className="flex items-center gap-3">
        <AssetTile type={row.type} subtype={row.subtype} />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-[15px] font-medium">{row.name}</span>
          <span className="tabular text-[13px] text-muted-foreground"><Money cents={row.amount_cents} /></span>
        </span>
      </div>
      <p className="text-sm text-muted-foreground">O valor do investimento passa a contar no progresso da meta, com o que ele render.</p>

      {current.length > 0 ? (
        <section className="grid gap-2">
          <p className="label-mono">Já conta para</p>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {current.map((g) => (
              <li key={g.goalId} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/couple/goals/${g.goalId}`} className="grid min-w-0 flex-1 gap-0.5 text-foreground no-underline hover:text-foreground">
                  <span className="truncate text-sm font-medium">{g.name}</span>
                  <span className="text-xs text-muted-foreground">{g.scope === "ours" ? "Meta do casal" : "Minha meta"} · {g.mode === "all" ? "o valor todo" : <>uma parte: <Money cents={g.partCents ?? 0} /></>}</span>
                </Link>
                <form action={unlinkInvestmentAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="goalId" value={g.goalId} />
                  <input type="hidden" name="returnTo" value={`/investments/${row.id}/link`} />
                  <button type="submit" className="min-h-10 rounded-full px-3 text-[13px] font-medium text-primary hover:bg-muted">Tirar da meta</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mine.filter(open).length + ours.filter(open).length > 0 ? (
        <LinkGoalForm
          investmentId={row.id}
          amountCents={row.amount_cents}
          mine={mine.filter(open).map(toChoice)}
          ours={ours.filter(open).map(toChoice)}
          preselected={meta ?? null}
          shareNote={shareNote}
          returnTo={voltar === "meta" && meta ? `/couple/goals/${meta}` : `/investments/${row.id}`}
        />
      ) : (
        <div className="grid gap-3 rounded-2xl border border-dashed border-[#cdd0ca] bg-card/60 px-4 py-6 text-center">
          <p className="font-medium">Nenhuma meta ainda</p>
          <p className="text-sm text-muted-foreground">Crie uma meta e volte aqui para fazer este investimento contar para ela.</p>
          <Link href="/couple/goals/new?de=meu" className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-[15px] font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">Criar meta</Link>
        </div>
      )}
    </div>
  );
}
