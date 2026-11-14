import { redirect } from "next/navigation";

import { decideProposalAction } from "@/app/(app)/couple-actions";
import { PageHeader } from "@/components/app/bits";
import { Avatar, SpaceChip } from "@/components/app/couple";
import { FreeMoneyForm } from "@/components/app/plan-forms";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/app/money";
import { requireUser } from "@/lib/auth/session";
import { freeMoneyAllowance, getHousehold, listProposals } from "@/lib/application/household";
import { loadFacts } from "@/lib/application/couple-data";
import { addMonths, monthBounds, todayIn } from "@/lib/domain/dates";
import { centsToInput } from "@/lib/domain/money";

export const metadata = { title: "Dinheiro livre · Prumo" };

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

export default async function FreeMoneyPage() {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household?.partner) redirect("/couple");
  const partner = household.partner;
  const today = todayIn();
  const [mine, theirs, proposals] = await Promise.all([
    freeMoneyAllowance(household.id, household.me.userId, today),
    freeMoneyAllowance(household.id, partner.userId, today),
    listProposals(household.id),
  ]);
  const proposal = proposals.find((p) => p.kind === "free_money");
  const proposed = (proposal?.payload.amounts as Record<string, number> | undefined) ?? {};
  const from = monthBounds(addMonths(`${today.slice(0, 7)}-01`, -3).slice(0, 7)).start;
  const facts = await loadFacts([household.me.userId], from, monthBounds(addMonths(`${today.slice(0, 7)}-01`, -1).slice(0, 7)).end);
  const avgMine = Math.round(facts.filter((f) => f.free_money && f.type === "debit").reduce((s, f) => s + f.amount_cents, 0) / 3);
  const nextMonth = monthName.format(new Date(`${addMonths(`${today.slice(0, 7)}-01`, 1)}T00:00:00Z`));

  const person = (who: typeof household.me, current: number | null, isMe: boolean) => {
    const proposedValue = proposed[who.userId];
    const status = proposal ? (proposal.proposed_by === who.userId ? (isMe ? "Você propôs" : `${who.name} propôs`) : `Aguardando ${who.name}`) : null;
    return (
      <Card key={who.userId} className="grid gap-2">
        <div className="flex items-center gap-3">
          <Avatar person={who} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">{who.name}</span>
            <span className="block text-[13px] text-muted-foreground">{isMe ? "Você" : "Seu par"}</span>
          </span>
          {status ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{status}</span> : null}
        </div>
        {proposedValue !== undefined ? <p className="tabular text-2xl font-medium"><Money cents={proposedValue} /> <span className="text-sm text-muted-foreground">por mês</span></p> : null}
        <p className="text-[13px] text-muted-foreground">
          Hoje: {current !== null ? <Money cents={current} /> : "sem valor combinado"}
          {isMe && avgMine > 0 ? <> · média usada nos últimos 3 meses: <Money cents={avgMine} /></> : ""}
        </p>
      </Card>
    );
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <PageHeader title="" back="/overview" />
        <SpaceChip space="nosso" caption="Nosso · combinado dos dois" me={household.me.color} />
      </div>
      <h1 className="text-2xl font-medium tracking-[-0.02em]">Dinheiro livre</h1>
      <p className="text-sm text-muted-foreground">Um valor por mês para cada um gastar sem precisar explicar. O outro vê só quanto foi usado, nunca onde.</p>

      {person(household.me, mine, true)}
      {person(partner, theirs, false)}

      {proposal && proposal.proposed_by !== user.id ? (
        <form action={decideProposalAction} className="grid grid-cols-2 gap-2">
          <input type="hidden" name="id" value={proposal.id} />
          <input type="hidden" name="returnTo" value="/couple/free-money" />
          <button type="submit" name="accept" value="0" className="min-h-12 rounded-full border border-foreground text-[15px] font-medium">Vamos conversar</button>
          <button type="submit" name="accept" value="1" className="min-h-12 rounded-full bg-primary text-[15px] font-medium text-primary-foreground hover:bg-primary-press">Aceitar</button>
        </form>
      ) : (
        <Card>
          <FreeMoneyForm
            meName={household.me.name}
            partnerName={partner.name}
            mineText={centsToInput(proposed[household.me.userId] ?? mine ?? 60000)}
            theirsText={centsToInput(proposed[partner.userId] ?? theirs ?? 60000)}
            waiting={Boolean(proposal)}
          />
        </Card>
      )}
      <p className="text-center text-[13px] text-muted-foreground">
        O novo valor vale a partir de {nextMonth}, quando os dois confirmarem.{mine !== null ? <> Até lá, segue <Money cents={mine} />.</> : ""} Para usar, marque o gasto como “Dinheiro livre” na movimentação.
      </p>
    </div>
  );
}
