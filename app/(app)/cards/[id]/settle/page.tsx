import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { settleInvoiceAction } from "@/app/(app)/cards/actions";
import { PageHeader } from "@/components/app/bits";
import { CopyButton } from "@/components/app/copy-button";
import { Avatar, SpaceChip } from "@/components/app/couple";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { householdCards, loadInvoice } from "@/lib/application/cards";
import { sharePercentLabel } from "@/lib/domain/couple";
import { formatDayLabel } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { buildPixPayload, maskPixKey } from "@/lib/domain/pix";

export const metadata = { title: "Acerto da fatura · Prumo" };

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

export default async function SettlePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const { id } = await params;
  const { m } = await searchParams;
  const { user } = await requireUser();
  const { household, cards } = await householdCards(user.id);
  if (!household?.partner) redirect("/couple");
  const card = cards.find((c) => c.id === id);
  if (!card) notFound();
  const offset = Number(m ?? 0) || 0;
  const invoice = await loadInvoice(user.id, household, card, offset);
  const holder = card.user_id === user.id ? household.me : household.partner;
  const other = card.user_id === user.id ? household.partner : household.me;
  const amount = invoice.settlement.partnerOwesCents;
  const month = monthName.format(new Date(`${invoice.period.month}-01T00:00:00Z`));
  const shares = [...new Set(invoice.lines.filter((l) => l.owner === "ours").map((l) => sharePercentLabel(l.holderShare)))];
  const pix = holder.pixKey && amount > 0
    ? buildPixPayload({ key: holder.pixKey, amountCents: amount, name: holder.name, description: `Prumo fatura ${month.slice(0, 3)}`, txid: `PRUMO${invoice.period.month.replace("-", "")}` })
    : null;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <PageHeader title="" back={`/cards/${card.id}/split?m=${offset}`} />
        <SpaceChip space="nosso" caption={`Nosso · ${household.me.name} e ${household.partner.name} veem`} me={household.me.color} />
      </div>
      <h1 className="text-2xl font-medium tracking-[-0.02em]">Acerto da fatura de {month}</h1>

      <Card className="grid justify-items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Para fechar a fatura, {other.name} transfere para {holder.name}</p>
        <div className="flex items-center gap-2">
          <Avatar person={other} size={36} />
          <span aria-hidden="true" className="text-muted-foreground">→</span>
          <Avatar person={holder} size={36} />
        </div>
        <p className="tabular text-[36px] font-medium tracking-[-0.03em]">{formatBRL(amount)}</p>
        <p className="text-sm text-muted-foreground">Até {formatDayLabel(invoice.period.due)} — dia do vencimento</p>
      </Card>

      <Card className="grid gap-2 text-sm">
        <div className="flex justify-between"><span>{holder.name} paga a fatura inteira</span><span className="tabular">{formatBRL(Math.max(0, invoice.settlement.totalCents))}</span></div>
        <div className="flex justify-between"><span>Parte de {other.name} no que é Nosso{shares.length === 1 ? ` (${shares[0]})` : ""}</span><span className="tabular">{formatBRL(invoice.settlement.partnerShareOfOursCents)}</span></div>
        <div className="flex justify-between"><span>Compras de {other.name}{card.partner_card_last4 ? " no adicional" : ""}</span><span className="tabular">{formatBRL(invoice.holderTotals.partner)}</span></div>
        <div className="flex justify-between border-t border-border pt-2 font-medium"><span>{other.name} transfere</span><span className="tabular">{formatBRL(amount)}</span></div>
      </Card>

      {amount > 0 ? (
        pix ? (
          <Card className="grid gap-2">
            <p className="text-[15px] font-medium">Pix para {holder.name}</p>
            <p className="text-[13px] text-muted-foreground">Chave: {maskPixKey(holder.pixKey!)}</p>
            <p className="label-mono">Pix copia e cola</p>
            <p className="break-all rounded-[10px] bg-muted p-3 font-mono text-[12px]">{pix}</p>
            <p className="text-[13px] text-muted-foreground">Descrição: Prumo · fatura {month.slice(0, 3)}</p>
            <CopyButton text={pix} label={card.user_id === user.id ? `Copiar e enviar para ${other.name}` : "Copiar Pix"} share={card.user_id === user.id} />
          </Card>
        ) : (
          <Card className="grid gap-2 text-sm">
            <p>{holder.name} ainda não cadastrou a chave Pix.</p>
            {holder === household.me ? <Link href="/couple" className="font-medium">Cadastrar minha chave Pix</Link> : <p className="text-muted-foreground">Peça para {holder.name} cadastrar em Ajustes › Perfil do casal.</p>}
          </Card>
        )
      ) : null}
      <p className="text-center text-[13px] text-muted-foreground">O Prumo não movimenta dinheiro: o Pix é pago no app do banco.</p>

      {invoice.settled ? (
        <p role="status" className="rounded-[10px] bg-secondary px-3 py-2.5 text-center text-sm text-secondary-foreground">Acertado em {formatDayLabel(invoice.settled.settled_at.slice(0, 10))}.</p>
      ) : amount > 0 ? (
        <form action={settleInvoiceAction}>
          <input type="hidden" name="cardId" value={card.id} />
          <input type="hidden" name="month" value={invoice.period.month} />
          <input type="hidden" name="amount" value={amount} />
          <input type="hidden" name="returnTo" value={`/cards/${card.id}/split?m=${offset}`} />
          <SubmitButton variant="outline" className="w-full">Já está acertado</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
