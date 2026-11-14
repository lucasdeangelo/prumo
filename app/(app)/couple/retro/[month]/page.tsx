import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { settleMonthAction } from "@/app/(app)/couple/plan-actions";
import { PageHeader } from "@/components/app/bits";
import { Avatar, PERSON_BG, SegmentBar } from "@/components/app/couple";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { Money } from "@/components/app/money";
import { requireUser } from "@/lib/auth/session";
import { getHousehold } from "@/lib/application/household";
import { loadRetro } from "@/lib/application/retro";
import { addMonths, isMonthKey, todayIn } from "@/lib/domain/dates";

export const metadata = { title: "Retrospectiva · Prumo" };

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });

export default async function RetroPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!isMonthKey(month)) notFound();
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household?.partner) redirect("/couple");
  const retro = await loadRetro(household, month);
  const people = household.me.color === "blue" ? [household.me, household.partner] : [household.partner, household.me];
  const name = monthName.format(new Date(`${month}-01T00:00:00Z`));
  const prevName = monthName.format(new Date(`${retro.previous}-01T00:00:00Z`));
  const over = retro.budgetLines.filter((l) => l.state === "over");
  const attention = retro.budgetLines.filter((l) => l.state === "attention");
  const okCount = retro.budgetLines.length - over.length - attention.length;
  const paid = retro.settlement.paidCents;
  const total = retro.settlement.totalCents;
  const paidShare = total > 0 ? paid[0] / total : 0;
  const meFirst = people[0] === household.me;
  const share = (i: 0 | 1) => (meFirst ? (i === 0 ? paidShare : 1 - paidShare) : i === 0 ? 1 - paidShare : paidShare);
  const paidBy = (i: 0 | 1) => (meFirst ? paid[i] : paid[1 - i]);
  const incomeFirst = meFirst ? retro.incomeShare : 1 - retro.incomeShare;
  const owed = retro.settlement.secondOwesFirstCents;
  const [debtor, creditor] = owed > 0 ? [household.partner, household.me] : [household.me, household.partner];
  const nextMonth = addMonths(`${month}-01`, 1).slice(0, 7);
  const canGoNext = nextMonth < todayIn().slice(0, 7);
  const maxBar = Math.max(retro.totalCents, retro.prevTotalCents, 1);

  return (
    <div className="grid gap-4">
      <PageHeader title="" back="/overview" />
      <p className="label-mono">Retrospectiva · {name}</p>

      <Card className="grid gap-2">
        <p className="text-sm text-muted-foreground">Em {name}, vocês gastaram juntos</p>
        <p className="tabular text-[36px] font-medium tracking-[-0.03em]"><Money cents={retro.totalCents} /></p>
        <p className="text-sm text-muted-foreground">Isso é tudo o que estava marcado como Nosso.</p>
        {retro.changePercent !== null ? (
          <>
            <p className="text-[15px] font-medium">{retro.changePercent === 0 ? `Igual a ${prevName}` : `${Math.abs(retro.changePercent)}% ${retro.changePercent < 0 ? "a menos" : "a mais"} que em ${prevName}`}</p>
            <div className="grid gap-2 text-sm">
              {[[prevName, retro.prevTotalCents], [name, retro.totalCents]].map(([label, cents]) => (
                <div key={label as string} className="grid grid-cols-[80px_1fr_auto] items-center gap-2">
                  <span className="capitalize text-muted-foreground">{label}</span>
                  <div className="h-2 rounded-full bg-border"><div className="h-2 rounded-full bg-primary" style={{ width: `${((cents as number) / maxBar) * 100}%` }} /></div>
                  <span className="tabular"><Money cents={cents as number} /></span>
                </div>
              ))}
            </div>
          </>
        ) : null}
        {retro.biggestDrop && retro.biggestDrop.cents >= 5000 ? <p className="text-sm text-muted-foreground">A maior queda foi em {retro.biggestDrop.category.toLowerCase()}: <Money cents={retro.biggestDrop.cents} /> a menos.</p> : null}
      </Card>

      {retro.budgetLines.length > 0 ? (
        <Card className="grid gap-2">
          <p className="text-[15px] font-medium">{over.length === 0 ? "Tudo dentro do combinado" : over.length === 1 ? "Uma categoria passou do combinado" : `${over.length} categorias passaram do combinado`}</p>
          {over.map((l) => <div key={l.category} className="flex justify-between text-sm"><span>{l.category}</span><span className="tabular text-danger"><Money cents={l.spentCents} /> de <Money cents={l.limitCents} /></span></div>)}
          {attention.map((l) => <div key={l.category} className="flex justify-between text-sm"><span>{l.category}</span><span className="tabular">{l.percent}% do orçamento</span></div>)}
          {okCount > 0 ? <div className="flex justify-between text-sm text-muted-foreground"><span>{over.length + attention.length > 0 ? `As outras ${okCount}` : `Todas as ${okCount}`}</span><span>dentro do combinado</span></div> : null}
        </Card>
      ) : null}

      {retro.goalLines.length > 0 ? (
        <Card className="grid gap-2">
          <p className="text-sm text-muted-foreground">Nas metas, vocês guardaram</p>
          <p className="tabular text-2xl font-medium text-success">+ <Money cents={retro.goalsSavedCents} /></p>
          {retro.goalLines.map((g) => <div key={g.id} className="flex justify-between text-sm"><span>{g.name}</span><span className="tabular">+ <Money cents={g.savedCents} /> · {g.percent}%</span></div>)}
        </Card>
      ) : null}

      {total > 0 ? (
        <Card className="grid gap-2">
          <p className="text-[15px] font-medium">Quem pagou o quê</p>
          <SegmentBar total={total} label="Quem pagou o que é Nosso" segments={[{ value: paidBy(0), color: PERSON_BG[people[0].color] }, { value: paidBy(1), color: PERSON_BG[people[1].color] }]} />
          <div className="grid grid-cols-2 gap-2 text-sm">
            {people.map((p, i) => (
              <span key={p.userId} className="flex items-center gap-2"><Avatar person={p} size={24} /><span><span className="block">{p.name} · {Math.round(share(i as 0 | 1) * 100)}%</span><span className="tabular block text-muted-foreground"><Money cents={paidBy(i as 0 | 1)} /></span></span></span>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {Math.abs(share(0) - incomeFirst) <= 0.05 ? "Bem perto" : "Diferente"} da proporção {household.defaultSplit === "income" ? "da renda" : "que vocês escolheram"} ({Math.round(incomeFirst * 100)}/{100 - Math.round(incomeFirst * 100)}). As compras do cartão contam já divididas.
          </p>
        </Card>
      ) : null}

      {owed !== 0 ? (
        <Card className="grid gap-2">
          <p className="text-[15px] font-medium">Acerto do mês</p>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2"><Avatar person={debtor} size={28} /> → <Avatar person={creditor} size={28} /></span>
            <span className="tabular text-xl font-medium"><Money cents={Math.abs(owed)} /></span>
          </div>
          {retro.monthSettled ? (
            <p className="text-sm text-muted-foreground">Acertado em {dayMonth.format(new Date(retro.monthSettled.settled_at))}</p>
          ) : (
            <form action={settleMonthAction}>
              <input type="hidden" name="month" value={month} />
              <SubmitButton variant="outline" className="w-full">Já está acertado</SubmitButton>
            </form>
          )}
        </Card>
      ) : null}

      <Link href={`/couple/retro/${month}/talk`} className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">
        Ver pontos para conversar{retro.points.length ? ` (${retro.points.length})` : ""}
      </Link>
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/couple/retro/${retro.previous}`} className="inline-flex min-h-11 items-center justify-center rounded-full text-sm font-medium text-foreground hover:bg-muted hover:text-foreground">Anterior</Link>
        {canGoNext ? <Link href={`/couple/retro/${nextMonth}`} className="inline-flex min-h-11 items-center justify-center rounded-full text-sm font-medium text-foreground hover:bg-muted hover:text-foreground">Próximo</Link> : <span />}
      </div>
    </div>
  );
}
