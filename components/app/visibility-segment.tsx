import { setVisibilityAction } from "@/app/(app)/couple-actions";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "private", label: "Só eu" },
  { value: "totals", label: "Totais" },
  { value: "details", label: "Detalhes" },
] as const;

/** Three-way choice per account (Só eu · Totais · Detalhes). Submits on tap; no notice to the partner. */
export function VisibilitySegment({ accountId, value, returnTo, accountName }: { accountId: string; value: "private" | "totals" | "details"; returnTo: string; accountName: string }) {
  return (
    <form action={setVisibilityAction} className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1" aria-label={`O que seu par vê de ${accountName}`}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="submit"
            name="visibility"
            value={option.value}
            aria-pressed={active}
            className={cn("min-h-10 rounded-full text-[13px] font-medium transition", active ? "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(18,21,18,0.1)]" : "text-muted-foreground hover:text-foreground")}
          >
            {option.label}
          </button>
        );
      })}
    </form>
  );
}
