import { PageHeader } from "@/components/app/bits";
import { BillForm } from "@/components/app/forms";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";
import { listAccounts, listTags } from "@/lib/repositories/reads";

export const metadata = { title: "Nova conta · Prumo" };

export default async function NewBillPage() {
  const { user, db } = await requireUser();
  const [tags, accounts] = await Promise.all([listTags(db, user.id), listAccounts(db, user.id)]);
  return (
    <div>
      <PageHeader title="Nova conta futura" back="/upcoming" />
      <Card><BillForm tags={tags} accounts={accounts} today={todayIn()} /></Card>
    </div>
  );
}
