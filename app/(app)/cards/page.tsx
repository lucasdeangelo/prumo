import Link from "next/link";

import { Amount, PageHeader } from "@/components/app/bits";
import { CardIcon } from "@/components/app/icons";
import { Card, EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/repositories/reads";

export const metadata = { title: "Cartões · Prumo" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Navigation entry from the design. For now it lists connected credit cards; invoices come later. */
export default async function CardsPage() {
  const { user, db } = await requireUser();
  const cards = (await listAccounts(db, user.id)).filter((a) => a.type === "CREDIT");

  return (
    <div className="grid gap-4">
      <PageHeader title="Cartões" />
      {cards.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {cards.map((card) => (
            <li key={card.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <CardIcon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium capitalize">{card.name}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {card.balance_synced_at ? `Atualizado em ${dateTime.format(new Date(card.balance_synced_at))}` : "Sem atualização"}
                </span>
              </span>
              {card.balance_cents !== null ? (
                <span className="flex flex-col items-end">
                  <span className="label-mono">Fatura</span>
                  <Amount cents={Math.abs(card.balance_cents)} className="text-[15px]" />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nenhum cartão conectado">
          Conecte seu banco em <Link href="/settings">Ajustes</Link> para ver os cartões de crédito aqui.
        </EmptyState>
      )}
      <Card className="bg-transparent">
        <p className="text-sm text-muted-foreground">Fatura detalhada e divisão de compras chegam numa próxima versão. As compras do cartão já aparecem em <Link href="/monthly">Mês</Link>.</p>
      </Card>
    </div>
  );
}
