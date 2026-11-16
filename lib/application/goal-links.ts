import "server-only";

import type { GoalLink } from "@/lib/domain/investments";
import { createAdminClient } from "@/lib/supabase/admin";

export type LinkedAsset = GoalLink & { investmentId: string; goalId: string };

/**
 * Investments counting for these goals, valued today. Assets the owner chose not to bring or
 * removed do not count; withdrawn ones are kept here and dropped by goalProgress.
 */
export async function loadGoalLinks(goalIds: string[]): Promise<LinkedAsset[]> {
  if (goalIds.length === 0) return [];
  const admin = createAdminClient();
  const { data: links } = await admin.from("goal_investments").select("goal_id, investment_id, mode, part_cents").in("goal_id", goalIds);
  const ids = [...new Set((links ?? []).map((l) => l.investment_id as string))];
  if (ids.length === 0) return [];
  const { data: assets } = await admin
    .from("investments")
    .select("id, user_id, amount_cents, invested_cents, status")
    .in("id", ids)
    .eq("include", true)
    .is("deleted_at", null);
  const byId = new Map((assets ?? []).map((a) => [a.id as string, a]));
  return (links ?? []).flatMap((l) => {
    const a = byId.get(l.investment_id as string);
    if (!a) return [];
    return [
      {
        goalId: l.goal_id as string,
        investmentId: a.id as string,
        mode: l.mode as "all" | "part",
        partCents: (l.part_cents as number | null) ?? null,
        ownerId: a.user_id as string,
        amountCents: a.amount_cents as number,
        investedCents: (a.invested_cents as number | null) ?? null,
        status: a.status as GoalLink["status"],
      },
    ];
  });
}

export type AssetGoal = { goalId: string; name: string; scope: "mine" | "ours"; ownerId: string; mode: "all" | "part"; partCents: number | null };

/** Goals each asset counts for, for the chips on the lists ("Meta do casal · Reserva"). */
export async function loadAssetGoals(investmentIds: string[]): Promise<Map<string, AssetGoal[]>> {
  const out = new Map<string, AssetGoal[]>();
  if (investmentIds.length === 0) return out;
  const admin = createAdminClient();
  const { data: links } = await admin.from("goal_investments").select("goal_id, investment_id, mode, part_cents").in("investment_id", investmentIds);
  const goalIds = [...new Set((links ?? []).map((l) => l.goal_id as string))];
  if (goalIds.length === 0) return out;
  const { data: goals } = await admin.from("goals").select("id, name, scope, created_by, status").in("id", goalIds).neq("status", "archived");
  const goalById = new Map((goals ?? []).map((g) => [g.id as string, g]));
  for (const l of links ?? []) {
    const g = goalById.get(l.goal_id as string);
    if (!g) continue;
    const list = out.get(l.investment_id as string) ?? [];
    list.push({ goalId: g.id as string, name: g.name as string, scope: g.scope as "mine" | "ours", ownerId: g.created_by as string, mode: l.mode as "all" | "part", partCents: (l.part_cents as number | null) ?? null });
    out.set(l.investment_id as string, list);
  }
  return out;
}

/** Assets of these people that count for a couple goal: the partner sees them with details. */
export async function assetsInCoupleGoals(investmentIds: string[]): Promise<Set<string>> {
  const goals = await loadAssetGoals(investmentIds);
  return new Set([...goals.entries()].filter(([, list]) => list.some((g) => g.scope === "ours")).map(([id]) => id));
}
