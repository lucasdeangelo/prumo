import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { cycleOwnerAction } from "@/app/(app)/cards/actions";
import { Amount, PageHeader, SectionHeader } from "@/components/app/bits";
import { Avatar, PERSON_BG, PERSON_TINT, SegmentBar, SpaceChip, UpdatedAt } from "@/components/app/couple";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/app/money";
import { requireUser } from "@/lib/auth/session";
import { householdCards, loadInvoice, type InvoiceLine, type InvoiceOwner } from "@/lib/application/cards";
import { lastSyncAt } from "@/lib/application/couple-data";
import { sharePercentLabel } from "@/lib/domain/couple";
import { daysBetween, formatDayLabel, formatDayShort, todayIn } from "@/lib/domain/dates";
import { transactionLabel } from "@/lib/types";

export const metadata = { title: "Fatura compartilhada · Prumo" };

const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const NEXT: Record<InvoiceOwner, InvoiceOwner> = { ours: "holder", holder: "partner", partner: "ours" };

export default async function SplitInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const { id } = await params;
  const { m } = await searchParams;
  const { user } = await requireUser();
  const { household, cards } = await householdCards(user.id);
  if (!household?.partner) redirect("/couple");
  const card = cards.find((c) => c.id === id);
  if (!card) notFound();
  const offset = Number(m ?? 0) || 0;
  const invoice = await loadInvoice(user.id, household, card, offset);
  const partner = household.partner;
  const holder = card.user_id === user.id ? household.me : partner;
  const other = card.user_id === user.id ? partner : household.me;
  const person = (owner: InvoiceOwner) => (owner === "ours" ? null : owner === "holder" ? holder : other);
  const syncedAt = await lastSyncAt([card.user_id]);
  const returnTo = `/cards/${card.id}/split?m=${offset}`;
  const groups: Array<{ owner: InvoiceOwner; title: string; total: number; lines: InvoiceLine[] }> = [
    { owner: "ours", title: `Nosso · ${sharePercentLabel(invoice.lines.find((l) => l.owner === "ours")?.holderShare ?? (holder === household.me ? household.myShare : 1 - household.myShare))}`, total: invoice.holderTotals.ours, lines: [] },
    { owner: "holder", title: `De ${holder.name}`, total: invoice.holderTotals.holder, lines: [] },
    { owner: "partner", title: `De ${other.name}${card.partner_card_last4 ? ` · adicional •• ${card.partner_card_last4}` : ""}`, total: invoice.holderTotals.partner, lines: [] },
  ];
  for (const line of invoice.lines) groups.find((g) => g.owner === line.owner)!.lines.push(line);
  const dueIn = daysBetween(todayIn(), invoice.period.due);

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <PageHeader title="" back={`/cards?card=${card.id}&m=${offset}`} />
        <SpaceChip space="nosso" caption={`Nosso · ${household.me.name} e ${partner.name} veem`} me={household.me.color} />
      </div>
      <header className="grid gap-1">
        <h1 className="text-2xl font-medium tracking-[-0.02em]">Fatura {card.institution ?? card.name}{card.card_last4 ? ` •• ${card.card_last4}` : ""}</h1>
        <UpdatedAt at={syncedAt} />
      </header>

      <Card className="grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[15px] font-medium">{dueIn >= 0 ? `Vence em ${dueIn} ${dueIn === 1 ? "dia" : "dias"}` : "Venceu"}</span>
            <span className="block text-[13px] capitalize text-muted-foreground">{formatDayLabel(invoice.period.due)}</span>
          </span>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
            {!invoice.period.closed ? `Aberta · fecha ${invoice.period.closeEstimated ? "por volta de " : ""}${formatDayShort(invoice.period.end)}` : "Fechada"}
          </span>
        </div>
        <span className="tabular text-[32px] font-medium tracking-[-0.03em]"><Money cents={Math.max(0, invoice.settlement.totalCents)} /></span>
        {invoice.pendingLines.length > 0 ? (
          <p className="text-[13px] text-muted-foreground">{invoice.pendingLines.length} {invoice.pendingLines.length === 1 ? "lançamento ainda está" : "lançamentos ainda estão"} em processamento no banco e {invoice.pendingLines.length === 1 ? "entra" : "entram"} aqui quando for confirmado.</p>
        ) : null}
        {Math.abs(invoice.carriedCents) >= 100 ? (
          <p className="text-[13px] text-muted-foreground">Compras desta fatura. A fatura do banco é <Money cents={invoice.totalCents} /> com saldo anterior, parcelamentos e encargos.</p>
        ) : null}
        <SegmentBar
          total={Math.max(1, invoice.settlement.totalCents)}
          label="Nosso, de cada um"
          segments={[
            { value: invoice.holderTotals.ours, color: "var(--primary)" },
            { value: invoice.holderTotals.holder, color: PERSON_BG[holder.color] },
            { value: invoice.holderTotals.partner, color: PERSON_BG[other.color] },
          ]}
        />
        <div className="grid grid-cols-3 gap-2 text-[13px]">
          <span><span className="block text-muted-foreground">Nosso</span><span className="tabular font-medium"><Money cents={invoice.holderTotals.ours} /></span></span>
          <span><span className="block text-muted-foreground">De {holder.name}</span><span className="tabular font-medium"><Money cents={invoice.holderTotals.holder} /></span></span>
          <span><span className="block text-muted-foreground">De {other.name}</span><span className="tabular font-medium"><Money cents={invoice.holderTotals.partner} /></span></span>
        </div>
      </Card>

      {invoice.settlement.partnerOwesCents > 0 ? (
        <Link href={`/cards/${card.id}/settle?m=${offset}`} className="flex min-h-14 items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground no-underline hover:text-secondary-foreground">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px]">Para fechar a fatura</span>
            <span className="block text-[15px] font-medium">{other.name} transfere <Money cents={invoice.settlement.partnerOwesCents} /> para {holder.name}{invoice.settled ? " · acertado" : ""}</span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      ) : null}

      <div className="flex items-center justify-between px-1">
        <p className="text-[13px] text-muted-foreground">Toque no círculo para mudar de quem é</p>
        <Link href={`/cards/${card.id}/batch?m=${offset}`} className="flex min-h-11 items-center text-sm font-medium">Selecionar</Link>
      </div>

      {groups.map((group) => (
        <section key={group.owner} className="grid gap-2">
          <SectionHeader title={group.title} action={<span className="tabular text-sm font-medium"><Money cents={group.total} /></span>} />
          {group.lines.length > 0 ? (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {group.lines.map((line) => {
                const who = person(line.owner);
                const canChange = line.display !== "reserved" && (line.fact.user_id === user.id || line.owner !== "holder" || line.display === "detail");
                const remaining = line.fact.installment_number && line.fact.installment_total ? line.fact.installment_total - line.fact.installment_number : 0;
                return (
                  <li key={line.fact.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                    <Link href={`/transactions/${line.fact.id}`} className="min-w-0 flex-1 text-foreground no-underline hover:text-foreground">
                      <span className="block truncate text-[15px] font-medium">
                        {line.display === "reserved" ? `Compra reservada por ${who?.name ?? holder.name}` : line.display === "category_only" ? line.category : transactionLabel(line.fact)}
                        {line.fact.installment_number && line.fact.installment_total ? ` ${line.fact.installment_number}/${line.fact.installment_total}` : ""}
                      </span>
                      <span className="block text-[13px] text-muted-foreground">
                        {remaining > 0 ? <><Money cents={line.fact.amount_cents} /> por mês · faltam {remaining} (<Money cents={line.fact.amount_cents * remaining} />)</> : `${formatDayShort(line.fact.transaction_date)} · ${line.fact.free_money ? "Dinheiro livre" : line.category}`}
                        {line.display === "category_only" && line.fact.user_id === user.id ? ` · ${other.name} vê só categoria` : ""}
                      </span>
                    </Link>
                    <Amount cents={line.fact.amount_cents} type={line.fact.type === "credit" ? "in" : undefined} className="text-[15px]" />
                    {canChange ? (
                      <form action={cycleOwnerAction}>
                        <input type="hidden" name="id" value={line.fact.id} />
                        <input type="hidden" name="next" value={NEXT[line.owner]} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button
                          type="submit"
                          aria-label={`De quem é: ${who ? who.name : "Nosso"}. Tocar muda para ${NEXT[line.owner] === "ours" ? "Nosso" : NEXT[line.owner] === "holder" ? holder.name : other.name}`}
                          className="flex size-11 items-center justify-center"
                        >
                          <span
                            className="flex size-7 items-center justify-center rounded-full text-[11px] font-semibold"
                            style={who ? { background: PERSON_TINT[who.color], color: PERSON_BG[who.color] } : { background: "var(--secondary)", color: "var(--primary)" }}
                          >
                            {who ? who.initial : "N"}
                          </span>
                        </button>
                      </form>
                    ) : who ? (
                      <span className="flex size-11 items-center justify-center"><Avatar person={who} size={28} /></span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-1 text-[13px] text-muted-foreground">Nada aqui.</p>
          )}
        </section>
      ))}

      {invoice.installmentsAhead.length > 0 ? (
        <Card className="grid gap-3">
          <div className="flex items-center justify-between"><span className="text-[15px] font-medium">Parcelas nos próximos meses</span><span className="text-[13px] text-muted-foreground">{invoice.lines.filter((l) => l.fact.installment_number && l.fact.installment_total && l.fact.installment_number < l.fact.installment_total).length} compra(s)</span></div>
          <div className="grid grid-cols-4 gap-2">
            {invoice.installmentsAhead.slice(0, 3).map((cents, i) => (
              <div key={i} className="rounded-[10px] bg-muted p-2 text-center">
                <span className="block text-[12px] text-muted-foreground">{monthShort.format(new Date(`${shift(invoice.period.month, i + 1)}-01T00:00:00Z`)).replace(".", "")}</span>
                <span className="tabular text-[13px] font-medium"><Money cents={cents} /></span>
              </div>
            ))}
            {invoice.installmentsAhead.length > 3 ? (
              <div className="rounded-[10px] bg-muted p-2 text-center">
                <span className="block text-[12px] text-muted-foreground">+{invoice.installmentsAhead.length - 3}</span>
                <span className="text-[13px] font-medium">até {monthShort.format(new Date(`${shift(invoice.period.month, invoice.installmentsAhead.length)}-01T00:00:00Z`)).replace(".", "")}</span>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Link href="/couple" className="px-1 text-sm font-medium">Regras de rateio por categoria</Link>
    </div>
  );
}

function shift(month: string, delta: number): string {
  const [y, mo] = month.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + delta, 1)).toISOString().slice(0, 7);
}
