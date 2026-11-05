import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { formatBRL } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: string; back?: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2 pb-4 pt-2">
      {back ? (
        <Link href={back} aria-label="Voltar" className="-ml-2 flex size-11 items-center justify-center rounded-xl hover:bg-muted">
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

/** Signed amount: entries carry "+", spending "−". Color is a secondary cue, the sign is primary. */
export function Amount({ cents, type, className }: { cents: number; type?: "credit" | "debit" | "in" | "out"; className?: string }) {
  const positive = type === "credit" || type === "in";
  const negative = type === "debit" || type === "out";
  return (
    <span className={cn("tabular whitespace-nowrap font-semibold", positive && "text-success", className)}>
      {positive ? "+ " : negative ? "− " : ""}
      {formatBRL(cents)}
    </span>
  );
}

export function TagDot({ color, className }: { color?: string | null; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ backgroundColor: color ?? "var(--muted-foreground)" }} />;
}

export function MonthSwitcher({ label, prevHref, nextHref }: { label: string; prevHref: string; nextHref?: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-1">
      <Link href={prevHref} aria-label="Mês anterior" className="flex size-11 items-center justify-center rounded-xl hover:bg-muted">
        <ChevronLeft aria-hidden="true" className="size-5" />
      </Link>
      <span className="font-semibold">{label}</span>
      {nextHref ? (
        <Link href={nextHref} aria-label="Próximo mês" className="flex size-11 items-center justify-center rounded-xl hover:bg-muted">
          <ChevronRight aria-hidden="true" className="size-5" />
        </Link>
      ) : (
        <span className="size-11" />
      )}
    </div>
  );
}

export function StatTile({ label, cents, tone, hint }: { label: string; cents: number; tone?: "in" | "out"; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {tone ? <span aria-hidden="true" className="size-2 rounded-full" style={{ background: tone === "in" ? "var(--series-income)" : "var(--series-expense)" }} /> : null}
        {label}
      </p>
      <p className="tabular mt-1 text-[clamp(0.9rem,3.9vw,1.125rem)] font-semibold">{formatBRL(cents)}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function StateBadge({ state }: { state: "overdue" | "confirmed" | "predicted" | "candidate" | "active" | "paused" | "cancelled" | "rejected" }) {
  const map = {
    overdue: ["Vencida", "bg-danger/10 text-danger"],
    confirmed: ["Registrada", "bg-secondary text-secondary-foreground"],
    predicted: ["Prevista", "bg-muted text-muted-foreground"],
    candidate: ["Sugerida", "bg-warning-bg text-warning-fg"],
    active: ["Ativa", "bg-secondary text-secondary-foreground"],
    paused: ["Pausada", "bg-muted text-muted-foreground"],
    cancelled: ["Cancelada", "bg-muted text-muted-foreground"],
    rejected: ["Ignorada", "bg-muted text-muted-foreground"],
  } as const;
  const [label, style] = map[state];
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", style)}>{label}</span>;
}
