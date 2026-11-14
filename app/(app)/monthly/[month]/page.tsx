import { X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Amount, IconLink, MonthSwitcher, PageHeader, SectionHeader } from "@/components/app/bits";
import { HideValuesToggle } from "@/components/app/hide-values";
import { DownloadIcon } from "@/components/app/icons";
import { TransactionList } from "@/components/app/transaction-list";
import { CategoryBars } from "@/components/charts/category-bars";
import { CumulativeLine } from "@/components/charts/cumulative-line";
import { Card, CardTitle, EmptyState } from "@/components/ui/card";
import { SpaceSwitcher, UpdatedAt } from "@/components/app/couple";
import { Money } from "@/components/app/money";
import { requireUser } from "@/lib/auth/session";
import { lastSyncAt, loadSharedHistory, loadSharedPlans } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
import { overdraftFor } from "@/lib/application/overdraft";
import { currentSpace } from "@/lib/space";
import { formatDayShort, formatMonthLong, isMonthKey, monthBounds, monthOf, todayIn } from "@/lib/domain/dates";
import { summarizeMonth } from "@/lib/domain/summary";
import { listBills, listTags, listTransactions } from "@/lib/repositories/reads";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mês · Prumo" };

type Search = { tag?: string; type?: string };

export default async function MonthPage({ params, searchParams }: { params: Promise<{ month: string }>; searchParams: Promise<Search> }) {
  const { month } = await params;
  const search = await searchParams;
  if (!isMonthKey(month)) notFound();
  const { user, db } = await requireUser();
  const today = todayIn();
  const current = monthOf(today);
  const { start, end, prev, next } = monthBounds(month);
  const prevBounds = monthBounds(prev);
  const [household, space] = await Promise.all([getHousehold(user.id), currentSpace()]);
  const partner = household?.partner ?? null;
  const nosso = Boolean(partner) && space === "nosso";
  const memberIds = [user.id, partner?.userId].filter(Boolean) as string[];
  // Started now so they load alongside the month's movements.
  const overdraftIn = nosso ? Promise.resolve([]) : overdraftFor(user.id, month);
  const syncedAtIn = month === monthOf(today) ? lastSyncAt(memberIds) : Promise.resolve(null);
  overdraftIn.catch(() => {});
  syncedAtIn.catch(() => {});

  // Meu: my own facts (what is Nosso lives in the shared space). Nosso: what both marked as Nosso.
  const [tags, transactions, previous, openBills] = nosso
    ? await (async () => {
        const [plans, facts, prevFacts] = await Promise.all([
          loadSharedPlans(memberIds),
          loadSharedHistory(memberIds, start, end),
          loadSharedHistory(memberIds, prevBounds.start, prevBounds.end),
        ]);
        return [plans.tags, facts, prevFacts.filter((t) => t.type === "debit"), plans.bills.filter((b) => b.due_date <= end)] as const;
      })()
    : await Promise.all([
        listTags(db, user.id),
        listTransactions(db, user.id, { from: start, to: end, limit: 3000 }).then((list) => (partner ? list.filter((t) => t.scope !== "ours") : list)),
        listTransactions(db, user.id, { from: prevBounds.start, to: prevBounds.end, type: "debit", limit: 3000, columns: "amount_cents, type, transaction_date, tag_id, scope" }).then((list) => (partner ? list.filter((t) => t.scope !== "ours") : list)),
        listBills(db, user.id, { status: ["pending", "overdue"], to: end }).then((list) => (partner ? list.filter((b) => b.scope !== "ours") : list)),
      ]);
  // Upcoming bills live inside Mês (navigation map): open bills due up to the end of this month.
  const monthBills = month >= current ? openBills : [];

  const summary = summarizeMonth(transactions, tags, month);
  const [overdraft, syncedAt] = await Promise.all([overdraftIn, syncedAtIn]);
  const previousSummary = summarizeMonth(previous, tags, prev);
  const isCurrent = month === current;
  const todayDay = Number(today.slice(8, 10));
  const days = Math.max(summary.daily.length, previousSummary.daily.length);
  const line = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    expenseCents: i < summary.daily.length && (!isCurrent || i < todayDay) && month <= current ? summary.daily[i].expenseCents : null,
    previousCents: i < previousSummary.daily.length ? previousSummary.daily[i].expenseCents : null,
  }));

  const tagById = new Map(tags.map((t) => [t.id, t]));
  const base = `/monthly/${month}`;
  const categoryRows = summary.expenseByTag.map((row) => ({
    tagId: row.tagId,
    name: row.tagId ? tagById.get(row.tagId)?.name ?? "Sem tag" : "Sem tag",
    color: row.tagId ? tagById.get(row.tagId)?.color ?? null : null,
    cents: row.cents,
    href: `${base}?tag=${row.tagId ?? "none"}`,
  }));

  const filterTag = search.tag === "none" ? null : search.tag && tagById.has(search.tag) ? search.tag : undefined;
  const filterType = search.type === "credit" || search.type === "debit" ? search.type : undefined;
  const filtered = transactions.filter((t) => (filterTag === undefined || t.tag_id === filterTag) && (!filterType || t.type === filterType));
  const activeFilter = filterTag !== undefined || filterType;
  // "Deve sobrar no fim do mês": what is left after the bills still open this month.
  const toPay = monthBills.filter((b) => b.type === "payable").reduce((s, b) => s + b.amount_cents, 0);
  const toReceive = monthBills.filter((b) => b.type === "receivable").reduce((s, b) => s + b.amount_cents, 0);
  const projected = summary.netCents - toPay + toReceive;
  const deltaPct = previousSummary.expenseCents > 0 ? Math.round(((summary.expenseCents - previousSummary.expenseCents) / previousSummary.expenseCents) * 100) : null;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Mês"
        action={<div className="flex"><HideValuesToggle /><IconLink href={`/api/export/${month}`} label="Exportar CSV" download><DownloadIcon className="size-5" /></IconLink></div>}
      />
      {household ? <SpaceSwitcher space={nosso ? "nosso" : "meu"} me={household.me} partner={partner} returnTo={`/monthly/${month}`} /> : null}
      <MonthSwitcher label={formatMonthLong(month)} prevHref={`/monthly/${prev}`} nextHref={month < current ? `/monthly/${next}` : undefined} />
      {month === current ? <UpdatedAt at={syncedAt} /> : null}

      <section className="flex flex-col gap-4 rounded-2xl bg-primary p-5 text-primary-foreground">
        <div className="flex flex-col gap-1.5">
          <span className="label-mono text-[#cfe0d8]">{month >= current ? "Deve sobrar no fim do mês" : "Sobrou no mês"}</span>
          <span className="tabular text-[40px] font-medium leading-[1.05] tracking-[-0.03em]"><Money cents={month >= current ? projected : summary.netCents} /></span>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-white/20 pt-3.5">
          <span className="flex flex-col gap-0.5 text-xs text-[#cfe0d8]">Entrou<span className="tabular text-[15px] font-medium text-white"><Money cents={summary.incomeCents} /></span></span>
          <span className="flex flex-col gap-0.5 text-xs text-[#cfe0d8]">Saiu<span className="tabular text-[15px] font-medium text-white"><Money cents={summary.expenseCents} /></span></span>
          {month >= current ? (
            <span className="flex flex-col gap-0.5 text-xs text-[#cfe0d8]">Falta pagar<span className="tabular text-[15px] font-medium text-white"><Money cents={toPay} /></span></span>
          ) : (
            <span className="flex flex-col gap-0.5 text-xs text-[#cfe0d8]">vs. anterior<span className="tabular text-[15px] font-medium text-white">{deltaPct === null ? "—" : `${deltaPct > 0 ? "+" : ""}${deltaPct}%`}</span></span>
          )}
        </div>
        {overdraft.some((o) => o.negativeDays > 0 || o.chargesCents > 0) ? (
          <p className="border-t border-white/20 pt-3 text-sm text-[#cfe0d8]">
            {overdraft.map((o) => (
              <span key={o.account.id} className="block">
                Cheque especial {o.account.institution ?? o.account.name}: {o.negativeDays} {o.negativeDays === 1 ? "dia" : "dias"} no negativo
                {o.lowestDate ? (
                  <>
                    , chegando a <span className="tabular font-medium text-white"><Money cents={o.lowestCents} /></span> em {formatDayShort(o.lowestDate)}
                  </>
                ) : null}
                {o.chargesCents > 0 ? (
                  <>
                    {" · "}juros e IOF <span className="tabular font-medium text-white"><Money cents={o.chargesCents} /></span>, já nas saídas
                  </>
                ) : null}
              </span>
            ))}
          </p>
        ) : null}
      </section>

      <section className="grid gap-2.5">
        <SectionHeader title="Para onde foi" action={nosso ? <Link href="/couple/budget" className="flex min-h-11 items-center text-sm font-medium no-underline">Orçamento</Link> : undefined} />
        <Card>
          {categoryRows.length > 0 ? <CategoryBars rows={categoryRows} totalCents={summary.expenseCents} limit={8} /> : <EmptyState title="Sem gastos neste mês" />}
        </Card>
      </section>

      {month >= current ? (
        <section className="grid gap-2.5">
          <SectionHeader title="Próximas contas" action={<Link href="/upcoming/new" className="flex min-h-11 items-center text-sm font-medium no-underline">Nova conta</Link>} />
          {monthBills.length > 0 ? (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {monthBills.slice(0, 4).map((bill) => {
                const late = bill.due_date < today;
                return (
                  <li key={bill.id}>
                    <Link href={`/upcoming/${bill.id}`} className={cn("flex min-h-14 items-center gap-3 px-4 py-3 text-foreground no-underline hover:text-foreground", late ? "bg-danger-bg" : "hover:bg-[#fafaf8]")}>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-medium">{bill.description}</span>
                        <span className={cn("text-[13px]", late ? "text-danger" : "text-muted-foreground")}>{late ? `Venceu ${formatDayShort(bill.due_date)}` : formatDayShort(bill.due_date)}</span>
                      </span>
                      <Amount cents={bill.amount_cents} type={bill.type === "payable" ? undefined : "in"} className="text-[15px]" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Nenhuma conta em aberto neste mês" />
          )}
          <Link href="/upcoming" className="flex min-h-11 items-center justify-center text-sm font-medium no-underline">Ver contas futuras</Link>
        </section>
      ) : null}

      <Card>
        <CardTitle>Gasto acumulado</CardTitle>
        <CumulativeLine data={line} />
      </Card>

      <section className="grid gap-3">
        <SectionHeader title="Movimentações" action={<span className="text-xs text-muted-foreground">{filtered.length} no mês</span>} />
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: "Tudo", href: base, active: !activeFilter },
            { label: "Saídas", href: `${base}?type=debit`, active: filterType === "debit" && filterTag === undefined },
            { label: "Entradas", href: `${base}?type=credit`, active: filterType === "credit" && filterTag === undefined },
          ].map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              className={cn(
                "inline-flex min-h-9 items-center rounded-[6px] px-3 text-sm no-underline",
                chip.active ? "bg-foreground text-white hover:text-white" : "border border-border bg-card text-foreground hover:text-foreground",
              )}
            >
              {chip.label}
            </Link>
          ))}
          {filterTag !== undefined ? (
            <Link href={base} className="inline-flex min-h-9 items-center gap-1 rounded-[6px] bg-foreground px-3 text-sm text-white no-underline hover:text-white">
              {filterTag ? tagById.get(filterTag)?.name : "Sem tag"} <X aria-label="Limpar filtro" className="size-4" />
            </Link>
          ) : null}
        </div>
        {filtered.length > 0 ? <TransactionList transactions={filtered} tags={tags} /> : <EmptyState title="Nada por aqui" />}
      </section>
    </div>
  );
}
