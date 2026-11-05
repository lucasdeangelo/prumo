import { Download, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MonthSwitcher, PageHeader, StatTile } from "@/components/app/bits";
import { TransactionList } from "@/components/app/transaction-list";
import { CategoryBars } from "@/components/charts/category-bars";
import { CumulativeLine } from "@/components/charts/cumulative-line";
import { Card, CardTitle, EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { formatMonthLong, isMonthKey, monthBounds, monthOf, todayIn } from "@/lib/domain/dates";
import { summarizeMonth } from "@/lib/domain/summary";
import { listTags, listTransactions } from "@/lib/repositories/reads";
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

  const [tags, transactions, previous] = await Promise.all([
    listTags(db, user.id),
    listTransactions(db, user.id, { from: start, to: end, limit: 3000 }),
    listTransactions(db, user.id, { from: prevBounds.start, to: prevBounds.end, type: "debit", limit: 3000, columns: "amount_cents, type, transaction_date, tag_id" }),
  ]);

  const summary = summarizeMonth(transactions, tags, month);
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
  const deltaPct = previousSummary.expenseCents > 0 ? Math.round(((summary.expenseCents - previousSummary.expenseCents) / previousSummary.expenseCents) * 100) : null;

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Visão do mês"
        action={
          <a href={`/api/export/${month}`} className="flex size-11 items-center justify-center rounded-xl hover:bg-muted" aria-label="Exportar CSV">
            <Download aria-hidden="true" className="size-5" />
          </a>
        }
      />
      <MonthSwitcher label={formatMonthLong(month)} prevHref={`/monthly/${prev}`} nextHref={month < current ? `/monthly/${next}` : undefined} />

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Entradas" cents={summary.incomeCents} tone="in" />
        <StatTile label="Saídas" cents={summary.expenseCents} tone="out" hint={deltaPct === null ? undefined : `${deltaPct > 0 ? "+" : ""}${deltaPct}% vs. anterior`} />
        <StatTile label="Resultado" cents={summary.netCents} />
      </div>

      <Card>
        <CardTitle>Gasto acumulado</CardTitle>
        <CumulativeLine data={line} />
      </Card>

      <Card>
        <CardTitle>Por tag</CardTitle>
        {categoryRows.length > 0 ? <CategoryBars rows={categoryRows} totalCents={summary.expenseCents} limit={8} /> : <EmptyState title="Sem gastos neste mês" />}
      </Card>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: "Tudo", href: base, active: !activeFilter },
            { label: "Saídas", href: `${base}?type=debit`, active: filterType === "debit" && filterTag === undefined },
            { label: "Entradas", href: `${base}?type=credit`, active: filterType === "credit" && filterTag === undefined },
          ].map((chip) => (
            <Link key={chip.label} href={chip.href} className={cn("min-h-9 rounded-full border px-3.5 py-1.5 text-sm font-medium", chip.active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}>
              {chip.label}
            </Link>
          ))}
          {filterTag !== undefined ? (
            <Link href={base} className="flex min-h-9 items-center gap-1 rounded-full border border-primary bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground">
              {filterTag ? tagById.get(filterTag)?.name : "Sem tag"} <X aria-label="Limpar filtro" className="size-4" />
            </Link>
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} itens</span>
        </div>
        {filtered.length > 0 ? <TransactionList transactions={filtered} tags={tags} /> : <EmptyState title="Nada por aqui" />}
      </section>
    </div>
  );
}
