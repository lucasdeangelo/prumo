import { notFound } from "next/navigation";

import { UpdatedAt } from "@/components/app/couple";
import { TxPrivacySection } from "@/components/app/tx-privacy";
import { lastSyncAt, loadAccounts, loadCategoryNames } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
import { projectForPartner } from "@/lib/domain/visibility";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRANSACTION_COLUMNS, type Transaction } from "@/lib/types";
import { todayIn } from "@/lib/domain/dates";

import { deleteTransactionAction } from "@/app/(app)/actions";
import { Amount, PageHeader } from "@/components/app/bits";
import { EditTransactionForm } from "@/components/app/forms";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { formatDayLabel } from "@/lib/domain/dates";
import { centsToInput } from "@/lib/domain/money";
import { titleCase } from "@/lib/domain/normalize";
import { getTransaction, listAccounts, listTags } from "@/lib/repositories/reads";
import { transactionLabel } from "@/lib/types";

export const metadata = { title: "Movimentação · Prumo" };

const SOURCE_LABEL: Record<string, string> = {
  pluggy: "Importada do banco",
  whatsapp: "Registrada pelo WhatsApp",
  manual: "Registrada no app",
  upcoming_reconciliation: "Criada ao pagar uma conta futura",
};

const CATEGORY_LABEL: Record<string, string> = {
  rule: "por uma regra sua",
  keyword: "pelo nome do estabelecimento",
  provider: "pela categoria do banco",
  fallback: "sem pista (Outros)",
  user: "por você",
};

export default async function TransactionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { id } = await params;
  const { erro } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { user, db } = await requireUser();
  const [tx, tags, accounts, household] = await Promise.all([getTransaction(db, user.id, id), listTags(db, user.id), listAccounts(db, user.id, true), getHousehold(user.id)]);
  const today = todayIn();
  if (!tx) {
    // The partner's fact, when it is shared with me: read-only, through the same projection.
    if (!household?.partner) notFound();
    return <PartnerTransaction id={id} partnerId={household.partner.userId} partnerName={household.partner.name} today={today} />;
  }
  const account = accounts.find((a) => a.id === tx.account_id);
  const editableFacts = tx.source !== "pluggy";

  return (
    <div className="grid gap-4">
      <PageHeader title="Movimentação" back={`/monthly/${tx.transaction_date.slice(0, 7)}`} />
      {household?.partner ? (
        <TxPrivacySection
          tx={tx}
          partnerName={household.partner.name}
          accountVisibility={account?.visibility ?? null}
          tagName={tx.tag_id ? tags.find((t) => t.id === tx.tag_id)?.name ?? null : null}
          today={today}
          meColor={household.me.color}
        />
      ) : null}
      <Card className="text-center">
        <Amount cents={tx.amount_cents} type={tx.type} className="text-3xl" />
        <p className="mt-2 font-medium">{transactionLabel(tx)}</p>
        <p className="text-sm text-muted-foreground">{formatDayLabel(tx.transaction_date)}{account ? ` · ${account.name}` : ""}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {SOURCE_LABEL[tx.source] ?? tx.source}
          {tx.category_source ? ` · tag definida ${CATEGORY_LABEL[tx.category_source] ?? tx.category_source}` : ""}
        </p>
        {tx.provider_description && tx.user_description ? <p className="mt-1 text-xs text-muted-foreground">No extrato: {tx.provider_description}</p> : null}
        {tx.source === "pluggy" ? <div className="mt-2"><UpdatedAt at={await lastSyncAt([user.id])} /></div> : null}
        {!editableFacts ? <p className="mt-2 text-xs text-muted-foreground">Valor e data vêm do banco e não podem ser editados.</p> : null}
      </Card>
      <Card>
        <EditTransactionForm
          tx={{
            id: tx.id,
            description: tx.user_description ?? "",
            tagId: tx.tag_id,
            date: tx.transaction_date,
            type: tx.type,
            merchant: tx.normalized_merchant ? titleCase(tx.normalized_merchant) : null,
          }}
          tags={tags}
          editableFacts={editableFacts}
          amountText={centsToInput(tx.amount_cents)}
        />
      </Card>
      {erro ? <p role="alert" className="rounded-[10px] bg-danger-bg px-3 py-2 text-sm text-danger">{erro.slice(0, 120)}</p> : null}
      <form action={deleteTransactionAction}>
        <input type="hidden" name="id" value={tx.id} />
        <SubmitButton variant="ghost" pendingText="Excluindo…" className="w-full text-danger">
          {editableFacts ? "Excluir movimentação" : "Ocultar movimentação importada"}
        </SubmitButton>
      </form>
    </div>
  );
}

async function PartnerTransaction({ id, partnerId, partnerName, today }: { id: string; partnerId: string; partnerName: string; today: string }) {
  const { data } = await createAdminClient().from("transactions").select(TRANSACTION_COLUMNS).eq("id", id).eq("user_id", partnerId).is("deleted_at", null).maybeSingle();
  const fact = data as unknown as Transaction | null;
  if (!fact) notFound();
  const [accounts, categories] = await Promise.all([loadAccounts([partnerId]), loadCategoryNames([partnerId])]);
  const account = accounts.find((a) => a.id === fact.account_id);
  const line = projectForPartner(
    { id: fact.id, account_id: fact.account_id, amount_cents: fact.amount_cents, type: fact.type, transaction_date: fact.transaction_date, label: transactionLabel(fact), tag_id: fact.tag_id, scope: fact.scope, privacy: fact.privacy, surprise_until: fact.surprise_until, surprise_hide_amount: fact.surprise_hide_amount, free_money: fact.free_money },
    account,
    today,
  );
  if (!line) notFound();
  const category = (line.kind !== "reserved" && line.tagId ? categories.get(line.tagId)?.name : null) ?? "Outros";
  return (
    <div className="grid gap-4">
      <PageHeader title="Movimentação" back="/overview" />
      <Card className="text-center">
        <Amount cents={line.amountCents} type={line.kind === "reserved" ? "out" : line.type} className="text-3xl" />
        <p className="mt-2 font-medium">{line.kind === "reserved" ? `Compra reservada por ${partnerName}` : line.kind === "detail" ? line.label : category}</p>
        <p className="text-sm text-muted-foreground">{formatDayLabel(line.date)} · {fact.scope === "ours" ? `Nosso · lançado por ${partnerName}` : `De ${partnerName}`}</p>
        {line.kind === "detail" ? <p className="mt-1 text-xs text-muted-foreground">{category}</p> : null}
        {line.kind === "reserved" ? <p className="mt-1 text-xs text-muted-foreground">Detalhes liberados em {formatDayLabel(line.until)}</p> : null}
      </Card>
      <p className="text-center text-[13px] text-muted-foreground">Só {partnerName} pode editar este lançamento.</p>
    </div>
  );
}
