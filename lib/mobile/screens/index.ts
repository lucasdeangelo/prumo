import "server-only";

import * as cards from "./cards";
import * as core from "./core";
import * as couple from "./couple";
import * as settings from "./settings";

type Loader = (params: Record<string, string>, search: Record<string, string>) => Promise<unknown>;

/** Web route patterns, in the same shape as app/(app). ":name" captures one segment. */
const ROUTES: Array<[string, Loader]> = [
  ["overview", core.overview],
  ["monthly/:month", core.monthly],
  ["transactions/new", core.newTransaction],
  ["transactions/:id", core.transaction],
  ["transactions/:id/surprise", core.surprise],
  ["upcoming", core.upcoming],
  ["upcoming/new", core.newBill],
  ["upcoming/:id", core.bill],
  ["subscriptions", core.subscriptions],
  ["subscriptions/new", core.newSubscription],
  ["accounts/:id", core.account],
  ["help/updates", core.helpUpdates],
  ["cards", cards.cards],
  ["cards/:id/batch", cards.cardBatch],
  ["cards/:id/settle", cards.cardSettle],
  ["cards/:id/split", cards.cardSplit],
  ["connect", settings.connect],
  ["settings", settings.settings],
  ["settings/accounts", settings.manualAccounts],
  ["settings/connections", settings.connections],
  ["settings/connections/:itemId", settings.connection],
  ["settings/connections/:itemId/disconnect", settings.disconnect],
  ["settings/tags", settings.tags],
  ["settings/whatsapp", settings.whatsapp],
  ["couple", couple.couple],
  ["couple/approvals", couple.approvals],
  ["couple/approvals/new", couple.newApproval],
  ["couple/approvals/:id", couple.approval],
  ["couple/budget", couple.budget],
  ["couple/budget/setup", couple.budgetSetup],
  ["couple/free-money", couple.freeMoney],
  ["couple/goals", couple.goals],
  ["couple/goals/new", couple.newGoal],
  ["couple/goals/:id", couple.goal],
  ["couple/goals/:id/milestone/:pct", couple.milestone],
  ["couple/retro/:month", couple.retro],
  ["privacy/preview", couple.privacyPreview],
  ["privacy/rules", couple.privacyRules],
  ["privacy/visibility", couple.privacyVisibility],
];

export function matchScreen(path: string[]): { load: Loader; params: Record<string, string> } | null {
  // Literal segments win over ":param" ones ("transactions/new" before "transactions/:id").
  let best: { load: Loader; params: Record<string, string>; score: number } | null = null;
  for (const [pattern, load] of ROUTES) {
    const parts = pattern.split("/");
    if (parts.length !== path.length) continue;
    const params: Record<string, string> = {};
    let score = 0;
    let ok = true;
    parts.forEach((part, i) => {
      if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(path[i]);
      else if (part === path[i]) score++;
      else ok = false;
    });
    if (ok && (!best || score > best.score)) best = { load, params, score };
  }
  return best;
}
