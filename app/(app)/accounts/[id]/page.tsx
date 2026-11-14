import Link from "next/link";
import { notFound } from "next/navigation";

import { Amount, PageHeader } from "@/components/app/bits";
import { InstitutionMark, UpdatedAt, VisibilityBadge } from "@/components/app/couple";
import { Card, EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { lastSyncAt, loadAccounts, loadCategoryNames, loadFacts, toOwned } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
import { overdraftFor, overdraftNow } from "@/lib/application/overdraft";
import { OverdraftCard } from "@/components/app/overdraft-card";
import { Money } from "@/components/app/money";
import { formatDayShort, formatMonthLong, monthBounds, todayIn } from "@/lib/domain/dates";
import { partnerAccountsView } from "@/lib/domain/visibility";

export const metadata = { title: "Conta · Prumo" };

/** One account: mine in full, or the partner's through the same projection their preview shows. */
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const memberIds = [user.id, household?.partner?.userId].filter(Boolean) as string[];
  const account = (await loadAccounts(memberIds)).find((a) => a.id === id);
  if (!account) notFound();
  const mine = account.user_id === user.id;
  if (!mine && account.visibility === "private") notFound();

  const today = todayIn();
  const { start, end } = monthBounds(today.slice(0, 7));
  const [facts, categories, syncedAt] = await Promise.all([loadFacts([account.user_id], start, end), loadCategoryNames([account.user_id]), lastSyncAt([account.user_id])]);
  const own = facts.filter((f) => f.account_id === id).map(toOwned);
  const overdraft = mine ? overdraftNow(account) : null;
  const overdraftMonthItems = mine ? (await overdraftFor(user.id, today.slice(0, 7))).filter((o) => o.account.id === id) : [];
  const ownerName = mine ? household?.me.name ?? "Você" : household!.partner!.name;
  const view = mine
    ? { lines: own.map((t) => ({ kind: "detail" as const, id: t.id, label: t.label, tagId: t.tag_id, amountCents: t.amount_cents, type: t.type, date: t.transaction_date, scope: t.scope })), monthOutCents: own.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount_cents, 0) }
    : partnerAccountsView([account], own, today)[0];

  return (
    <div className="grid gap-4">
      <PageHeader title={account.name} subtitle={`${mine ? "Sua conta" : `Conta de ${ownerName}`}`} back="/overview" />
      <Card className="flex items-center gap-3">
        <InstitutionMark name={account.institution ?? account.name} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-muted-foreground">Saldo</span>
          <span className="tabular block text-2xl font-medium">{account.balance_cents !== null ? <Money cents={account.balance_cents} /> : "—"}</span>
        </span>
        <VisibilityBadge kind={account.visibility} />
      </Card>
      {overdraft ? (
        <Card className="grid grid-cols-3 gap-2 text-[13px]">
          <span><span className="block text-muted-foreground">Cheque especial</span><span className="tabular font-medium"><Money cents={overdraft.limitCents} /></span></span>
          <span><span className="block text-muted-foreground">Em uso</span><span className="tabular font-medium"><Money cents={overdraft.usedCents} /></span></span>
          <span><span className="block text-muted-foreground">Disponível com limite</span><span className="tabular font-medium"><Money cents={overdraft.availableCents} /></span></span>
        </Card>
      ) : null}
      <OverdraftCard items={overdraftMonthItems} monthLabel={formatMonthLong(today.slice(0, 7)).split(" ")[0].toLowerCase()} />
      <UpdatedAt at={syncedAt} />
      <p className="text-sm text-muted-foreground">Saiu <Money cents={view.monthOutCents} /> neste mês.</p>

      {account.visibility === "totals" && !mine ? (
        <EmptyState title="Só totais">{ownerName} compartilha o saldo e quanto saiu no mês, sem os lançamentos.</EmptyState>
      ) : view.lines.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {view.lines.map((line) => (
            <li key={line.id}>
              <Link href={`/transactions/${line.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 text-foreground no-underline hover:text-foreground">
                <span className="min-w-0 flex-1">
                  {line.kind === "reserved" ? (
                    <>
                      <span className="block truncate text-[15px] font-medium">Compra reservada por {ownerName}</span>
                      <span className="block text-[13px] text-muted-foreground">Detalhes liberados em {formatDayShort(line.until)}</span>
                    </>
                  ) : (
                    <>
                      <span className="block truncate text-[15px] font-medium">{line.kind === "detail" ? line.label : (line.tagId ? categories.get(line.tagId)?.name : null) ?? "Outros"}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {formatDayShort(line.date)}
                        {line.kind === "detail" ? ` · ${(line.tagId ? categories.get(line.tagId)?.name : null) ?? "Outros"}` : ""}
                        {line.scope === "ours" ? " · Nosso" : ""}
                      </span>
                    </>
                  )}
                </span>
                <Amount cents={line.amountCents} type={line.kind === "reserved" ? "out" : line.type} className="text-[15px]" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nenhum lançamento neste mês" />
      )}
    </div>
  );
}
