"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { formatAxisBRL, formatBRL } from "@/lib/domain/money";

export type CumulativePoint = { day: number; expenseCents: number | null; previousCents: number | null };

function TooltipCard({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as CumulativePoint;
  return (
    <div className="rounded-[10px] border border-border bg-card px-3 py-2 text-xs shadow-[0_8px_24px_rgba(18,21,18,0.08)]">
      <p className="mb-1 font-semibold">Dia {point.day}</p>
      {point.expenseCents !== null ? <p>Este mês <span className="tabular pl-3 font-medium">{formatBRL(point.expenseCents)}</span></p> : null}
      {point.previousCents !== null ? <p className="text-muted-foreground">Mês anterior <span className="tabular pl-3">{formatBRL(point.previousCents)}</span></p> : null}
    </div>
  );
}

/** Spending accumulated through the month, against the previous month as a dashed reference. */
export function CumulativeLine({ data }: { data: CumulativePoint[] }) {
  return (
    <figure>
      <figcaption className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 rounded" style={{ background: "var(--series-expense)" }} /> Este mês</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "var(--chart-axis)" }} /> Mês anterior</span>
      </figcaption>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis width={54} tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={(v: number) => formatAxisBRL(v)} />
            <Tooltip content={TooltipCard} cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }} />
            <Line type="monotone" dataKey="previousCents" stroke="var(--chart-axis)" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="expenseCents" stroke="var(--series-expense)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
