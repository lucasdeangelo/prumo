import { decideProposalAction, leaveHouseholdAction, proposeSplitAction } from "@/app/(app)/couple-actions";
import { PageHeader } from "@/components/app/bits";
import { CoupleAvatars } from "@/components/app/couple";
import { InviteButton, JoinForm, MemberForm } from "@/components/app/couple-forms";
import { Card, CardTitle } from "@/components/ui/card";
import { Select, SubmitButton } from "@/components/ui/form";
import { Money } from "@/components/app/money";
import { requireUser } from "@/lib/auth/session";
import { getHousehold, listProposals } from "@/lib/application/household";
import { loadSplitRules } from "@/lib/application/couple-data";
import { sharePercentLabel } from "@/lib/domain/couple";
import { centsToInput } from "@/lib/domain/money";
import { getServerEnv } from "@/lib/env.server";

export const metadata = { title: "Casal · Prumo" };

const sinceFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

const KIND_LABEL: Record<string, string> = {
  free_money: "Dinheiro livre",
  approval_threshold: "Compras grandes",
  budget: "Orçamento do lar",
  split: "Divisão das contas",
};

function describeProposal(kind: string, payload: Record<string, unknown>): React.ReactNode {
  if (kind === "approval_threshold") return payload.amountCents ? <>Conversar antes acima de <Money cents={payload.amountCents as number} /></> : "Sem limite para conversar";
  if (kind === "split") return payload.defaultSplit === "equal" ? "Dividir tudo 50/50" : "Dividir pela renda";
  if (kind === "budget") {
    const lines = (payload.lines as Array<{ amountCents: number }>) ?? [];
    return <><Money cents={lines.reduce((s, l) => s + l.amountCents, 0)} /> por mês em {lines.length} categorias</>;
  }
  if (kind === "free_money") {
    const amounts = Object.values((payload.amounts as Record<string, number>) ?? {});
    return amounts.length ? <><Money cents={amounts[0]} /> por mês para cada um</> : "";
  }
  return "";
}

export default async function CouplePage({ searchParams }: { searchParams: Promise<{ convite?: string; entrou?: string }> }) {
  const { user } = await requireUser();
  const { convite, entrou } = await searchParams;
  const household = await getHousehold(user.id);
  const partner = household?.partner ?? null;

  if (!household || !partner) {
    return (
      <div className="grid gap-4">
        <PageHeader title="Seu par no Prumo" back="/settings" />
        <Card className="grid gap-3">
          <CardTitle>Convidar</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cada um continua dono do que é seu: contas novas começam como “Só eu vejo”, e vocês escolhem juntos o que é dos dois.
          </p>
          <InviteButton appUrl={getServerEnv().APP_URL} />
        </Card>
        <Card className="grid gap-3">
          <CardTitle>Recebi um convite</CardTitle>
          <JoinForm defaultCode={convite} />
        </Card>
      </div>
    );
  }

  const [proposals, rules] = await Promise.all([listProposals(household.id), loadSplitRules(household.id)]);
  const people = household.me.color === "blue" ? [household.me, partner] : [partner, household.me];
  const equalCategories = [...rules.entries()].filter(([, r]) => r.method === "equal").map(([c]) => c);

  return (
    <div className="grid gap-4">
      <PageHeader title="Perfil do casal" back="/settings" />
      {entrou ? <p role="status" className="rounded-[10px] bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">Pronto! Agora vocês dois estão no Prumo.</p> : null}

      <Card className="flex items-center gap-4">
        <CoupleAvatars people={people} size={44} />
        <div className="min-w-0">
          <p className="text-lg font-medium">{people[0].name} e {people[1].name}</p>
          <p className="text-[13px] text-muted-foreground">Juntos no Prumo desde {sinceFormat.format(new Date(household.createdAt))}</p>
        </div>
      </Card>

      {proposals.length > 0 ? (
        <Card className="grid gap-3">
          <CardTitle>Esperando confirmação</CardTitle>
          <ul className="grid gap-3">
            {proposals.map((p) => {
              const mine = p.proposed_by === user.id;
              return (
                <li key={p.id} className="grid gap-2 rounded-[10px] border border-border p-3">
                  <p className="text-[15px] font-medium">{KIND_LABEL[p.kind]}</p>
                  <p className="text-sm text-muted-foreground">{describeProposal(p.kind, p.payload)}</p>
                  <p className="text-[13px] text-muted-foreground">{mine ? `Você propôs. Aguardando ${partner.name}.` : `${partner.name} propôs.`}</p>
                  <form action={decideProposalAction} className="grid grid-cols-2 gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="returnTo" value="/couple" />
                    {mine ? (
                      <SubmitButton variant="ghost" className="col-span-2">Retirar proposta</SubmitButton>
                    ) : (
                      <>
                        <button type="submit" name="accept" value="0" className="min-h-12 rounded-full border border-foreground text-[15px] font-medium">Vamos conversar</button>
                        <button type="submit" name="accept" value="1" className="min-h-12 rounded-full bg-primary text-[15px] font-medium text-primary-foreground hover:bg-primary-press">Confirmar</button>
                      </>
                    )}
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card className="grid gap-3">
        <CardTitle>Você</CardTitle>
        <MemberForm incomeText={household.me.incomeCents ? centsToInput(household.me.incomeCents) : ""} pixKey={household.me.pixKey ?? ""} />
      </Card>

      <Card className="grid gap-3">
        <CardTitle>Divisão das contas</CardTitle>
        <p className="text-sm text-muted-foreground">
          Hoje: {household.defaultSplit === "income" ? `pela renda (${sharePercentLabel(people[0] === household.me ? household.myShare : 1 - household.myShare)})` : "50/50"}
          {equalCategories.length ? ` · 50/50 em ${equalCategories.join(", ")}` : ""}.
          {household.defaultSplit === "income" && (!household.me.incomeCents || !partner.incomeCents) ? " Sem as duas rendas informadas, vale 50/50." : ""}
        </p>
        <form action={proposeSplitAction} className="grid gap-3">
          <Select name="defaultSplit" defaultValue={household.defaultSplit} aria-label="Regra padrão">
            <option value="income">Proporcional à renda</option>
            <option value="equal">50/50</option>
          </Select>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Categorias sempre 50/50</span>
            <input name="equalCategories" defaultValue={equalCategories.join(", ")} placeholder="Ex.: Lazer, Viagens" className="min-h-12 w-full rounded-[10px] border border-border bg-card px-3.5" />
          </label>
          <SubmitButton variant="secondary">Propor para {partner.name}</SubmitButton>
          <p className="text-[13px] text-muted-foreground">Muda quando {partner.name} confirmar.</p>
        </form>
      </Card>

      <form action={leaveHouseholdAction}>
        <SubmitButton variant="ghost" className="w-full text-danger" pendingText="Saindo…">Sair da casa</SubmitButton>
        <p className="mt-1 text-center text-[13px] text-muted-foreground">Cada um fica com o que é seu. O que era Nosso volta para quem lançou.</p>
      </form>
    </div>
  );
}
