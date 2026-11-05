import Link from "next/link";
import { notFound } from "next/navigation";

import { disconnectAction } from "@/app/(app)/connect/actions";
import { PageHeader } from "@/components/app/bits";
import { InstitutionMark } from "@/components/app/couple";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/application/connections";
import { getHousehold } from "@/lib/application/household";

export const metadata = { title: "Desconectar banco · Prumo" };

const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function DisconnectPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const { user } = await requireUser();
  const [connections, household] = await Promise.all([listConnections(user.id), getHousehold(user.id)]);
  const group = connections.filter((c) => c.pluggyItemId === itemId);
  if (group.length === 0) notFound();
  const name = group.map((g) => g.institution).join(", ");
  const partnerName = household?.partner?.name;
  const hasCard = group.some((g) => g.accounts.some((a) => a.type === "CREDIT"));

  return (
    <div className="grid gap-4">
      <PageHeader title="Conexões" back="/settings/connections" />
      <div className="flex items-center gap-3">
        <InstitutionMark name={group[0].institution} />
        <h1 className="text-2xl font-medium tracking-[-0.02em]">Desconectar {name}?</h1>
      </div>
      <p className="text-[15px] text-muted-foreground">
        O Prumo para de receber dados novos desta conexão.
        {group.length > 1 ? " Pelo MeuPluggy, seus bancos estão numa conexão só: todos param juntos." : ""}
      </p>

      <form action={disconnectAction} className="grid gap-4">
        <input type="hidden" name="itemId" value={itemId} />
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[15px] font-medium">E o histórico já importado?</legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-border bg-card px-3.5 py-3 has-[:checked]:border-foreground">
            <input type="radio" name="history" value="keep" defaultChecked className="mt-1 size-4 accent-[var(--primary)]" />
            <span>
              <span className="block text-[15px] font-medium">Manter</span>
              <span className="block text-[13px] text-muted-foreground">Lançamentos, fatura e acertos {partnerName ? "de vocês " : ""}continuam como estão.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-border bg-card px-3.5 py-3 has-[:checked]:border-foreground">
            <input type="radio" name="history" value="purge" className="mt-1 size-4 accent-[var(--primary)]" />
            <span>
              <span className="block text-[15px] font-medium">Apagar do Prumo</span>
              <span className="block text-[13px] text-muted-foreground">Some de todas as telas. Metas e acertos já feitos ficam, sem os detalhes.</span>
            </span>
          </label>
        </fieldset>

        {partnerName ? (
          <Card className="grid gap-1.5">
            <p className="label-mono">E para {partnerName}</p>
            <p className="text-sm">Ele continua vendo o que já via, até {day.format(new Date())}, com a data da última atualização.</p>
            {hasCard ? <p className="text-sm">As compras do adicional dele não entram mais sozinhas na fatura de vocês.</p> : null}
          </Card>
        ) : null}
        <p className="text-[13px] text-muted-foreground">Para encerrar o consentimento com o banco também, revogue no MeuPluggy depois.</p>
        <SubmitButton className="w-full bg-danger hover:bg-danger/90" pendingText="Desconectando…">Desconectar {group[0].institution}</SubmitButton>
        <Link href="/settings/connections" className="inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[15px] font-medium text-foreground hover:bg-muted hover:text-foreground">Cancelar</Link>
      </form>
    </div>
  );
}
