import Link from "next/link";

import { PageHeader } from "@/components/app/bits";
import { ManualInvestmentForm } from "@/components/app/manual-investment-form";
import { goalsOverview } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
import { ratesSnapshot } from "@/lib/application/market-rates";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";

export const metadata = { title: "Novo investimento · Prumo" };

/** InvNovo: import from the bank (Open Finance) or type it by hand. */
export default async function NewInvestmentPage() {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const today = todayIn();
  const [ours, mine, rates] = await Promise.all([
    household ? goalsOverview(household.id, today) : Promise.resolve([]),
    household ? goalsOverview(household.id, today, { ownerId: user.id }) : Promise.resolve([]),
    ratesSnapshot().catch(() => ({ cdiDaily: null, selicDaily: null, ipca12: null, cdiAnnual: null })),
  ]);
  const open = (g: { status: string }) => g.status === "active" || g.status === "pending";

  return (
    <div className="grid gap-4">
      <PageHeader title="Novo investimento" back="/investments" />
      <Link href="/connect" className="flex items-center gap-3 rounded-2xl bg-[#E3EDE8] px-4 py-3.5 text-[#123329] no-underline hover:text-[#123329]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-[13px] font-medium">Importar do banco ou da corretora</span>
          <span className="text-xs">Conecte pelo Open Finance e os valores se atualizam sozinhos</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </Link>
      <p className="label-mono text-center">ou cadastre à mão</p>
      <ManualInvestmentForm
        partnerName={household?.partner?.name ?? null}
        goals={{ mine: mine.filter(open).map((g) => ({ id: g.id, label: g.name })), ours: ours.filter(open).map((g) => ({ id: g.id, label: g.name })) }}
        rates={rates}
        today={today}
      />
    </div>
  );
}
