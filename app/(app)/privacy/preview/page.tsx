import Link from "next/link";
import { redirect } from "next/navigation";

import { Amount, PageHeader } from "@/components/app/bits";
import { Avatar, InstitutionMark, VisibilityBadge } from "@/components/app/couple";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { freeMoneyFor, loadAccounts, loadCategoryNames, loadFacts, toOwned } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
import { formatDayShort, monthBounds, todayIn } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { keptPrivateSummary, partnerAccountsView } from "@/lib/domain/visibility";

export const metadata = { title: "Como seu par vê · Prumo" };

/** Exactly what the partner's screen shows of my accounts, computed by the same projection. */
export default async function PreviewPage() {
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household?.partner) redirect("/privacy/visibility");
  const partner = household.partner;
  const today = todayIn();
  const month = today.slice(0, 7);
  const { start, end } = monthBounds(month);
  const [accounts, facts, categories] = await Promise.all([loadAccounts([user.id]), loadFacts([user.id], start, end), loadCategoryNames([user.id])]);
  const owned = facts.map(toOwned);
  const view = partnerAccountsView(accounts, owned, today);
  const kept = keptPrivateSummary(accounts, owned, today);
  const freeMoney = await freeMoneyFor(household, user.id, facts, month);
  const me = household.me;

  return (
    <div className="grid gap-4">
      <PageHeader title={`Como ${partner.name} vê isso`} back="/privacy/visibility" />
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Avatar person={partner} size={24} /> Prévia da tela de {partner.name} · suas contas
      </div>

      {view.map((account) => (
        <Card key={account.id} className="grid gap-3 p-0">
          <div className="flex items-center gap-3 px-4 pt-4">
            <InstitutionMark name={account.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{account.name} · {me.name}</span>
              <span className="mt-1 block"><VisibilityBadge kind={account.visibility} /></span>
            </span>
            {account.balanceCents !== null ? <Amount cents={Math.abs(account.balanceCents)} className="text-[15px]" /> : null}
          </div>
          {account.visibility === "details" ? (
            account.lines.length > 0 ? (
              <ul className="divide-y divide-border border-t border-border">
                {account.lines.slice(0, 8).map((line) => (
                  <li key={line.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      {line.kind === "reserved" ? (
                        <>
                          <span className="block truncate text-[15px] font-medium">Compra reservada por {me.name}</span>
                          <span className="block text-[13px] text-muted-foreground">Detalhes liberados em {formatDayShort(line.until)}</span>
                        </>
                      ) : (
                        <>
                          <span className="block truncate text-[15px] font-medium">
                            {line.kind === "detail" ? line.label : (line.tagId ? categories.get(line.tagId)?.name : null) ?? "Outros"}
                          </span>
                          <span className="block text-[13px] text-muted-foreground">
                            {line.kind === "detail" ? `${(line.tagId ? categories.get(line.tagId)?.name : null) ?? "Outros"} · ` : ""}
                            {formatDayShort(line.date)}
                          </span>
                        </>
                      )}
                    </span>
                    <Amount cents={line.amountCents} type={line.kind === "reserved" ? "out" : line.type} className="text-[15px]" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-border px-4 py-3 text-[13px] text-muted-foreground">Nenhum lançamento compartilhado neste mês.</p>
            )
          ) : (
            <p className="border-t border-border px-4 py-3 text-[13px] text-muted-foreground">Saiu {formatBRL(account.monthOutCents)} no mês · lançamentos não compartilhados.</p>
          )}
        </Card>
      ))}

      {freeMoney ? (
        <Card className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-[15px] font-medium">Dinheiro livre de {me.name}</span>
            <span className="block text-[13px] text-muted-foreground">{formatBRL(freeMoney.usedCents)} usados de {formatBRL(freeMoney.allowanceCents)}</span>
          </span>
          <VisibilityBadge kind="totals" />
        </Card>
      ) : null}

      <Card className="grid gap-2">
        <p className="label-mono">Fica só com você</p>
        <ul className="grid gap-1.5 text-sm text-muted-foreground">
          {kept.privateAccounts.map((name) => <li key={name}>{name} — {partner.name} não vê que ela existe.</li>)}
          {kept.hidden.length > 0 ? <li>{kept.hidden.length === 1 ? `1 lançamento oculto (${kept.hidden[0]})` : `${kept.hidden.length} lançamentos ocultos`} — não aparece nem conta como oculto.</li> : null}
          {kept.freeMoneyCount > 0 ? <li>{kept.freeMoneyCount === 1 ? "1 compra" : `${kept.freeMoneyCount} compras`} do dinheiro livre — entram só no total.</li> : null}
          {kept.hiddenSurprises > 0 ? <li>{kept.hiddenSurprises === 1 ? "1 surpresa" : `${kept.hiddenSurprises} surpresas`} com valor escondido — entram só no total do mês.</li> : null}
          {kept.privateAccounts.length + kept.hidden.length + kept.freeMoneyCount + kept.hiddenSurprises === 0 ? <li>Nada além do que você já escolheu nas contas.</li> : null}
        </ul>
      </Card>

      <Link href="/privacy/visibility" className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">
        Ajustar visibilidade
      </Link>
    </div>
  );
}
