import Link from "next/link";

import { TagDot } from "@/components/app/bits";
import { Money } from "@/components/app/money";

export type CategoryRow = { tagId: string | null; name: string; color: string | null; cents: number; href?: string };

/**
 * Spending by tag as labelled horizontal bars (magnitude, one hue). Each row names its tag and
 * value in text, so identity never depends on color; the dot only echoes the tag's own color.
 */
export function CategoryBars({ rows, totalCents, limit = 6 }: { rows: CategoryRow[]; totalCents: number; limit?: number }) {
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit).reduce((sum, r) => sum + r.cents, 0);
  const all = rest > 0 ? [...shown, { tagId: "rest", name: "Outras tags", color: null, cents: rest }] : shown;
  const max = Math.max(...all.map((r) => r.cents), 1);

  return (
    <ul className="grid gap-3">
      {all.map((row) => {
        const share = totalCents > 0 ? Math.round((row.cents / totalCents) * 100) : 0;
        const content = (
          <>
            <div className="mb-1 flex items-center gap-2 text-sm">
              <TagDot color={row.color} />
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <span className="tabular font-medium"><Money cents={row.cents} /></span>
              <span className="tabular w-9 text-right text-xs text-muted-foreground">{share}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted" title={row.name}>
              <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (row.cents / max) * 100)}%`, background: "var(--series-expense)" }} />
            </div>
          </>
        );
        return (
          <li key={row.tagId ?? "none"}>
            {"href" in row && row.href ? <Link href={row.href} className="block rounded-lg hover:opacity-80">{content}</Link> : content}
          </li>
        );
      })}
    </ul>
  );
}
