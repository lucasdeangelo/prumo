"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { formatAxisBRL, formatBRL } from "@/lib/domain/money";

export type MonthBar = { month: string; label: string; incomeCents: number; expenseCents: number };

function TooltipCard({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as MonthBar;
  return (
    <div className="rounded-[10px] border border-border bg-card px-3 py-2 text-xs shadow-[0_8px_24px_rgba(18,21,18,0.08)]">
      <p className="mb-1 font-semibold capitalize">{label}</p>
      <p className="flex items-center gap-2"><Swatch role="income" /> Entradas <span className="tabular ml-auto pl-3 font-medium">{formatBRL(row.incomeCents)}</span></p>
      <p className="flex items-center gap-2"><Swatch role="expense" /> Saídas <span className="tabular ml-auto pl-3 font-medium">{formatBRL(row.expenseCents)}</span></p>
      <p className="mt-1 border-t border-border pt-1 text-muted-foreground">Resultado <span className="tabular float-right pl-3">{formatBRL(row.incomeCents - row.expenseCents)}</span></p>
    </div>
  );
}

function Swatch({ role }: { role: "income" | "expense" }) {
  return <span aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: `var(--series-${role})` }} />;
}

/** Income vs spending per month: two series, one axis, legend above, hover tooltip. */
export function IncomeExpenseBars({ data }: { data: MonthBar[] }) {
  return (
    <figure>
      <figcaption className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Swatch role="income" /> Entradas</span>
        <span className="flex items-center gap-1.5"><Swatch role="expense" /> Saídas</span>
      </figcaption>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
            <YAxis width={54} tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={(v: number) => formatAxisBRL(v)} />
            <Tooltip content={TooltipCard} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
            <Bar dataKey="incomeCents" name="Entradas" fill="var(--series-income)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            <Bar dataKey="expenseCents" name="Saídas" fill="var(--series-expense)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Entradas e saídas por mês</caption>
        <thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.month}><td>{d.label}</td><td>{formatBRL(d.incomeCents)}</td><td>{formatBRL(d.expenseCents)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
