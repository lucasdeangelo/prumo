import Link from "next/link";

import { setPartnerCardAction } from "@/app/(app)/couple-actions";
import { PageHeader, SectionHeader } from "@/components/app/bits";
import { InstitutionMark, SpaceChip } from "@/components/app/couple";
import { VisibilitySegment } from "@/components/app/visibility-segment";
import { Card, EmptyState } from "@/components/ui/card";
import { Input, SubmitButton } from "@/components/ui/form";
import { Money } from "@/components/app/money";
import { requireUser } from "@/lib/auth/session";
import { loadAccounts } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";

export const metadata = { title: "Visibilidade das contas · Prumo" };

export default async function VisibilityPage() {
  const { user } = await requireUser();
  const [household, accounts] = await Promise.all([getHousehold(user.id), loadAccounts([user.id])]);
  const partnerName = household?.partner?.name ?? "Seu par";
  const banks = accounts.filter((a) => a.type !== "CREDIT");
  const cards = accounts.filter((a) => a.type === "CREDIT");

  const info = (a: (typeof accounts)[number]) => (
    <>
      <div className="flex items-center gap-3">
        <InstitutionMark name={a.institution ?? a.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{a.name}</span>
          <span className="block text-[13px] text-muted-foreground">
            {a.card_last4 ? `•• ${a.card_last4}` : ""}
            {a.card_last4 && a.balance_cents !== null ? " · " : ""}
            {a.balance_cents !== null ? <Money cents={Math.abs(a.balance_cents)} /> : ""}
          </span>
        </span>
      </div>
      <VisibilitySegment accountId={a.id} value={a.visibility} returnTo="/privacy/visibility" accountName={a.name} />
    </>
  );
  const row = (a: (typeof accounts)[number]) => <li key={a.id} className="grid gap-3 px-4 py-4">{info(a)}</li>;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <PageHeader title="" back="/settings" />
        <SpaceChip space="meu" caption="Meu · só você vê esta tela" me={household?.me.color ?? "blue"} />
      </div>
      <header className="grid gap-1">
        <h1 className="text-2xl font-medium tracking-[-0.02em]">O que {partnerName} vê das suas contas</h1>
        <p className="text-sm text-muted-foreground">Escolha conta por conta. Você pode mudar quando quiser.</p>
      </header>

      <Card className="grid gap-2 text-sm">
        <p><strong>Só eu vejo.</strong> {partnerName} não sabe que a conta existe.</p>
        <p><strong>Só totais.</strong> Saldo e quanto saiu no mês, sem lançamentos.</p>
        <p><strong>Com detalhes.</strong> Cada lançamento, menos os que você ocultar.</p>
      </Card>

      {accounts.length === 0 ? (
        <EmptyState title="Nenhuma conta ainda"><Link href="/connect">Conecte seus bancos</Link> ou crie uma conta manual em Ajustes.</EmptyState>
      ) : null}

      {banks.length > 0 ? (
        <section className="grid gap-2">
          <SectionHeader title="Contas" />
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{banks.map(row)}</ul>
        </section>
      ) : null}

      {cards.length > 0 ? (
        <section className="grid gap-2">
          <SectionHeader title="Cartões" />
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {cards.map((a) => (
              <li key={a.id} className="grid gap-3 px-4 py-4">
                {info(a)}
                <form action={setPartnerCardAction} className="grid gap-2">
                  <input type="hidden" name="accountId" value={a.id} />
                  <label className="grid gap-1.5">
                    <span className="text-[13px] text-muted-foreground">Final do cartão adicional de {partnerName} (se houver)</span>
                    <div className="flex gap-2">
                      <Input name="last4" inputMode="numeric" maxLength={4} defaultValue={a.partner_card_last4 ?? ""} placeholder="7710" className="max-w-28" />
                      <SubmitButton variant="ghost" className="px-4">Salvar</SubmitButton>
                    </div>
                  </label>
                </form>
              </li>
            ))}
          </ul>
          <p className="px-1 text-[13px] text-muted-foreground">{partnerName} sempre vê as compras do próprio adicional. Esta escolha vale para as suas compras na fatura.</p>
        </section>
      ) : null}

      {household?.partner ? (
        <Link href="/privacy/preview" className="inline-flex min-h-12 items-center justify-center rounded-full border border-foreground px-6 text-[15px] font-medium text-foreground hover:text-foreground">
          Ver como {partnerName} vê
        </Link>
      ) : null}
      <p className="text-center text-[13px] text-muted-foreground">Contas novas entram como “Só eu vejo”. {partnerName} não recebe aviso quando você muda a visibilidade.</p>
    </div>
  );
}
