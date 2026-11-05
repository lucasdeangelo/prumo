import Link from "next/link";

import { PageHeader } from "@/components/app/bits";
import { UpdatedAt } from "@/components/app/couple";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { lastSyncAt } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";

export const metadata = { title: "Como funciona a atualização · Prumo" };

export default async function UpdatesHelpPage() {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const at = await lastSyncAt([user.id, household?.partner?.userId].filter(Boolean) as string[]);
  return (
    <div className="grid gap-5">
      <PageHeader title="" back="/overview" />
      <UpdatedAt at={at} />
      <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em]">Os dados chegam uma vez por dia</h1>
      <Card className="grid gap-3 text-[15px]">
        <p>O MeuPluggy busca os dados nos bancos de madrugada e o Prumo atualiza logo depois.</p>
        <p>Uma compra feita hoje aparece amanhã. Se precisar dela agora, registre à mão ou pelo WhatsApp.</p>
        {household?.partner ? <p>Você e {household.partner.name} veem a mesma data de atualização em tudo o que é compartilhado.</p> : null}
      </Card>
      <Link href="/overview" className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">Entendi</Link>
    </div>
  );
}
