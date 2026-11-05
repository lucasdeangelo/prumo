import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

import { Amount, PageHeader, StatTile, StateBadge } from "@/components/app/bits";
import { TransactionList } from "@/components/app/transaction-list";
import { CategoryBars } from "@/components/charts/category-bars";
import { IncomeExpenseBars } from "@/components/charts/income-expense-bars";
import { Card, CardTitle, EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { addDays, formatDayShort, formatMonthLong, formatMonthShort, lastMonths, monthBounds, monthOf, todayIn } from "@/lib/domain/dates";
import { buildForecast, forecastTotals } from "@/lib/domain/forecast";
import { formatBRL } from "@/lib/domain/money";
import { monthlyEquivalentCents } from "@/lib/domain/recurrence";
import { monthlySeries, summarizeMonth } from "@/lib/domain/summary";
import { listAccounts, listBills, listSubscriptions, listTags, listTransactions } from "@/lib/repositories/reads";

export const metadata = { title: "Início · Prumo" };

export default async function OverviewPage() {
  const { user, db } = await requireUser();
  const today = todayIn();
  const month = monthOf(today);
  const months = lastMonths(month, 6);
  const historyStart = monthBounds(months[0]).start;

  const [tags, accounts, history, bills, subscriptions] = await Promise.all([
    listTags(db, user.id),
    listAccounts(db, user.id),
    listTransactions(db, user.id, { from: historyStart, to: monthBounds(month).end, limit: 5000 }),
    listBills(db, user.id, { status: ["pending", "overdue"] }),
    listSubscriptions(db, user.id),
  ]);

  const summary = summarizeMonth(history, tags, month);
  const series = monthlySeries(history, tags, months).map((m) => ({ ...m, label: formatMonthShort(m.month) }));
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const categoryRows = summary.expenseByTag.map((row) => ({
    tagId: row.tagId,
    name: row.tagId ? tagById.get(row.tagId)?.name ?? "Sem tag" : "Sem tag",
    color: row.tagId ? tagById.get(row.tagId)?.color ?? null : null,
    cents: row.cents,
    href: `/monthly/${month}?tag=${row.tagId ?? "none"}`,
  }));

  const forecast = buildForecast({ bills, subscriptions, today, to: addDays(today, 14) });
  const nextItems = forecast.slice(0, 5);
  const overdue = forecast.filter((i) => i.state === "overdue");
  const withBalance = accounts.filter((a) => a.balance_cents !== null);
  const balance = withBalance.reduce((sum, a) => sum + (a.balance_cents ?? 0), 0);
  const candidates = subscriptions.filter((s) => s.status === "candidate");
  const monthlySubs = subscriptions.filter((s) => s.status === "active").reduce((sum, s) => sum + monthlyEquivalentCents(s.amount_cents, s.frequency), 0);
  const recent = history.slice(0, 5);
  const untagged = history.filter((t) => t.transaction_date >= monthBounds(month).start && !t.tag_id).length;

  return (
    <div className="grid gap-4">
      <PageHeader title={`Olá${user.name ? `, ${user.name.split(" ")[0]}` : ""}`} subtitle={formatMonthLong(month)} />

      <Card className="bg-primary text-primary-foreground">
        <p className="text-sm opacity-85">Resultado do mês</p>
        <p className="tabular mt-1 text-4xl font-semibold tracking-tight">{formatBRL(summary.netCents)}</p>
        <p className="mt-2 text-sm opacity-85">
          {withBalance.length > 0 ? <>Saldo informado pelos bancos: <span className="tabular font-medium">{formatBRL(balance)}</span></> : "Conecte um banco em Ajustes para ver o saldo."}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Entradas" cents={summary.incomeCents} tone="in" />
        <StatTile label="Saídas" cents={summary.expenseCents} tone="out" />
      </div>

      {overdue.length > 0 ? (
        <Link href="/upcoming" className="flex items-center gap-3 rounded-2xl bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />
          <span className="flex-1">{overdue.length} conta(s) vencida(s): {formatBRL(forecastTotals(overdue).outCents)}</span>
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}

      {candidates.length > 0 ? (
        <Link href="/subscriptions" className="flex items-center gap-3 rounded-2xl bg-warning-bg p-3 text-sm text-warning-fg">
          <Sparkles aria-hidden="true" className="size-5 shrink-0" />
          <span className="flex-1">Encontramos {candidates.length} possível(is) assinatura(s). Confirme?</span>
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}

      <Card>
        <CardTitle>Últimos 6 meses</CardTitle>
        <IncomeExpenseBars data={series} />
      </Card>

      <Card>
        <CardTitle action={<Link href={`/monthly/${month}`} className="text-sm font-medium text-primary">Ver mês</Link>}>Gastos por tag</CardTitle>
        {categoryRows.length > 0 ? <CategoryBars rows={categoryRows} totalCents={summary.expenseCents} /> : <EmptyState title="Sem gastos neste mês ainda" />}
        {untagged > 0 ? <p className="mt-3 text-xs text-muted-foreground">{untagged} movimentação(ões) sem tag.</p> : null}
      </Card>

      <Card>
        <CardTitle action={<Link href="/upcoming" className="text-sm font-medium text-primary">Todas</Link>}>Próximos 14 dias</CardTitle>
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
          <EmptyState title="Nada previsto">Cadastre contas em Futuras.</EmptyState>
        )}
        {monthlySubs > 0 ? <p className="mt-3 text-xs text-muted-foreground">Assinaturas ativas custam {formatBRL(monthlySubs)} por mês.</p> : null}
      </Card>

      <section className="grid gap-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-semibold">Recentes</h2>
          <Link href={`/monthly/${month}`} className="text-sm font-medium text-primary">Ver tudo</Link>
        </div>
        {recent.length > 0 ? <TransactionList transactions={recent} tags={tags} grouped={false} /> : (
          <EmptyState title="Nenhuma movimentação">Toque em + para registrar, conecte um banco ou mande uma mensagem no WhatsApp.</EmptyState>
        )}
      </section>
    </div>
  );
}
