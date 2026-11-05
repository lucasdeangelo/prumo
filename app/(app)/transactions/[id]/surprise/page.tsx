import { notFound } from "next/navigation";

import { Amount, PageHeader } from "@/components/app/bits";
import { SurpriseForm } from "@/components/app/privacy-forms";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getHousehold } from "@/lib/application/household";
import { addDays, formatDayLabel, todayIn } from "@/lib/domain/dates";
import { centsToInput } from "@/lib/domain/money";
import { getTransaction } from "@/lib/repositories/reads";
import { transactionLabel } from "@/lib/types";

export const metadata = { title: "Modo surpresa · Prumo" };

const short = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/** Next Christmas Eve and, when the partner's birthday is unknown, a date one month ahead. */
function presets(today: string) {
  const year = Number(today.slice(0, 4));
  const christmas = `${today.slice(5) > "12-24" ? year + 1 : year}-12-24`;
  const list = [{ value: christmas, label: `Natal · ${short.format(new Date(`${christmas}T00:00:00Z`))}` }];
  const inAMonth = addDays(today, 30);
  list.push({ value: inAMonth, label: `Daqui a um mês · ${short.format(new Date(`${inAMonth}T00:00:00Z`))}` });
  return list;
}

export default async function SurprisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { user, db } = await requireUser();
  const [tx, household] = await Promise.all([getTransaction(db, user.id, id), getHousehold(user.id)]);
  if (!tx || tx.type !== "debit" || tx.scope === "ours") notFound();
  const partnerName = household?.partner?.name ?? "Seu par";

  return (
    <div className="grid gap-4">
      <PageHeader title="Guardar como surpresa" back={`/transactions/${id}`} />
      <Card className="text-center">
        <Amount cents={tx.amount_cents} type="out" className="text-3xl" />
        <p className="mt-2 font-medium">{transactionLabel(tx)}</p>
        <p className="text-sm text-muted-foreground">{formatDayLabel(tx.transaction_date)}</p>
      </Card>
      <p className="text-sm text-muted-foreground">{partnerName} não vê a loja nem a categoria até a data que você escolher. Depois, o lançamento aparece normalmente.</p>
      <Card>
        <SurpriseForm id={id} presets={presets(todayIn())} partnerName={partnerName} meName={household?.me.name ?? "você"} amountText={centsToInput(tx.amount_cents)} />
      </Card>
    </div>
  );
}
