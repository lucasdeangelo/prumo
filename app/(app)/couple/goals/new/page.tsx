import { PageHeader } from "@/components/app/bits";
import { GoalForm } from "@/components/app/plan-forms";
import { requireUser } from "@/lib/auth/session";
import { ensureHousehold, getHousehold } from "@/lib/application/household";
import { firstShare } from "@/lib/domain/couple";

export const metadata = { title: "Nova meta · Prumo" };

export default async function NewGoalPage() {
  const { user } = await requireUser();
  await ensureHousehold(user.id);
  const household = await getHousehold(user.id);
  const partner = household?.partner ?? null;
  const incomeShare = partner && household?.me.incomeCents && partner.incomeCents ? firstShare("income", [household.me.incomeCents, partner.incomeCents]) : null;
  return (
    <div className="grid gap-4">
      <PageHeader title={partner ? "Nova meta do casal" : "Nova meta"} back="/couple/goals" />
      <GoalForm meName={household?.me.name ?? "Você"} partnerName={partner?.name ?? null} incomeShare={incomeShare} />
    </div>
  );
}
