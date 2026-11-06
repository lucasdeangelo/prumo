import Link from "next/link";

import { Amount, PageHeader, SectionHeader } from "@/components/app/bits";
import { Avatar, InstitutionMark, SegmentBar, UpdatedAt } from "@/components/app/couple";
import { Card, EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { householdCards, loadInvoice } from "@/lib/application/cards";
import { lastSyncAt } from "@/lib/application/couple-data";
import { formatDayLabel, formatDayShort, formatMonthLong } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { transactionLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cartões · Prumo" };

const monthOnly = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ card?: string; m?: string; all?: string }> }) {
  const { card: cardParam, m, all } = await searchParams;
  const { user } = await requireUser();
  const { household, cards } = await householdCards(user.id);
  const partner = household?.partner ?? null;
  const syncedAtIn = lastSyncAt([user.id, partner?.userId].filter(Boolean) as string[]);
  syncedAtIn.catch(() => {});

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

  const selectedCard = cards.find((c) => c.id === cardParam) ?? cards[0];
  const asked = Math.max(-12, Number(m ?? 0) || 0);
  // Past and open invoices need no limit from the bank's schedule, so they all load at once.
  const early = asked <= 0;
  const load = (offset: number) => loadInvoice(user.id, household, selectedCard, offset);
  const [current, syncedAt, earlySelected, earlyPrevious] = await Promise.all([
    Promise.all(cards.map((c) => loadInvoice(user.id, household, c, 0))),
    syncedAtIn,
    early && asked !== 0 ? load(asked) : Promise.resolve(null),
    early ? Promise.all([-1, -2].map((o) => load(o + asked))) : Promise.resolve(null),
  ]);
  const openInvoice = current.find((i) => i.card.id === selectedCard.id)!;
  // Future invoices exist as far as the bank has scheduled installments.
  const futureCount = Math.max(1, openInvoice.installmentsAhead.length);
  const offset = Math.min(futureCount, asked);
  const [selected, previous] = early
    ? [earlySelected ?? openInvoice, earlyPrevious!]
    : await Promise.all([offset === 0 ? openInvoice : load(offset), Promise.all([-1, -2].map((o) => load(o + offset)))]);

  // Closed invoices show the bank's total; the open one is what came in so far plus the unpaid rest.
  const amountOf = (inv: (typeof current)[number]) => Math.max(0, inv.totalCents);
  const openTotal = current.reduce((s, i) => s + amountOf(i), 0);
  const limit = cards.reduce((s, c) => s + (c.credit_limit_cents ?? 0), 0);
  const available = cards.reduce((s, c) => s + (c.available_limit_cents ?? 0), 0);
  const ownerOf = (c: (typeof cards)[number]) => (c.user_id === user.id ? household?.me : partner) ?? null;
  const card = selected.card;
  const usedRatio = card.credit_limit_cents ? Math.max(0, (card.credit_limit_cents - (card.available_limit_cents ?? card.credit_limit_cents)) / card.credit_limit_cents) : null;
  const status = selected.period.status;
  type Row =
    | { kind: "fact"; date: string; line: (typeof selected.lines)[number] }
    | { kind: "pending"; date: string; pending: (typeof selected.pendingLines)[number] };
  const rows: Row[] = [
    ...selected.lines.map((line) => ({ kind: "fact" as const, date: line.fact.transaction_date, line })),
    ...selected.pendingLines.map((pending) => ({ kind: "pending" as const, date: pending.item.transaction_date, pending })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const showAll = all === "1";
  const shownRows = showAll ? rows : rows.slice(0, 12);
  const purchasesCents = selected.totalCents - selected.carriedCents;
  const upcoming =
    offset === 0
      ? openInvoice.installmentsAhead.map((cents, i) => ({ offset: i + 1, month: addMonthKey(openInvoice.period.month, i + 1), cents })).filter((u) => u.cents > 0)
      : [];
  const tabs = [-1, 0, 1].map((o) => o + offset).filter((o) => o <= futureCount);

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
                <Amount cents={amountOf(inv)} className="text-[15px]" />
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
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", status === "open" ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground")}>{status === "open" ? "Aberta" : status === "future" ? "Próxima" : "Fechada"}</span>
        </div>
        <span className="tabular text-[32px] font-medium tracking-[-0.03em]">{formatBRL(amountOf(selected))}</span>
        {Math.abs(selected.carriedCents) >= 100 || selected.paymentsCents > 0 ? (
          <dl className="grid gap-1 text-[13px]">
            {Math.abs(selected.carriedCents) >= 100 ? (
              <>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Compras, parcelas e encargos</dt><dd className="tabular">{formatBRL(purchasesCents)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{status === "open" ? "Não pago da fatura anterior" : "Saldo anterior e ajustes do banco"}</dt><dd className="tabular">{formatBRL(selected.carriedCents)}</dd></div>
              </>
            ) : null}
            {selected.paymentsCents > 0 ? (
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Pagamentos lançados nesta fatura</dt><dd className="tabular">{formatBRL(selected.paymentsCents)}</dd></div>
            ) : null}
          </dl>
        ) : null}
        {status === "open" ? <p className="text-[13px] text-muted-foreground">Fatura em aberto: o total muda até o fechamento.</p> : null}
        {status === "future" ? <p className="text-[13px] text-muted-foreground">Parcelas já agendadas pelo banco. Compras novas entram aqui depois.</p> : null}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span><span className="block text-[13px] text-muted-foreground">{status !== "closed" ? (selected.period.closeEstimated ? "Fecha por volta de" : "Fecha em") : "Fechou"}</span>{selected.period.closeEstimated && status === "closed" ? "—" : formatDayLabel(selected.period.end)}</span>
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
        <SectionHeader title="Lançamentos da fatura" action={<span className="text-[13px] text-muted-foreground">{rows.length} itens</span>} />
        {rows.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {shownRows.map((row) => (row.kind === "pending" ? <PendingRow key={`p-${row.pending.item.id}`} pending={row.pending} future={status === "future"} /> : <FactRow key={row.line.fact.id} line={row.line} />))}
            {selected.cancelledLines.map((item) => (
              <li key={`c-${item.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 text-muted-foreground">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] line-through">{item.description}</span>
                  <span className="block text-[13px]">Compra estornada · o banco ainda lista esta parcela, mas ela não entra no total</span>
                </span>
                <span className="tabular text-[15px] line-through">{formatBRL(item.amount_cents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nenhuma compra nesta fatura" />
        )}
        {!showAll && rows.length > shownRows.length ? (
          <Link href={`/cards?card=${selectedCard.id}&m=${offset}&all=1`} className="px-1 text-sm font-medium">Ver todos os {rows.length} lançamentos</Link>
        ) : null}
        {selected.pendingLines.length > 0 && status === "open" ? (
          <p className="px-1 text-[13px] text-muted-foreground">Itens em processamento entram na divisão do casal quando o banco confirmar.</p>
        ) : null}
      </section>

      {upcoming.length > 0 ? (
        <section className="grid gap-2">
          <SectionHeader title="Próximas faturas" action={<span className="text-[13px] text-muted-foreground">parcelas agendadas</span>} />
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {upcoming.map((u) => (
              <li key={u.month}>
                <Link href={`/cards?card=${selectedCard.id}&m=${u.offset}`} className="flex min-h-14 items-center gap-3 px-4 py-3 text-foreground no-underline hover:text-foreground">
                  <span className="min-w-0 flex-1 text-[15px] font-medium">{cap(monthYear.format(new Date(`${u.month}-01T00:00:00Z`)))}</span>
                  <Amount cents={u.cents} className="text-[15px]" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
                <Amount cents={amountOf(inv)} className="text-[15px]" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

type Invoice = Awaited<ReturnType<typeof loadInvoice>>;

function FactRow({ line }: { line: Invoice["lines"][number] }) {
  const { fact, display, category } = line;
  return (
    <li>
      <Link href={`/transactions/${fact.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 text-foreground no-underline hover:text-foreground">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{display === "reserved" ? "Compra reservada" : display === "category_only" ? category : transactionLabel(fact)}</span>
          <span className="block text-[13px] text-muted-foreground">{category} · {formatDayShort(fact.transaction_date)}</span>
        </span>
        {fact.installment_number && fact.installment_total ? <span className="text-[12px] text-muted-foreground">{fact.installment_number}/{fact.installment_total}</span> : null}
        <Amount cents={fact.amount_cents} type={fact.type === "credit" ? "in" : undefined} className="text-[15px]" />
      </Link>
    </li>
  );
}

function PendingRow({ pending, future }: { pending: Invoice["pendingLines"][number]; future: boolean }) {
  const { item, category } = pending;
  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{item.description}</span>
        <span className="block text-[13px] text-muted-foreground">{category} · {formatDayShort(item.transaction_date)} · {future ? "agendada" : "em processamento"}</span>
      </span>
      {item.installment_number && item.installment_total ? <span className="text-[12px] text-muted-foreground">{item.installment_number}/{item.installment_total}</span> : null}
      <Amount cents={item.amount_cents} type={item.type === "credit" ? "in" : undefined} className="text-[15px]" />
    </li>
  );
}

function addMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
