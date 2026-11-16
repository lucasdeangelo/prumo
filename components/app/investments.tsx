// Investment pieces from the design ("InvMeu", "InvNosso", "InvCDB", "InvAcao").
import Link from "next/link";

import { Money } from "@/components/app/money";
import { assetBadge, assetClass, gain, type AssetClass } from "@/lib/domain/investments";
import { formatBRL } from "@/lib/domain/money";
import type { InvestmentRow } from "@/lib/application/investments";
import { cn } from "@/lib/utils";

/**
 * One color per asset class, fixed (never by rank). Checked with the dataviz validator: every pair
 * is apart for color-blind readers; the brand green is darker than the band and the gold has low
 * contrast, so every segment also carries its name, value and share in the list next to it.
 */
export const CLASS_COLOR: Record<AssetClass, string> = {
  fixed: "#1D4D3F",
  equity: "#3A5BA0",
  real_estate: "#B4582A",
  crypto: "#D4A72C",
  funds: "#9B6BC0",
  pension: "#8C908A",
  other: "#C9CCC6",
};

const TILE: Record<AssetClass, string> = {
  fixed: "bg-[#E3EDE8] text-[#123329]",
  equity: "bg-[#E6ECF6] text-[#2B4579]",
  real_estate: "bg-[#F6E8DE] text-[#8A4320]",
  crypto: "bg-[#F5EDD8] text-[#5E4200]",
  funds: "bg-[#EFE8F6] text-[#5A3D7A]",
  pension: "bg-muted text-muted-foreground",
  other: "bg-muted text-muted-foreground",
};

export function AssetTile({ type, subtype, size = "md" }: { type: string; subtype: string | null; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center font-mono font-medium tracking-[0.02em]",
        size === "lg" ? "size-12 rounded-xl text-[11px]" : "size-10 rounded-[10px] text-[10px]",
        TILE[assetClass(type, subtype)],
      )}
    >
      {assetBadge(type, subtype)}
    </span>
  );
}

function percent(ratio: number): string {
  return `${ratio >= 0 ? "+" : "−"}${Math.abs(ratio * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function signed(cents: number): string {
  return `${cents >= 0 ? "+" : "−"}${formatBRL(Math.abs(cents))}`;
}

/** "▲ +R$ 400,00 · +6,90%": the arrow and sign carry the meaning, color only repeats it. */
export function GainPill({ cents, ratio, tone = "light" }: { cents: number; ratio: number | null; tone?: "light" | "onPrimary" }) {
  const up = cents >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium tabular",
        tone === "onPrimary" ? "bg-white/15 text-white" : up ? "bg-[#E4F0E9] text-[#1F5A3D]" : "bg-[#F7E4E1] text-[#8F2C22]",
      )}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <MoneyText text={`${signed(cents)}${ratio !== null ? ` · ${percent(ratio)}` : ""}`} />
    </span>
  );
}

/** Signed gain in text color: green up, red down (InvAcao), the sign always present. */
export function GainText({ cents, ratio, className }: { cents: number; ratio?: number | null; className?: string }) {
  return (
    <span className={cn("tabular", cents >= 0 ? "text-[#2B7350]" : "text-[#A8352A]", className)}>
      <MoneyText text={`${signed(cents)}${ratio != null ? ` · ${percent(ratio)}` : ""}`} />
    </span>
  );
}

/** Text with one amount inside; "Esconder valores" masks the whole thing. */
function MoneyText({ text }: { text: string }) {
  return (
    <span className="money">
      <span className="money-value">{text}</span>
      <span className="money-mask"><span aria-hidden="true">R$ ••••</span><span className="sr-only">valor oculto</span></span>
    </span>
  );
}

const dateBR = (iso: string) => iso.split("-").reverse().join("/");

function rateText(row: Pick<InvestmentRow, "rate" | "rate_type" | "fixed_annual_rate">): string | null {
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (row.rate_type && row.rate !== null) {
    if (row.rate_type === "IPCA" || row.rate_type === "IGPM") return `${row.rate_type} + ${fmt(row.fixed_annual_rate ?? row.rate)}%`;
    return `${fmt(row.rate)}% do ${row.rate_type}`;
  }
  if (row.fixed_annual_rate !== null) return `Prefixado ${fmt(row.fixed_annual_rate)}% a.a.`;
  return null;
}

/** Second line of an asset: what it is in plain words (rate, maturity, quantity). */
export function describeAsset(row: Pick<InvestmentRow, "type" | "subtype" | "quantity" | "rate" | "rate_type" | "fixed_annual_rate" | "due_date" | "status" | "institution" | "issuer">): string {
  if (row.status === "withdrawn") return "Resgatado";
  const cls = assetClass(row.type, row.subtype);
  const qty = row.quantity !== null ? row.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 }) : null;
  if (cls === "fixed") {
    const parts = [
      row.subtype === "TREASURY" ? "Tesouro Direto" : null,
      row.subtype === "LCI" || row.subtype === "LCA" ? "Isenta de IR" : null,
      rateText(row),
      row.due_date ? `vence ${dateBR(row.due_date)}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Renda fixa";
  }
  if (cls === "real_estate") return `Fundo imobiliário${qty ? ` · ${qty} cotas` : ""}`;
  if (row.subtype === "STOCK") return `Ações${qty ? ` · ${qty} ações` : ""}`;
  if (row.type === "ETF") return `ETF${qty ? ` · ${qty} cotas` : ""}`;
  if (cls === "equity") return `Renda variável${qty ? ` · ${qty}` : ""}`;
  if (cls === "funds") return "Fundo de investimento";
  if (cls === "pension") return "Previdência";
  return row.institution ?? row.issuer ?? "Investimento";
}

