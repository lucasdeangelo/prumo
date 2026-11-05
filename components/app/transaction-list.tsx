import Link from "next/link";

import { Amount, TagDot } from "@/components/app/bits";
import { BankIcon, CalendarIcon, ChatIcon, SparkIcon, WalletIcon } from "@/components/app/icons";
import { formatDayLabel } from "@/lib/domain/dates";
import { groupByDay } from "@/lib/domain/summary";
import { transactionLabel, type Tag, type Transaction } from "@/lib/types";

type IconComponent = (props: { className?: string }) => React.ReactNode;

// Round tinted badge per origin, as in the "Lançamentos" component.
const SOURCE_ICON: Record<string, { icon: IconComponent; label: string }> = {
  pluggy: { icon: BankIcon, label: "Banco" },
  whatsapp: { icon: ChatIcon, label: "WhatsApp" },
  manual: { icon: WalletIcon, label: "Manual" },
  upcoming_reconciliation: { icon: CalendarIcon, label: "Conta paga" },
};

export function TransactionList({ transactions, tags, grouped = true }: { transactions: Transaction[]; tags: Tag[]; grouped?: boolean }) {
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const groups = grouped ? groupByDay(transactions) : [{ date: "", items: transactions }];

  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <div key={group.date || "all"}>
          {group.date ? <h3 className="label-mono mb-2 px-1">{formatDayLabel(group.date)}</h3> : null}
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {group.items.map((tx) => {
              const tag = tx.tag_id ? tagById.get(tx.tag_id) : undefined;
              const origin = SOURCE_ICON[tx.source] ?? SOURCE_ICON.manual;
              const OriginIcon = origin.icon;
              const autoTagged = tx.category_source && tx.category_source !== "user" && !tx.is_reviewed;
              return (
                <li key={tx.id}>
                  <Link href={`/transactions/${tx.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 text-foreground no-underline hover:bg-[#fafaf8] hover:text-foreground">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary" title={origin.label}>
                      <OriginIcon className="size-5" />
                      <span className="sr-only">{origin.label}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{transactionLabel(tx)}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <TagDot color={tag?.color} />
                        <span className="truncate">{tag?.name ?? "Sem tag"}</span>
                        {autoTagged ? <span title="Tag automática" className="inline-flex"><SparkIcon className="size-3 shrink-0" /><span className="sr-only">Tag automática</span></span> : null}
                      </span>
                    </span>
                    <Amount cents={tx.amount_cents} type={tx.type} className="text-[15px]" />
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
