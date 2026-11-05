import { notFound, redirect } from "next/navigation";

import { markTalkedAction, respondApprovalAction, withdrawApprovalAction } from "@/app/(app)/couple/plan-actions";
import { PageHeader } from "@/components/app/bits";
import { Avatar, SpaceChip } from "@/components/app/couple";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { budgetOverview, loadCoupleContext } from "@/lib/application/couple-data";
import { listApprovals } from "@/lib/application/plans";
import { formatBRL } from "@/lib/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Combinar uma compra · Prumo" };

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser();
  const ctx = await loadCoupleContext(user.id);
  const household = ctx.household;
  if (!household?.partner) redirect("/couple");
  const row = (await listApprovals(household.id)).find((r) => r.id === id);
  if (!row) notFound();
  const requester = row.requested_by === user.id ? household.me : household.partner;
  const other = row.requested_by === user.id ? household.partner : household.me;
  const waitingMe = row.status === "pending" && row.requested_by !== user.id;
  const overview = await budgetOverview(household.id, ctx.facts, ctx.categories);
  const categoryLine = row.category ? overview.lines.find((l) => l.category === row.category) : undefined;
  const monthly = Math.round(row.amount_cents / row.installments);
  // Installments already running on shared card purchases.
  const { data: running } = await createAdminClient()
    .from("transactions")
    .select("amount_cents, installment_number, installment_total, transaction_date")
    .in("user_id", ctx.memberIds)
    .eq("scope", "ours")
    .not("installment_total", "is", null)
    .is("deleted_at", null)
    .gte("transaction_date", ctx.month + "-01");
  const runningMonthly = (running ?? []).filter((r) => (r.installment_number as number) < (r.installment_total as number)).reduce((s, r) => s + (r.amount_cents as number), 0);

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <PageHeader title="" back="/couple/approvals" />
        <SpaceChip space="nosso" caption="Nosso · combinado dos dois" me={household.me.color} />
      </div>
      {waitingMe ? <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Esperando você</span> : null}
      <h1 className="text-2xl font-medium tracking-[-0.02em]">{row.requested_by === user.id ? "Você quer combinar uma compra" : `${requester.name} quer combinar uma compra com você`}</h1>
      {household.approvalThresholdCents ? <p className="text-sm text-muted-foreground">Vocês combinaram conversar sobre compras do Nosso acima de {formatBRL(household.approvalThresholdCents)}.</p> : null}

      <Card className="grid gap-3">
        <div>
          <p className="text-lg font-medium">{row.title}</p>
          <p className="text-sm text-muted-foreground">{[row.merchant, row.category].filter(Boolean).join(" · ")}</p>
        </div>
        <p className="tabular text-[32px] font-medium tracking-[-0.03em]">{formatBRL(row.amount_cents)}</p>
        {row.installments > 1 ? <p className="text-sm text-muted-foreground">{row.installments}x de {formatBRL(monthly)}</p> : null}
        {row.note ? <p className="flex items-start gap-2 text-sm"><Avatar person={requester} size={24} /><span className="text-muted-foreground">“{row.note}”</span></p> : null}
      </Card>

      <Card className="grid gap-2 text-sm">
        <p className="label-mono">Como fica para vocês</p>
        <div className="flex justify-between"><span>{row.installments > 1 ? "Parcela no orçamento do lar" : "No orçamento do lar"}</span><span className="tabular font-medium">{formatBRL(monthly)}{row.installments > 1 ? "/mês" : ""}</span></div>
        {categoryLine ? <div className="flex justify-between"><span>{categoryLine.category} este mês</span><span className="tabular">{categoryLine.remainingCents >= 0 ? `restam ${formatBRL(categoryLine.remainingCents)}` : `passou ${formatBRL(-categoryLine.remainingCents)}`}</span></div> : null}
        {runningMonthly > 0 ? <div className="flex justify-between"><span>Parcelas já em andamento</span><span className="tabular">{formatBRL(runningMonthly)}/mês</span></div> : null}
      </Card>

      {waitingMe ? (
        <form action={respondApprovalAction} className="grid gap-3">
          <input type="hidden" name="id" value={row.id} />
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Comentário (opcional)</span>
            <textarea name="comment" maxLength={280} rows={2} className="w-full rounded-[10px] border border-border bg-card px-3.5 py-3 text-base" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="submit" name="answer" value="talk" className="min-h-12 rounded-full border border-foreground text-[15px] font-medium">Vamos conversar</button>
            <button type="submit" name="answer" value="approved" className="min-h-12 rounded-full bg-primary text-[15px] font-medium text-primary-foreground hover:bg-primary-press">Aprovar</button>
          </div>
          <p className="text-center text-[13px] text-muted-foreground">{requester.name} recebe sua resposta e o comentário. Nada é bloqueado no banco.</p>
        </form>
      ) : row.status === "talk" ? (
        <form action={markTalkedAction} className="grid gap-2">
          <input type="hidden" name="id" value={row.id} />
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">O que vocês decidiram (opcional)</span>
            <input name="outcome" maxLength={280} className="min-h-12 w-full rounded-[10px] border border-border bg-card px-3.5" placeholder="Fica para depois da viagem" />
          </label>
          <SubmitButton variant="outline" className="w-full">Marcar como conversado</SubmitButton>
        </form>
      ) : row.status === "pending" ? (
        <form action={withdrawApprovalAction} className="grid gap-2">
          <input type="hidden" name="id" value={row.id} />
          <p className="text-center text-sm text-muted-foreground">Aguardando {other.name}.</p>
          <SubmitButton variant="ghost" className="w-full">Retirar o pedido</SubmitButton>
        </form>
      ) : (
        <p className="rounded-[10px] bg-secondary px-3 py-2.5 text-center text-sm text-secondary-foreground">{row.status === "approved" ? `Aprovado${row.response_note ? `: “${row.response_note}”` : "."}` : "Conversado."}</p>
      )}
    </div>
  );
}
