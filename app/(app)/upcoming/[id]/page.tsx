import { notFound } from "next/navigation";

import { cancelBillAction, payBillAction } from "@/app/(app)/actions";
import { Amount, PageHeader } from "@/components/app/bits";
import { Card, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { billCandidates } from "@/lib/application/bills";
import { formatDayLabel, todayIn } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { FREQUENCY_LABEL } from "@/lib/domain/recurrence";
import { listBills } from "@/lib/repositories/reads";
import { transactionLabel } from "@/lib/types";

export const metadata = { title: "Conta · Prumo" };

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await requireUser();
  const bill = (await listBills(db, user.id)).find((b) => b.id === id);
  if (!bill) notFound();
  const open = bill.status === "pending" || bill.status === "overdue";
  const candidates = open ? await billCandidates(user.id, bill) : [];
  const late = open && bill.due_date < todayIn();

  return (
    <div className="grid gap-4">
      <PageHeader title={bill.description} back="/upcoming" />
      <Card className="text-center">
        <Amount cents={bill.amount_cents} type={bill.type === "payable" ? "out" : "in"} className="text-3xl" />
        <p className={`mt-2 text-sm ${late ? "font-medium text-danger" : "text-muted-foreground"}`}>
          {late ? "Venceu em " : "Vence em "}{formatDayLabel(bill.due_date)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {FREQUENCY_LABEL[bill.recurrence_type]}
          {bill.recurrence_type === "custom" && bill.recurrence_interval ? ` · a cada ${bill.recurrence_interval} ${bill.recurrence_unit}` : ""}
          {" · "}aviso {bill.notify_days_before === 0 ? "no dia" : `${bill.notify_days_before} dia(s) antes`}
        </p>
        {!open ? <p className="mt-2 text-sm font-medium">{bill.status === "paid" ? "✅ Paga" : "Cancelada"}</p> : null}
      </Card>

      {open ? (
        <>
          {candidates.length > 0 ? (
            <Card>
              <CardTitle>Já apareceu no extrato?</CardTitle>
              <p className="mb-3 text-sm text-muted-foreground">Vincule a movimentação para não lançar o valor duas vezes.</p>
              <ul className="grid gap-2">
                {candidates.map((c) => (
                  <li key={c.transactionId}>
                    <form action={payBillAction} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                      <input type="hidden" name="id" value={bill.id} />
                      <input type="hidden" name="transactionId" value={c.transactionId} />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="truncate font-medium">{transactionLabel(c.transaction)}</p>
                        <p className="text-xs text-muted-foreground">{formatDayLabel(c.transaction.transaction_date)} · {formatBRL(c.transaction.amount_cents)}</p>
                      </div>
                      <SubmitButton variant="secondary" pendingText="…">É esta</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <form action={payBillAction}>
            <input type="hidden" name="id" value={bill.id} />
            <SubmitButton className="w-full" pendingText="Registrando…">
              {bill.type === "payable" ? "Marcar como paga" : "Marcar como recebida"}
            </SubmitButton>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Cria a movimentação de hoje{bill.recurrence_type !== "once" ? " e agenda a próxima" : ""}.
            </p>
          </form>
          <form action={cancelBillAction}>
            <input type="hidden" name="id" value={bill.id} />
            <SubmitButton variant="ghost" className="w-full text-danger" pendingText="Cancelando…">Cancelar esta conta</SubmitButton>
          </form>
        </>
      ) : null}
    </div>
  );
}
