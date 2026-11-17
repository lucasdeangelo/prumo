import { notFound } from "next/navigation";

import { Amount, PageHeader } from "@/components/app/bits";
import { CardItemForm } from "@/components/app/card-item-form";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { loadPendingItem } from "@/lib/application/card-edits";
import { getHousehold } from "@/lib/application/household";
import { formatDayLabel } from "@/lib/domain/dates";
import { listTags } from "@/lib/repositories/reads";

export const metadata = { title: "Compra no cartão · Prumo" };

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

/** A purchase the bank still shows as pending: the person tags it, names it and says whose it is. */
export default async function CardItemPage({ params, searchParams }: { params: Promise<{ id: string; pid: string }>; searchParams: Promise<{ m?: string }> }) {
  const { id, pid } = await params;
  const { m } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[\w-]{1,100}$/.test(pid)) notFound();
  const { user, db } = await requireUser();
  const [item, tags, household] = await Promise.all([loadPendingItem(user.id, id, pid), listTags(db, user.id), getHousehold(user.id)]);
  if (!item) notFound();
  const back = `/cards?card=${id}${m ? `&m=${encodeURIComponent(m)}` : ""}`;

  return (
    <div className="grid gap-4">
      <PageHeader title="Compra no cartão" back={back} />
      <Card className="text-center">
        <Amount cents={item.amount_cents} type={item.type === "credit" ? "in" : undefined} className="text-3xl" />
        <p className="mt-2 font-medium">{item.user_description ?? item.description}</p>
        <p className="text-sm text-muted-foreground">
          {formatDayLabel(item.transaction_date)}
          {item.installment_number && item.installment_total ? ` · parcela ${item.installment_number}/${item.installment_total}` : ""}
          {item.card_last4 ? ` · •• ${item.card_last4}` : ""}
        </p>
        {item.user_description ? <p className="mt-1 text-xs text-muted-foreground">No extrato: {item.description}</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">
          Ainda não confirmada pelo banco · fatura de {monthName.format(new Date(`${item.bill_month}-01T00:00:00Z`))}. Valor e data vêm do banco.
        </p>
      </Card>
      <Card>
        <CardItemForm
          item={{ accountId: id, providerId: pid, tagId: item.tag_id, description: item.user_description ?? "", scope: item.scope }}
          tags={tags.map((t) => ({ id: t.id, name: t.name }))}
          partnerName={household?.partner?.name ?? null}
          returnTo={back}
        />
      </Card>
      <p className="px-1 text-center text-[13px] text-muted-foreground">Quando o banco confirmar a compra, a tag, o nome e de quem é passam junto para o lançamento.</p>
    </div>
  );
}
