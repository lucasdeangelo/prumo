import { redirect } from "next/navigation";

import { PageHeader } from "@/components/app/bits";
import { BudgetSetupForm } from "@/components/app/plan-forms";
import { requireUser } from "@/lib/auth/session";
import { loadBudgets } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
import { budgetSuggestion } from "@/lib/application/plans";
import { formatBRL } from "@/lib/domain/money";

export const metadata = { title: "Configurar orçamento · Prumo" };

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

export default async function BudgetSetupPage() {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household?.partner) redirect("/couple");
  const [current, { suggestion, averages, months }] = await Promise.all([loadBudgets(household.id), budgetSuggestion(household)]);
  const average = (category: string) => Math.round(averages.reduce((s, m) => s + (m[category] ?? 0), 0) / averages.length);
  const base = current.length ? current.map((c) => ({ category: c.category, amountCents: c.limitCents })) : suggestion;
  const rows = base.map((r) => ({ ...r, hint: average(r.category) ? `Média: ${formatBRL(average(r.category))}` : "" }));
  const range = `${monthName.format(new Date(`${months[0]}-01T00:00:00Z`))} a ${monthName.format(new Date(`${months[2]}-01T00:00:00Z`))}`;
  const total = suggestion.reduce((s, r) => s + r.amountCents, 0);

  return (
    <div className="grid gap-4">
      <PageHeader title="" back="/couple/budget" />
      <h1 className="text-2xl font-medium tracking-[-0.02em]">Quanto vocês querem gastar juntos por mês?</h1>
      <p className="text-sm text-muted-foreground">
        {suggestion.length ? `Sugerimos valores pela média do que foi marcado como Nosso de ${range}. Ajustem à vontade.` : "Ainda não há gastos marcados como Nosso para sugerir valores. Comecem pelas categorias principais."}
      </p>
      <BudgetSetupForm initial={rows} partnerName={household.partner.name} />
      {total ? <p className="text-center text-[13px] text-muted-foreground">Média dos últimos 3 meses: {formatBRL(total)}</p> : null}
    </div>
  );
}
