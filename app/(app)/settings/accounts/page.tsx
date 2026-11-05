import { archiveAccountAction } from "@/app/(app)/actions";
import { Amount, PageHeader } from "@/components/app/bits";
import { VisibilityBadge } from "@/components/app/couple";
import { ManualAccountForm } from "@/components/app/forms";
import { Card, CardTitle, EmptyState } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { getHousehold } from "@/lib/application/household";
import { listAccounts } from "@/lib/repositories/reads";

export const metadata = { title: "Contas manuais · Prumo" };

export default async function ManualAccountsPage() {
  const { user, db } = await requireUser();
  const [accounts, household] = await Promise.all([listAccounts(db, user.id), getHousehold(user.id)]);
  const manual = accounts.filter((a) => a.is_manual);
  return (
    <div className="grid gap-4">
      <PageHeader title="Contas manuais" subtitle="Carteira, dinheiro guardado, contas sem Open Finance" back="/settings" />
      {manual.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {manual.map((a) => (
            <li key={a.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{a.name}</span>
                {household?.partner ? <span className="mt-1 block"><VisibilityBadge kind={a.visibility} /></span> : null}
              </span>
              {a.balance_cents !== null ? <Amount cents={a.balance_cents} className="text-[15px]" /> : null}
              <form action={archiveAccountAction}>
                <input type="hidden" name="id" value={a.id} />
                <SubmitButton variant="ghost" pendingText="…" className="px-3 text-[13px]">Arquivar</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nenhuma conta manual" />
      )}
      <Card className="grid gap-3">
        <CardTitle>Nova conta manual</CardTitle>
        <ManualAccountForm />
        {household?.partner ? <p className="text-[13px] text-muted-foreground">Começa como “Só eu vejo”. Mude em Ajustes › O que {household.partner.name} vê.</p> : null}
      </Card>
    </div>
  );
}
