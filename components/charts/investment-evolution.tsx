"use client";

import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { Money } from "@/components/app/money";

export type EvolutionPoint = { date: string; label: string; amountCents: number; investedCents: number };

function TooltipCard({ active, payload, valueLabel }: TooltipContentProps<ValueType, NameType> & { valueLabel: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as EvolutionPoint;
  const [y, m, d] = point.date.split("-");
  return (
    <div className="rounded-[10px] border border-border bg-card px-3 py-2 text-xs shadow-[0_8px_24px_rgba(18,21,18,0.08)]">
      <p className="mb-1 font-semibold tabular">{`${d}/${m}/${y}`}</p>
      <p>{valueLabel} <span className="tabular pl-3 font-medium"><Money cents={point.amountCents} /></span></p>
      <p className="text-muted-foreground">Aplicado <span className="tabular pl-3"><Money cents={point.investedCents} /></span></p>
    </div>
  );
}

/**
 * Value against what was put in, as drawn on "Investimentos" and the asset screens: green line
 * over a light fill, invested as a gray dashed line. Points come from the values the Prumo stored.
 */
export function InvestmentEvolution({ data, valueLabel = "Patrimônio", investedLabel = "Valor aplicado", ariaLabel, color = "var(--series-income)" }: { data: EvolutionPoint[]; valueLabel?: string; investedLabel?: string; ariaLabel: string; color?: string }) {
  const values = data.flatMap((p) => [p.amountCents, p.investedCents]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, Math.round((max - min) * 0.15));
  return (
    <figure className="money-chart grid gap-2">
      <div className="h-32 w-full" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis hide domain={[Math.max(0, min - pad), max + pad]} />
            <Tooltip content={(props) => <TooltipCard {...props} valueLabel={valueLabel} />} cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }} />
            <Area type="monotone" dataKey="amountCents" stroke="none" fill={color} fillOpacity={0.08} isAnimationActive={false} activeDot={false} />
            <Line type="monotone" dataKey="investedCents" stroke="#8C908A" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="amountCents" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-3.5 rounded" style={{ background: color }} />{valueLabel}</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: "#8C908A" }} />{investedLabel}</span>
      </figcaption>
    </figure>
  );
}
