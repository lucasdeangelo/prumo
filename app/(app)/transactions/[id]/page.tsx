import { notFound } from "next/navigation";

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
  const [tx, tags, accounts] = await Promise.all([getTransaction(db, user.id, id), listTags(db, user.id), listAccounts(db, user.id, true)]);
  if (!tx) notFound();
  const account = accounts.find((a) => a.id === tx.account_id);
  const editableFacts = tx.source !== "pluggy";

  return (
    <div className="grid gap-4">
      <PageHeader title="Movimentação" back={`/monthly/${tx.transaction_date.slice(0, 7)}`} />
      <Card className="text-center">
        <Amount cents={tx.amount_cents} type={tx.type} className="text-3xl" />
        <p className="mt-2 font-medium">{transactionLabel(tx)}</p>
        <p className="text-sm text-muted-foreground">{formatDayLabel(tx.transaction_date)}{account ? ` · ${account.name}` : ""}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {SOURCE_LABEL[tx.source] ?? tx.source}
          {tx.category_source ? ` · tag definida ${CATEGORY_LABEL[tx.category_source] ?? tx.category_source}` : ""}
        </p>
        {tx.provider_description && tx.user_description ? <p className="mt-1 text-xs text-muted-foreground">No extrato: {tx.provider_description}</p> : null}
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
      {erro ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{erro.slice(0, 120)}</p> : null}
      <form action={deleteTransactionAction}>
        <input type="hidden" name="id" value={tx.id} />
        <SubmitButton variant="ghost" pendingText="Excluindo…" className="w-full text-danger">
          {editableFacts ? "Excluir movimentação" : "Ocultar movimentação importada"}
        </SubmitButton>
      </form>
    </div>
  );
}
