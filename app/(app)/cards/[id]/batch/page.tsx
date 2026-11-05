import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/app/bits";
import { BatchForm } from "@/components/app/batch-form";
import { requireUser } from "@/lib/auth/session";
import { householdCards, loadInvoice } from "@/lib/application/cards";
import { firstShare } from "@/lib/domain/couple";
import { formatDayShort } from "@/lib/domain/dates";
import { transactionLabel } from "@/lib/types";

export const metadata = { title: "Marcar compras · Prumo" };

export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
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
  // Only purchases the viewer sees in full can be moved in bulk.
  const items = invoice.lines
    .filter((l) => l.display === "detail" && l.fact.type === "debit")
    .map((l) => ({ id: l.fact.id, label: transactionLabel(l.fact), detail: `${formatDayShort(l.fact.transaction_date)} · ${l.category}`, amountCents: l.fact.amount_cents, category: l.category }));
  const holderIncomeShare = firstShare("income", [holder.incomeCents, other.incomeCents]);

  return (
    <div className="grid gap-4">
      <PageHeader title="Marcar compras" back={`/cards/${card.id}/split?m=${offset}`} />
      <BatchForm items={items} holder={holder.name} other={other.name} incomeShare={holderIncomeShare} returnTo={`/cards/${card.id}/split?m=${offset}`} />
    </div>
  );
}
