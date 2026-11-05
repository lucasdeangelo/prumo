import Link from "next/link";

import { Amount, PageHeader, SectionHeader } from "@/components/app/bits";
import { Avatar, InstitutionMark, SegmentBar, UpdatedAt } from "@/components/app/couple";
import { Card, EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { householdCards, loadInvoice } from "@/lib/application/cards";
import { lastSyncAt } from "@/lib/application/couple-data";
import { formatDayLabel, formatDayShort, formatMonthLong, todayIn } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { transactionLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cartões · Prumo" };

const monthOnly = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ card?: string; m?: string }> }) {
  const { card: cardParam, m } = await searchParams;
  const { user } = await requireUser();
  const { household, cards } = await householdCards(user.id);
  const partner = household?.partner ?? null;
  const syncedAt = await lastSyncAt([user.id, partner?.userId].filter(Boolean) as string[]);

  if (cards.length === 0) {
    return (
      <div className="grid gap-4">
        <PageHeader title="Cartões" />
        <EmptyState title="Nenhum cartão conectado">
          <Link href="/connect">Conecte seus bancos</Link> para ver faturas, parcelas e dividir compras.
        </EmptyState>
      </div>
    );
  }

  const offset = Math.max(-6, Math.min(1, Number(m ?? 0) || 0));
  const current = await Promise.all(cards.map((c) => loadInvoice(user.id, household, c, 0)));
  const selectedCard = cards.find((c) => c.id === cardParam) ?? cards[0];
  const selected = offset === 0 ? current.find((i) => i.card.id === selectedCard.id)! : await loadInvoice(user.id, household, selectedCard, offset);
  const previous = await Promise.all([-1, -2].map((o) => loadInvoice(user.id, household, selectedCard, o + offset)));

  const openTotal = current.reduce((s, i) => s + Math.max(0, i.settlement.totalCents), 0);
  const limit = cards.reduce((s, c) => s + (c.credit_limit_cents ?? 0), 0);
  const available = cards.reduce((s, c) => s + (c.available_limit_cents ?? 0), 0);
  const ownerOf = (c: (typeof cards)[number]) => (c.user_id === user.id ? household?.me : partner) ?? null;
  const card = selected.card;
  const usedRatio = card.credit_limit_cents ? Math.max(0, (card.credit_limit_cents - (card.available_limit_cents ?? card.credit_limit_cents)) / card.credit_limit_cents) : null;
  const isOpen = selected.period.end >= todayIn();
  const visibleLines = [...selected.lines].sort((a, b) => b.fact.transaction_date.localeCompare(a.fact.transaction_date));
  const monthlyInstallments = selected.installmentsAhead[0] ?? 0;
  const lastInstallmentMonth = selected.installmentsAhead.length ? selected.period.month : null;
  const tabs = [-1, 0, 1].map((o) => o + offset);

  return (
    <div className="grid gap-4">
      <PageHeader title="Cartões" subtitle={partner ? "Nosso · cartões compartilhados" : undefined} />
      <UpdatedAt at={syncedAt} />

      <div className="grid grid-cols-2 gap-3">
        <Card className="grid gap-1 p-4">
          <span className="text-[13px] text-muted-foreground">Faturas abertas</span>
          <span className="tabular text-lg font-medium">{formatBRL(openTotal)}</span>
        </Card>
        <Card className="grid gap-1 p-4">
          <span className="text-[13px] text-muted-foreground">Limite disponível</span>
          <span className="tabular text-lg font-medium">{limit ? formatBRL(available) : "—"}</span>
          {limit ? <span className="text-xs text-muted-foreground">de {formatBRL(limit)}</span> : null}
        </Card>
      </div>

      <ul className="grid gap-2">
        {current.map((inv) => {
          const owner = ownerOf(inv.card);
          const active = inv.card.id === selectedCard.id;
          return (
            <li key={inv.card.id}>
              <Link href={`/cards?card=${inv.card.id}`} className={cn("flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-foreground no-underline hover:text-foreground", active ? "border-foreground" : "border-border")}>
                <InstitutionMark name={inv.card.institution ?? inv.card.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[15px] font-medium">
                    {inv.card.institution ?? inv.card.name}
                    {owner && partner ? <Avatar person={owner} size={20} /> : null}
                  </span>
                  <span className="block text-[13px] text-muted-foreground">
                    Fatura aberta{inv.card.partner_card_last4 && partner ? ` · adicional de ${inv.card.user_id === user.id ? partner.name : household!.me.name}` : ""} · {inv.card.card_last4 ? `•• ${inv.card.card_last4} · ` : ""}vence {formatDayShort(inv.period.due)}
                  </span>
                </span>
                <Amount cents={Math.max(0, inv.settlement.totalCents)} className="text-[15px]" />
              </Link>
            </li>
          );
        })}
      </ul>

      <nav aria-label="Mês da fatura" className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
        {tabs.map((o) => {
          const label = cap(monthOnly.format(new Date(`${(o === offset ? selected.period.month : addMonthKey(selected.period.month, o - offset))}-01T00:00:00Z`)));
          return (
            <Link key={o} href={`/cards?card=${selectedCard.id}&m=${o}`} aria-current={o === offset ? "page" : undefined} className={cn("flex min-h-10 items-center justify-center rounded-full text-sm font-medium no-underline", o === offset ? "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(18,21,18,0.1)]" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </Link>
          );
        })}
      </nav>

      <Card className="grid gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-medium">Fatura de {monthOnly.format(new Date(`${selected.period.month}-01T00:00:00Z`))}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", isOpen ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground")}>{isOpen ? "Aberta" : "Fechada"}</span>
        </div>
        <span className="tabular text-[32px] font-medium tracking-[-0.03em]">{formatBRL(Math.max(0, selected.settlement.totalCents))}</span>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span><span className="block text-[13px] text-muted-foreground">Fecha em</span>{formatDayLabel(selected.period.end)}</span>
          <span><span className="block text-[13px] text-muted-foreground">Vence em</span>{formatDayLabel(selected.period.due)}</span>
        </div>
        {usedRatio !== null ? (
          <div className="grid gap-1.5">
            <SegmentBar segments={[{ value: usedRatio * 100, color: "var(--primary)" }]} total={100} label={`Limite usado ${Math.round(usedRatio * 100)}%`} />
            <div className="flex justify-between text-[13px] text-muted-foreground"><span>Limite usado {Math.round(usedRatio * 100)}%</span><span>Disponível {formatBRL(card.available_limit_cents ?? 0)}</span></div>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <span className="flex min-h-11 items-center justify-center text-center text-[13px] text-muted-foreground">O pagamento é feito no app do banco</span>
          {partner ? (
            <Link href={`/cards/${card.id}/split?m=${offset}`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">Dividir fatura</Link>
          ) : (
            <Link href="/couple" className="inline-flex min-h-11 items-center justify-center rounded-full border border-foreground text-sm font-medium text-foreground hover:text-foreground">Convidar par</Link>
          )}
        </div>
      </Card>

      <section className="grid gap-2">
        <SectionHeader title="Lançamentos da fatura" action={<span className="text-[13px] text-muted-foreground">{visibleLines.length} itens</span>} />
        {visibleLines.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {visibleLines.slice(0, 8).map(({ fact, display, category }) => (
              <li key={fact.id}>
                <Link href={`/transactions/${fact.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 text-foreground no-underline hover:text-foreground">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{display === "reserved" ? "Compra reservada" : display === "category_only" ? category : transactionLabel(fact)}</span>
                    <span className="block text-[13px] text-muted-foreground">{category} · {formatDayShort(fact.transaction_date)}</span>
                  </span>
                  {fact.installment_number && fact.installment_total ? <span className="text-[12px] text-muted-foreground">{fact.installment_number}/{fact.installment_total}</span> : null}
                  <Amount cents={fact.amount_cents} type={fact.type === "credit" ? "in" : undefined} className="text-[15px]" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nenhuma compra nesta fatura" />
        )}
        {visibleLines.length > 8 ? <Link href={partner ? `/cards/${card.id}/split?m=${offset}` : `/monthly`} className="px-1 text-sm font-medium">Ver todos os {visibleLines.length} lançamentos</Link> : null}
        {monthlyInstallments > 0 && lastInstallmentMonth ? (
          <p className="px-1 text-[13px] text-muted-foreground">Já comprometido em parcelas: {formatBRL(monthlyInstallments)} por mês até {monthYear.format(new Date(`${addMonthKey(lastInstallmentMonth, selected.installmentsAhead.length)}-01T00:00:00Z`))}.</p>
        ) : null}
      </section>

      <section className="grid gap-2">
        <SectionHeader title="Faturas anteriores" />
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {previous.map((inv) => (
            <li key={inv.period.month}>
              <Link href={`/cards?card=${selectedCard.id}&m=${offset + (previous.indexOf(inv) === 0 ? -1 : -2)}`} className="flex min-h-14 items-center gap-3 px-4 py-3 text-foreground no-underline hover:text-foreground">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{cap(formatMonthLong(inv.period.month).split(" ")[0])}</span>
                  <span className="block text-[13px] text-muted-foreground">Venceu em {formatDayShort(inv.period.due)}{inv.settled ? " · acertada entre vocês" : ""}</span>
                </span>
                <Amount cents={Math.max(0, inv.settlement.totalCents)} className="text-[15px]" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function addMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
