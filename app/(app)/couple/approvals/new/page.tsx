import { redirect } from "next/navigation";

import { PageHeader } from "@/components/app/bits";
import { ApprovalRequestForm } from "@/components/app/plan-forms";
import { requireUser } from "@/lib/auth/session";
import { loadBudgets, loadCategoryNames } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";

export const metadata = { title: "Combinar compra · Prumo" };

export default async function NewApprovalPage() {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household?.partner) redirect("/couple");
  const [budgets, names] = await Promise.all([loadBudgets(household.id), loadCategoryNames([user.id])]);
  const categories = [...new Set([...budgets.map((b) => b.category), ...[...names.values()].filter((t) => !t.excluded).map((t) => t.name)])].sort();
  return (
    <div className="grid gap-4">
      <PageHeader title="Combinar uma compra" subtitle={`${household.partner.name} recebe pelo app e pelo WhatsApp`} back="/couple/approvals" />
      <ApprovalRequestForm categories={categories} />
    </div>
  );
}
