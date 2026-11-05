import { Landmark, MessageCircle, PenLine, Sparkles } from "lucide-react";
import Link from "next/link";

import { Amount, TagDot } from "@/components/app/bits";
import { formatDayLabel } from "@/lib/domain/dates";
import { groupByDay } from "@/lib/domain/summary";
import { transactionLabel, type Tag, type Transaction } from "@/lib/types";

const SOURCE_ICON: Record<string, { icon: typeof Landmark; label: string }> = {
  pluggy: { icon: Landmark, label: "Banco" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp" },
  manual: { icon: PenLine, label: "Manual" },
  upcoming_reconciliation: { icon: PenLine, label: "Conta paga" },
};

export function TransactionList({ transactions, tags, grouped = true }: { transactions: Transaction[]; tags: Tag[]; grouped?: boolean }) {
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const groups = grouped ? groupByDay(transactions) : [{ date: "", items: transactions }];

  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <div key={group.date || "all"}>
          {group.date ? <h3 className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{formatDayLabel(group.date)}</h3> : null}
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {group.items.map((tx) => {
              const tag = tx.tag_id ? tagById.get(tx.tag_id) : undefined;
              const origin = SOURCE_ICON[tx.source] ?? SOURCE_ICON.manual;
              const OriginIcon = origin.icon;
              const autoTagged = tx.category_source && tx.category_source !== "user" && !tx.is_reviewed;
              return (
                <li key={tx.id}>
                  <Link href={`/transactions/${tx.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2.5 hover:bg-muted/60">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground" title={origin.label}>
                      <OriginIcon aria-hidden="true" className="size-4" />
                      <span className="sr-only">{origin.label}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{transactionLabel(tx)}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <TagDot color={tag?.color} />
                        <span className="truncate">{tag?.name ?? "Sem tag"}</span>
                        {autoTagged ? <Sparkles aria-label="Tag automática" className="size-3 shrink-0" /> : null}
                      </span>
                    </span>
                    <Amount cents={tx.amount_cents} type={tx.type} className="text-sm" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
