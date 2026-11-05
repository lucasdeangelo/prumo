import { deletePrivacyRuleAction } from "@/app/(app)/couple-actions";
import { PageHeader, SectionHeader } from "@/components/app/bits";
import { SpaceChip } from "@/components/app/couple";
import { PrivacyRuleForm } from "@/components/app/privacy-forms";
import { Card, CardTitle, EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getHousehold } from "@/lib/application/household";
import { listPrivacyRules } from "@/lib/application/privacy";
import { listAccounts, listTags } from "@/lib/repositories/reads";

export const metadata = { title: "Regras de privacidade · Prumo" };

export default async function PrivacyRulesPage() {
  const { user, db } = await requireUser();
  const [rules, tags, accounts, household] = await Promise.all([listPrivacyRules(user.id), listTags(db, user.id), listAccounts(db, user.id), getHousehold(user.id)]);
  const partnerName = household?.partner?.name ?? "Seu par";
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const ACTION = { category_only: "Só categoria e valor", hidden: `Ocultar de ${partnerName}`, ask_surprise: "Perguntar se é surpresa" } as const;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <PageHeader title="" back="/settings" />
        <SpaceChip space="meu" caption="Meu · só você vê" me={household?.me.color ?? "blue"} />
      </div>
      <header className="grid gap-1">
        <h1 className="text-2xl font-medium tracking-[-0.02em]">Regras de privacidade</h1>
        <p className="text-sm text-muted-foreground">Para não precisar decidir lançamento por lançamento. Valem para os seus gastos novos.</p>
      </header>

      <section className="grid gap-2">
        <SectionHeader title={`Regras (${rules.length})`} />
        {rules.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {rules.map((rule) => (
              <li key={rule.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-muted-foreground">
                    {rule.match_type === "tag" ? "Categoria" : rule.match_type === "merchant" ? "Loja contém" : "Conta"}
                  </span>
                  <span className="block truncate text-[15px] font-medium">
                    {rule.match_type === "tag" ? tagName.get(rule.tag_id ?? "") : rule.match_type === "merchant" ? `“${rule.pattern}”` : accountName.get(rule.account_id ?? "")}
                  </span>
                  <span className="block text-[13px] text-muted-foreground">{ACTION[rule.action]}</span>
                </span>
                <form action={deletePrivacyRuleAction}>
                  <input type="hidden" name="id" value={rule.id} />
                  <button type="submit" aria-label="Remover regra" className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">×</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nenhuma regra ainda">Ex.: tudo de Saúde aparece só como categoria e valor.</EmptyState>
        )}
      </section>

      <Card className="grid gap-3">
        <CardTitle>Nova regra</CardTitle>
        <PrivacyRuleForm tags={tags} accounts={accounts} partnerName={partnerName} />
      </Card>
    </div>
  );
}
