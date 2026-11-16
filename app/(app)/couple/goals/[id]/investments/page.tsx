import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/bits";
import { AssetTile, describeAsset } from "@/components/app/investments";
import { Money } from "@/components/app/money";
import { EmptyState } from "@/components/ui/card";
import { findGoal } from "@/lib/application/couple-data";
import { loadAssetGoals } from "@/lib/application/goal-links";
import { getHousehold } from "@/lib/application/household";
import { loadInvestments } from "@/lib/application/investments";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";
import { isOpen } from "@/lib/domain/investments";
import Link from "next/link";

export const metadata = { title: "Vincular investimento · Prumo" };

/** From a goal: pick one of your open investments, then choose how much of it counts. */
export default async function GoalInvestmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household) notFound();
  const goal = await findGoal(household.id, user.id, id, todayIn());
  if (!goal) notFound();
  const mine = (await loadInvestments([user.id])).filter(isOpen);
  const goalsByAsset = await loadAssetGoals(mine.map((r) => r.id));

  return (
    <div className="grid gap-4">
      <PageHeader title="Vincular investimento" subtitle={goal.name} back={`/couple/goals/${goal.id}`} />
      {mine.length === 0 ? (
        <EmptyState title="Nenhum investimento seu">
          Os investimentos chegam pelo Open Finance, junto com suas contas. Quando aparecerem em Investimentos, você pode vincular aqui.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {mine.map((row) => {
            const goals = goalsByAsset.get(row.id) ?? [];
            const here = goals.some((g) => g.goalId === goal.id);
            const elsewhere = goals.filter((g) => g.goalId !== goal.id).map((g) => g.name);
            return (
              <li key={row.id}>
                <Link href={`/investments/${row.id}/link?meta=${goal.id}&voltar=meta`} className="flex items-start gap-3 px-4 py-3.5 text-foreground no-underline hover:bg-[#F8F9F6] hover:text-foreground">
                  <AssetTile type={row.type} subtype={row.subtype} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[13px] font-medium">{row.name}</span>
                    <span className="text-xs text-muted-foreground">{describeAsset(row)}</span>
                    <span className="text-xs text-muted-foreground">{here ? "Já conta para esta meta" : elsewhere.length ? `Conta para ${elsewhere.join(", ")}` : "Sem meta"}</span>
                  </span>
                  <span className="tabular shrink-0 text-[13px] font-medium"><Money cents={row.amount_cents} /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
