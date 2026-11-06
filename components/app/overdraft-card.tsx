import Link from "next/link";

import type { AccountOverdraft } from "@/lib/application/overdraft";
import { formatDayShort } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";

/** "Cheque especial" in a month: days below zero, lowest point and what it cost. */
export function OverdraftCard({ items, monthLabel }: { items: AccountOverdraft[]; monthLabel: string }) {
  if (items.length === 0) return null;
  return (
    <section className="grid gap-2">
      {items.map((o) => (
        <Link
          key={o.account.id}
          href={`/accounts/${o.account.id}`}
          className="grid gap-2 rounded-2xl border border-border bg-card p-5 text-foreground no-underline hover:text-foreground"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="label-mono">Cheque especial · {o.account.institution ?? o.account.name}</span>
            {o.negativeDays > 0 ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{o.negativeDays} {o.negativeDays === 1 ? "dia" : "dias"}</span> : null}
          </div>
          {o.negativeDays > 0 ? (
            <p className="text-[15px]">
              Em {monthLabel} a conta ficou negativa por {o.negativeDays} {o.negativeDays === 1 ? "dia" : "dias"}. Menor saldo:{" "}
              <span className="tabular font-medium">{formatBRL(o.lowestCents)}</span>
              {o.lowestDate ? ` em ${formatDayShort(o.lowestDate)}` : ""}.
            </p>
          ) : (
            <p className="text-[15px]">Em {monthLabel} a conta não fechou nenhum dia negativa.</p>
          )}
          <dl className="grid grid-cols-2 gap-2 text-[13px]">
            <div>
              <dt className="text-muted-foreground">Juros e IOF no mês</dt>
              <dd className="tabular font-medium">{formatBRL(o.chargesCents)}</dd>
            </div>
            {o.account.overdraft_limit_cents !== null ? (
              <div>
                <dt className="text-muted-foreground">Limite hoje</dt>
                <dd className="tabular font-medium">
                  {formatBRL(o.account.overdraft_used_cents ?? 0)} usados de {formatBRL(o.account.overdraft_limit_cents)}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="text-[12px] text-muted-foreground">Saldo de cada dia calculado a partir do saldo de hoje e das movimentações do banco.</p>
        </Link>
      ))}
    </section>
  );
}
