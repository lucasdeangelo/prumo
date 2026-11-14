import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Money } from "@/components/app/money";
import { cn } from "@/lib/utils";

/** Screen title (Título · 24/32 · 500), optional back arrow and a trailing action. */
export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: string; back?: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2 pb-2">
      {back ? (
        <Link href={back} aria-label="Voltar" className="-ml-3 flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-medium tracking-[-0.02em]">{title}</h1>
        {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

/** Round icon button used in headers (e.g. "+" on Assinaturas, export on Mês). */
export function IconLink({ href, label, children, tone = "plain", download }: { href: string; label: string; children: React.ReactNode; tone?: "plain" | "tint"; download?: boolean }) {
  const className = cn(
    "flex size-11 shrink-0 items-center justify-center rounded-full",
    tone === "tint" ? "bg-secondary text-primary hover:bg-[#d3e3db] hover:text-primary" : "text-foreground hover:bg-muted hover:text-foreground",
  );
  return download ? (
    <a href={href} aria-label={label} className={className}>{children}</a>
  ) : (
    <Link href={href} aria-label={label} className={className}>{children}</Link>
  );
}

/** Signed amount: entries carry "+", spending "−". Color is a secondary cue, the sign is primary. */
export function Amount({ cents, type, className }: { cents: number; type?: "credit" | "debit" | "in" | "out"; className?: string }) {
  const positive = type === "credit" || type === "in";
  const negative = type === "debit" || type === "out";
  return (
    <span className={cn("tabular whitespace-nowrap font-medium", positive && "text-success", className)}>
      {positive ? "+ " : negative ? "− " : ""}
      <Money cents={cents} />
    </span>
  );
}

export function TagDot({ color, className }: { color?: string | null; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ backgroundColor: color ?? "var(--muted-foreground)" }} />;
}

/** Month navigation as drawn on "Mês": arrows around the month name, no box. */
export function MonthSwitcher({ label, prevHref, nextHref, caption }: { label: string; prevHref: string; nextHref?: string; caption?: string }) {
  const arrow = "flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted hover:text-foreground";
  return (
    <div className="flex items-center justify-between">
      <Link href={prevHref} aria-label="Mês anterior" className={cn(arrow, "-ml-3")}>
        <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={1.8} />
      </Link>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[22px] font-medium tracking-[-0.02em]">{label}</span>
        {caption ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
      </div>
      {nextHref ? (
        <Link href={nextHref} aria-label="Próximo mês" className={cn(arrow, "-mr-3")}>
          <ChevronRight aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </Link>
      ) : (
        <span className="-mr-3 size-11" />
      )}
    </div>
  );
}

export function StatTile({ label, cents, tone, hint }: { label: string; cents: number; tone?: "in" | "out"; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {tone ? <span aria-hidden="true" className="size-2 rounded-full" style={{ background: tone === "in" ? "var(--series-income)" : "var(--series-expense)" }} /> : null}
        {label}
      </p>
      <p className="tabular text-[clamp(0.95rem,4.2vw,1.25rem)] font-medium"><Money cents={cents} /></p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Section heading above a list or card: "Movimentações ... Ver todas". */
export function SectionHeader({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between px-1">
      <h2 className="flex items-center gap-1.5 text-base font-semibold">{title}</h2>
      {action}
    </div>
  );
}

export function StateBadge({ state }: { state: "overdue" | "confirmed" | "predicted" | "candidate" | "active" | "paused" | "cancelled" | "rejected" }) {
  const map = {
    overdue: ["Vencida", "bg-danger-bg text-danger"],
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