/** One line of the investment list: tile, name, what it is, value and gain. */
export function AssetRow({ row, footnote }: { row: InvestmentRow; footnote?: React.ReactNode }) {
  const g = gain(row.amount_cents, row.invested_cents);
  return (
    <li>
      <Link href={`/investments/${row.id}`} className="flex items-start gap-3 px-4 py-3.5 text-foreground no-underline hover:bg-[#F8F9F6] hover:text-foreground">
        <AssetTile type={row.type} subtype={row.subtype} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium">{row.name}</span>
          <span className="text-xs text-muted-foreground">{describeAsset(row)}</span>
          {footnote}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="tabular text-[13px] font-medium"><Money cents={row.amount_cents} /></span>
          {g && row.status !== "withdrawn" ? <GainText cents={g.cents} ratio={g.ratio} className="text-xs" /> : null}
        </span>
      </Link>
    </li>
  );
}

/** "Onde está": one bar split by class with 2px gaps, then each class named with value and share. */
export function ClassBreakdown({ classes, title = "Onde está", note }: { classes: Array<{ cls: AssetClass; label: string; cents: number; ratio: number }>; title?: string; note?: string }) {
  const label = classes.map((c) => `${c.label} ${Math.round(c.ratio * 100)}%`).join(", ");
  return (
    <section className="grid gap-3.5 rounded-2xl border border-border bg-card p-[18px]">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      </div>
      <div role="img" aria-label={label} className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-border">
        {classes.filter((c) => c.cents > 0).map((c) => <span key={c.cls} style={{ width: `${c.ratio * 100}%`, background: CLASS_COLOR[c.cls] }} />)}
      </div>
      <ul className="grid gap-2 text-[13px]">
        {classes.map((c) => (
          <li key={c.cls} className="flex items-center gap-3">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: CLASS_COLOR[c.cls] }} />
            <span className="flex-1">{c.label}</span>
            <span className="tabular font-medium"><Money cents={c.cents} /></span>
            <span className="tabular w-9 text-right text-xs text-muted-foreground">{Math.round(c.ratio * 100)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Big amount with the cents dimmed ("R$ 19.425,20"). */
export function HeroAmount({ cents, dim = "text-muted-foreground" }: { cents: number; dim?: string }) {
  const [whole, frac] = formatBRL(cents).split(",");
  return (
    <span className="money tabular text-[40px] font-medium leading-[1.05] tracking-[-0.03em]">
      <span className="money-value">{whole}<span className={dim}>,{frac}</span></span>
      <span className="money-mask"><span aria-hidden="true">R$ ••••</span><span className="sr-only">valor oculto</span></span>
    </span>
  );
}

/** Period choice for the evolution chart, as links so the server draws the right range. */
export function PeriodTabs({ value, hrefFor, options }: { value: string; hrefFor: (v: string) => string; options: Array<[string, string]> }) {
  return (
    <nav aria-label="Período" className="grid w-[150px] grid-cols-3 gap-1 rounded-full bg-muted p-1">
      {options.map(([v, label]) => (
        <Link
          key={v}
          href={hrefFor(v)}
          scroll={false}
          aria-current={v === value ? "page" : undefined}
          className={cn(
            "flex min-h-[34px] items-center justify-center rounded-full text-[13px] no-underline",
            v === value ? "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(18,21,18,0.1)] hover:text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
