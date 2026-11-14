import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/app/bits";
import { ApprovalCard } from "@/components/app/approval-card";
import { SpaceChip, type Person } from "@/components/app/couple";
import { ThresholdForm } from "@/components/app/plan-forms";
import { Card, EmptyState } from "@/components/ui/card";
import { Money } from "@/components/app/money";
import { requireUser } from "@/lib/auth/session";
import { getHousehold, listProposals } from "@/lib/application/household";
import { listApprovals } from "@/lib/application/plans";
import { centsToInput } from "@/lib/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata = { title: "Combinados · Prumo" };

const since = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household?.partner) redirect("/couple");
  const [rows, proposals, { data: decided }] = await Promise.all([
    listApprovals(household.id),
    listProposals(household.id),
    createAdminClient().from("household_proposals").select("decided_at").eq("household_id", household.id).eq("kind", "approval_threshold").eq("status", "accepted").order("decided_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const people = new Map<string, Person>([[household.me.userId, household.me], [household.partner.userId, household.partner]]);
  const waiting = rows.filter((r) => r.status === "pending" && r.requested_by !== user.id);
  const shown = f === "esperando" ? waiting : rows;
  const thresholdProposal = proposals.find((p) => p.kind === "approval_threshold");
  const names = household.me.color === "blue" ? `${household.me.name} e ${household.partner.name}` : `${household.partner.name} e ${household.me.name}`;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <PageHeader title="" back="/overview" />
        <SpaceChip space="nosso" caption={`Nosso · ${names} veem`} me={household.me.color} />
      </div>
      <header className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-medium tracking-[-0.02em]">Combinados</h1>
        <Link href="/couple/approvals/new" className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">Combinar compra</Link>
      </header>

      <Card className="grid gap-3">
        {household.approvalThresholdCents ? (
          <div>
            <p className="text-[15px] font-medium">Compras do Nosso acima de <Money cents={household.approvalThresholdCents} /></p>
            <p className="text-sm text-muted-foreground">a gente conversa antes</p>
            {decided?.decided_at ? <p className="mt-1 text-[13px] text-muted-foreground">Combinado por {names} em {since.format(new Date(decided.decided_at))}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Definam juntos a partir de que valor uma compra do Nosso pede uma conversa antes.</p>
        )}
        {thresholdProposal ? (
          <p className="rounded-[10px] bg-muted px-3 py-2 text-[13px] text-muted-foreground">
            {thresholdProposal.proposed_by === user.id ? `Aguardando ${household.partner.name} confirmar` : `${household.partner.name} propôs`} {thresholdProposal.payload.amountCents ? <Money cents={thresholdProposal.payload.amountCents as number} /> : "sem limite"}. {thresholdProposal.proposed_by !== user.id ? <Link href="/couple">Responder</Link> : null}
          </p>
        ) : null}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-primary">Mudar o valor (os dois confirmam)</summary>
          <div className="mt-3"><ThresholdForm currentText={household.approvalThresholdCents ? centsToInput(household.approvalThresholdCents) : ""} partnerName={household.partner.name} /></div>
        </details>
      </Card>

      <nav className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1" aria-label="Filtro">
        {[["todos", "Todos"], ["esperando", `Esperando você · ${waiting.length}`]].map(([value, label]) => {
          const active = (f ?? "todos") === value;
          return (
            <Link key={value} href={`/couple/approvals?f=${value}`} aria-current={active ? "page" : undefined} className={cn("flex min-h-10 items-center justify-center rounded-full text-sm font-medium no-underline", active ? "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(18,21,18,0.1)]" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </Link>
          );
        })}
      </nav>

      {shown.length > 0 ? (
        <ul className="grid gap-3">{shown.map((row) => <ApprovalCard key={row.id} row={row} people={people} viewerId={user.id} />)}</ul>
      ) : (
        <EmptyState title={f === "esperando" ? "Nada esperando você" : "Nenhum combinado ainda"}>Quando um quiser combinar uma compra grande, aparece aqui.</EmptyState>
      )}
    </div>
  );
}
