import { PageHeader } from "@/components/app/bits";
import { TransactionForm } from "@/components/app/forms";
import { Card } from "@/components/ui/card";
import { getHousehold } from "@/lib/application/household";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";
import { listAccounts, listTags } from "@/lib/repositories/reads";

export const metadata = { title: "Nova movimentação · Prumo" };

export default async function NewTransactionPage() {
  const { user, db } = await requireUser();
  const [tags, accounts] = await Promise.all([listTags(db, user.id), listAccounts(db, user.id)]);
  return (
    <div>
      <PageHeader title="Nova movimentação" back="/overview" />
      <Card>
        <TransactionForm tags={tags} accounts={accounts.filter((a) => a.is_manual)} today={todayIn()} partnerName={(await getHousehold(user.id))?.partner?.name ?? null} />
      </Card>
      <p className="mt-4 px-1 text-sm text-muted-foreground">Dica: no WhatsApp, envie “gastei 45,90 no mercado”.</p>
    </div>
  );
}
