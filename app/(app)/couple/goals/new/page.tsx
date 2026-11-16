import { PageHeader } from "@/components/app/bits";
import { GoalForm } from "@/components/app/plan-forms";
import { requireUser } from "@/lib/auth/session";
import { ensureHousehold, getHousehold } from "@/lib/application/household";
import { firstShare } from "@/lib/domain/couple";

export const metadata = { title: "Nova meta · Prumo" };

/** `?de=meu` opens it as a personal goal (from "Minhas metas" on Investimentos). */
export default async function NewGoalPage({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  const { de } = await searchParams;
  const { user } = await requireUser();
  await ensureHousehold(user.id);
  const household = await getHousehold(user.id);
  const partner = household?.partner ?? null;
  const personal = de === "meu";
  const incomeShare = partner && household?.me.incomeCents && partner.incomeCents ? firstShare("income", [household.me.incomeCents, partner.incomeCents]) : null;
  return (
    <div className="grid gap-4">
      <PageHeader title={personal ? "Nova meta" : partner ? "Nova meta do casal" : "Nova meta"} back={personal ? "/investments" : "/couple/goals"} />
      <GoalForm meName={household?.me.name ?? "Você"} partnerName={partner?.name ?? null} incomeShare={incomeShare} defaultScope={personal ? "mine" : "ours"} />
    </div>
  );
}
