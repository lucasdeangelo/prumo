import { PageHeader } from "@/components/app/bits";
import { SubscriptionForm } from "@/components/app/forms";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";
import { listTags } from "@/lib/repositories/reads";

export const metadata = { title: "Nova assinatura · Prumo" };

export default async function NewSubscriptionPage() {
  const { user, db } = await requireUser();
  const tags = await listTags(db, user.id);
  return (
    <div>
      <PageHeader title="Nova assinatura" back="/subscriptions" />
      <Card><SubscriptionForm tags={tags} today={todayIn()} /></Card>
    </div>
  );
}
