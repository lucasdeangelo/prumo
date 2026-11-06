import Link from "next/link";

import { Amount, SectionHeader, StatTile, StateBadge } from "@/components/app/bits";
import { ChevronRightIcon, SparkIcon } from "@/components/app/icons";
import { TransactionList } from "@/components/app/transaction-list";
import { CategoryBars } from "@/components/charts/category-bars";
import { IncomeExpenseBars } from "@/components/charts/income-expense-bars";
import { Card, CardTitle, EmptyState } from "@/components/ui/card";
import { addDays, formatDayShort, formatMonthShort, lastMonths, monthBounds } from "@/lib/domain/dates";
import { buildForecast, forecastTotals } from "@/lib/domain/forecast";
import { formatBRL } from "@/lib/domain/money";
import { monthlyEquivalentCents } from "@/lib/domain/recurrence";
import { monthlySeries, summarizeMonth } from "@/lib/domain/summary";
import type { Subscription, Tag, Transaction, UpcomingBill } from "@/lib/types";

/** Balance of the checking accounts; below zero means the overdraft is in use. */
export function BalanceCard({ balanceCents, hasBalance }: { balanceCents: number; hasBalance: boolean }) {
  return (
    <Card className="flex flex-col gap-2 border-0 bg-primary p-6 text-primary-foreground">
      <p className="label-mono text-[#cfe0d8]">Saldo em Conta</p>
      <p className="tabular text-[40px] font-medium leading-[1.05] tracking-[-0.03em]">
        {hasBalance ? (
          <>
            <span className="tabular font-medium text-white">{formatBRL(balanceCents)}</span>
            {balanceCents < 0 ? " · usando o cheque especial" : ""}
          </>
        ) : (
          "Conecte um banco em Ajustes para ver o saldo."
        )}
      </p>
    </Card>
  );
}

/** Month result, the last 6 months, spending by tag, next 14 days and recent items, for one space. */
export function HomeAnalytics({
  month,
  today,
  history,
  tags,
  bills,
  subscriptions,
  balanceCents,
  hasBalance,
  showBalance = true,
}: {
  month: string;
  today: string;
  history: Transaction[];
  tags: Tag[];
  bills: UpcomingBill[];
  subscriptions: Subscription[];
  /** Checking accounts only, signed: below zero means overdraft in use. */
  balanceCents: number;
  hasBalance: boolean;
  /** False when the page shows the balance itself (above the accounts). */
  showBalance?: boolean;
}) {
  const months = lastMonths(month, 6);
  const summary = summarizeMonth(history, tags, month);
  const series = monthlySeries(history, tags, months).map((m) => ({ ...m, label: formatMonthShort(m.month) }));
  const tagById = new Map(tags.map((t) => [t.id, t]));
  // Both people's tags share names; merge by name so "Mercado" is one row.
  const byName = new Map<string, { tagId: string | null; name: string; color: string | null; cents: number }>();
  for (const row of summary.expenseByTag) {
    const tag = row.tagId ? tagById.get(row.tagId) : undefined;
    const name = tag?.name ?? "Sem tag";
    const current = byName.get(name);
    byName.set(name, { tagId: current?.tagId ?? row.tagId, name, color: current?.color ?? tag?.color ?? null, cents: (current?.cents ?? 0) + row.cents });
  }
  const categoryRows = [...byName.values()]
    .sort((a, b) => b.cents - a.cents)
    .map((row) => ({ ...row, href: `/monthly/${month}?tag=${row.tagId ?? "none"}` }));

  const forecast = buildForecast({ bills, subscriptions, today, to: addDays(today, 14) });
  const nextItems = forecast.slice(0, 6);
  const overdue = forecast.filter((i) => i.state === "overdue");
  const candidates = subscriptions.filter((s) => s.status === "candidate");
  const monthlySubs = subscriptions.filter((s) => s.status === "active").reduce((sum, s) => sum + monthlyEquivalentCents(s.amount_cents, s.frequency), 0);
  const recent = history.slice(0, 5);
  const untagged = history.filter((t) => t.transaction_date >= monthBounds(month).start && !t.tag_id).length;

  return (
    <>
      {showBalance ? <BalanceCard balanceCents={balanceCents} hasBalance={hasBalance} /> : null}

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Entradas" cents={summary.incomeCents} tone="in" />
        <StatTile label="Saídas" cents={summary.expenseCents} tone="out" />
      </div>

      {overdue.length > 0 ? (
        <Link href="/upcoming" className="flex min-h-12 items-center gap-3 rounded-2xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger hover:text-danger">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-danger" />
          <span className="flex-1">{overdue.length === 1 ? "1 conta vencida" : `${overdue.length} contas vencidas`}: {formatBRL(forecastTotals(overdue).outCents)}</span>
          <ChevronRightIcon className="size-4" strokeWidth={1.8} />
        </Link>
      ) : null}

      {candidates.length > 0 ? (
        <Link href="/subscriptions" className="flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:text-foreground">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning-fg"><SparkIcon className="size-4" /></span>
          <span className="flex-1">Encontramos {candidates.length === 1 ? "1 possível assinatura" : `${candidates.length} possíveis assinaturas`}. Confirme?</span>
          <ChevronRightIcon className="size-4 text-muted-foreground" strokeWidth={1.8} />
        </Link>
      ) : null}

      <Card>
        <CardTitle>Últimos 6 meses</CardTitle>
        <IncomeExpenseBars data={series} />
      </Card>

      <Card>
        <CardTitle action={<Link href={`/monthly/${month}`} className="text-sm font-medium">Ver mês</Link>}>Gastos por tag</CardTitle>
        {categoryRows.length > 0 ? <CategoryBars rows={categoryRows} totalCents={summary.expenseCents} /> : <EmptyState title="Sem gastos neste mês ainda" />}
        {untagged > 0 ? <p className="mt-3 text-xs text-muted-foreground">{untagged === 1 ? "1 movimentação sem tag." : `${untagged} movimentações sem tag.`}</p> : null}
      </Card>

      <Card>
        <CardTitle action={<Link href="/upcoming" className="text-sm font-medium">Todas</Link>}>Próximos 14 dias</CardTitle>
        {nextItems.length > 0 ? (
          <ul className="grid gap-2.5">
            {nextItems.map((item) => (
              <li key={item.key} className="flex items-center gap-3 text-sm">
                <span className="tabular w-12 shrink-0 text-xs text-muted-foreground">{formatDayShort(item.date)}</span>
                <span className="min-w-0 flex-1 truncate">{item.description}</span>
                <StateBadge state={item.state} />
                <Amount cents={item.amountCents} type={item.direction} className="text-sm" />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nada previsto"><Link href="/upcoming/new">Cadastre uma conta futura</Link>.</EmptyState>
        )}
        {monthlySubs > 0 ? <p className="mt-3 text-xs text-muted-foreground">Assinaturas ativas custam {formatBRL(monthlySubs)} por mês.</p> : null}
      </Card>

      <section className="grid gap-2">
        <SectionHeader title="Recentes" action={<Link href={`/monthly/${month}`} className="flex min-h-11 items-center text-sm font-medium">Ver tudo</Link>} />
        {recent.length > 0 ? <TransactionList transactions={recent} tags={tags} grouped={false} /> : (
          <EmptyState title="Nenhuma movimentação">Toque em + para registrar, conecte um banco ou mande uma mensagem no WhatsApp.</EmptyState>
        )}
      </section>
    </>
  );
}
