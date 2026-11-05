import { Plus, Repeat } from "lucide-react";
import Link from "next/link";

import { Amount, PageHeader, StatTile, StateBadge } from "@/components/app/bits";
import { Card, EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { addDays, formatDayLabel, formatMonthLong, monthOf, todayIn } from "@/lib/domain/dates";
import { buildForecast, forecastTotals, type ForecastItem } from "@/lib/domain/forecast";
import { listBills, listSubscriptions } from "@/lib/repositories/reads";

export const metadata = { title: "Contas futuras · Prumo" };

const RANGES = [30, 90, 180] as const;

export default async function UpcomingPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { dias } = await searchParams;
  const range = RANGES.find((r) => String(r) === dias) ?? 90;
  const { user, db } = await requireUser();
  const today = todayIn();
  const [bills, subscriptions] = await Promise.all([listBills(db, user.id, { status: ["pending", "overdue"] }), listSubscriptions(db, user.id)]);
  const items = buildForecast({ bills, subscriptions, today, to: addDays(today, range) });
  const totals = forecastTotals(items);

  const byMonth = new Map<string, ForecastItem[]>();
  for (const item of items) {
    const key = item.state === "overdue" ? "overdue" : monthOf(item.date);
    byMonth.set(key, [...(byMonth.get(key) ?? []), item]);
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Contas futuras"
        subtitle={`Próximos ${range} dias`}
        action={<Link href="/upcoming/new" aria-label="Nova conta" className="flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Plus aria-hidden="true" className="size-5" /></Link>}
      />
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <Link key={r} href={`/upcoming?dias=${r}`} className={`min-h-9 rounded-full border px-3.5 py-1.5 text-sm font-medium ${r === range ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>
            {r} dias
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="A pagar" cents={totals.outCents} tone="out" />
        <StatTile label="A receber" cents={totals.inCents} tone="in" />
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nenhuma conta prevista">
          <Link href="/upcoming/new" className="font-medium text-primary">Cadastre aluguel, luz, fatura…</Link>
        </EmptyState>
      ) : (
        [...byMonth.entries()].map(([key, list]) => (
          <section key={key} className="grid gap-2">
            <h2 className="flex items-baseline justify-between px-1 text-sm font-semibold">
              <span className={key === "overdue" ? "text-danger" : undefined}>{key === "overdue" ? "Vencidas" : formatMonthLong(key)}</span>
              <span className="tabular text-xs font-normal text-muted-foreground">{formatTotal(list)}</span>
            </h2>
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {list.map((item) => {
                  const href = item.kind === "bill" && item.state !== "predicted" ? `/upcoming/${item.sourceId}` : item.kind === "subscription" ? "/subscriptions" : undefined;
                  const body = (
                    <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {item.kind === "subscription" ? <Repeat aria-label="Assinatura" className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                          {item.description}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">{formatDayLabel(item.date)} <StateBadge state={item.state} /></p>
                      </div>
                      <Amount cents={item.amountCents} type={item.direction} className="text-sm" />
                    </div>
                  );
                  return <li key={item.key}>{href ? <Link href={href} className="block hover:bg-muted/60">{body}</Link> : body}</li>;
                })}
              </ul>
            </Card>
          </section>
        ))
      )}
      <p className="px-1 text-xs text-muted-foreground">
        <strong>Registrada</strong>: conta cadastrada por você. <strong>Prevista</strong>: repetição de conta recorrente ou cobrança de assinatura, calculada.
      </p>
    </div>
  );
}

function formatTotal(list: ForecastItem[]) {
  const { outCents, inCents } = forecastTotals(list);
  const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return [outCents ? `− ${brl(outCents)}` : null, inCents ? `+ ${brl(inCents)}` : null].filter(Boolean).join(" · ");
}
