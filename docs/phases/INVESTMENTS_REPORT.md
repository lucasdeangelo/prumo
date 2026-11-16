# Investments report

Plan and decisions: [INVESTMENTS_PLAN.md](../INVESTMENTS_PLAN.md).

## Phase 0 — Real data check (2026-11-16) · PASS

- Pluggy's subscription already includes `INVESTMENTS` and `INVESTMENTS_TRANSACTIONS` on the production connections (MeuPluggy).
- Only fixed income already withdrawn (`TOTAL_WITHDRAWAL`) came back; there was no open position to test with.
- **Fields filled on those records:** invested amount, value, IR/IOF, contracted rate, issuer, dates and status.
- **Fields always empty:** profit, the return rates, code and ISIN. No movements were returned.
- **Consequences:**
  - the cost basis comes from `amountOriginal`, with movements as the fallback;
  - fixed-income detail screens cannot rely on a movement list;
  - development with open positions uses the Pluggy sandbox.

## Phase 1 — Data model and sync (2026-11-16) · PASS

### Delivered

| Area | Files | Notes |
| --- | --- | --- |
| Schema | `supabase/migrations/202611160001_investments.sql` | Tables `investments`, `investment_movements` and `investment_snapshots`. Owner-only RLS for reads, service-role writes, same-user FKs. Visibility defaults to `totals` (D2). |
| Provider | `lib/integrations/pluggy.ts` | `listInvestments` and `listInvestmentTransactions`, page-number pagination with a bound. |
| Domain | `lib/domain/investments.ts` | Provider mapping (calendar dates, cents, IR+IOF), average-cost basis, gain, regressive IR with LCI/LCA exemption, "se resgatar hoje", 12-month income, monthly average gain, asset classes and badges, goal progress with all/part links, link validation, completion month. |
| Sync | `lib/application/investments-sync.ts`, `lib/application/pluggy-sync.ts` | See the sync rules below. |

**Sync rules:**
- `syncItem` calls `syncInvestments` in an isolated `try`, so a failure there never blocks accounts and transactions.
- Provider fields are upserted by provider id; scope, visibility and include are never overwritten.
- Assets missing from the answer become `withdrawn`.
- A twin asset from a second connection of the same bank starts excluded.
- Movements are fetched for open positions, and for closed ones only the first time they are seen.
- The cost basis is computed from movements when the bank omits it.
- One snapshot per asset and day is stored, on the bank's pricing date.
- "Apagar" on disconnect soft-deletes the item's investments.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | 106 tests pass, including 19 in `tests/investments.test.ts` and 6 in `tests/investments-sync.test.ts` |
| `npm run test:db` | 4 suites pass, including the new `tests/database/investments.sql` |
| `npm run build` | pass |
| Live sync | See below. |

**What the new tests cover:**
- `tests/investments.test.ts` (domain): mapping, cost basis with partial sales, IR table, net value, income, goal progress, parts and projection.
- `tests/investments-sync.test.ts` (replay with an in-memory database):
  - running twice gives the same state;
  - one value per asset and day;
  - choices are preserved;
  - removed assets become withdrawn;
  - twins are excluded;
  - a 403 means the product is unavailable.
- `tests/database/investments.sql`: isolation, replay keys, same-tenant FKs, preserved choices, no direct writes and cascade.

**Live sync:**
- The real Pluggy answer was synced twice into the local Supabase: same rows after the second run (no duplicates), accounts and transactions untouched, withdrawn assets without snapshots.
- The local data was removed afterwards.

### Not done in this phase

- Screens came in phase 2. The migration was applied to production on 2026-11-16.
- Personal goals and the `goal_investments` table are phase 3 (only the progress math exists).

## Phase 2 — Portfolio screens on the web (2026-11-16) · PASS

### Delivered

| Area | Files | Notes |
| --- | --- | --- |
| Portfolio | `app/(app)/investments/page.tsx` | Meu and Nosso through the space switcher. See the details below. |
| Asset detail | `app/(app)/investments/[id]/page.tsx` | Fixed-income and variable-income variants, movements, owner choices and the bank's update date. See the details below. |
| Reading and privacy | `lib/application/investments.ts`, `lib/domain/investments.ts` | The partner's view is projected on the server (`partnerInvestmentsView`). See the details below. |
| Chart | `components/charts/investment-evolution.tsx` | Value line over a light fill, invested as a dashed line, with legend and hover tooltip. Red line when the asset is at a loss, as in the design. |
| Navigation (D1) | `components/app/bottom-nav.tsx`, Início | Investimentos replaces Ajustes in the bottom bar; Ajustes opens from a gear on Início. |
| Connections | `app/(app)/settings/connections/[itemId]/page.tsx` | Lists the connection's investments with "Trazer" / "Não trazer". |

**Portfolio page:**
- **Meu:** patrimony with gain or loss, invested, gains and losses.
- **Nosso:** patrimony, invested, this month's yield and income over 12 months.
- **Both spaces:**
  - evolution chart (6M, 1A, Tudo) from the daily snapshots;
  - "Onde está" by asset class;
  - list with a Renda fixa / Variável filter in Nosso;
  - withdrawn assets grouped apart.
- A chip on Meu says what the partner sees.
- "Fora do Nosso" shows each person's total, only as far as the partner allows.

**Asset detail:**
- **Fixed income:** reported or estimated income tax, "se resgatar hoje", average monthly yield, contracted rate and maturity.
- **Variable income:** average price, quote, 12-month income, result with income and the no-advice note.
- **Movements:** listed when the bank sends them; otherwise "Aplicado em …" (D3).
- **No action buttons** (D4).
- **Owner choices:** Meu/Nosso, what the partner sees, and "não trazer".
- **Footer:** the bank's update date.

**Reading and privacy:**
- Owners see everything they own.
- The partner sees:
  - Nosso assets in full;
  - "Com detalhes" assets as lines;
  - "Só o total" assets only inside a total;
  - nothing of "Só eu vejo" assets.
- A private or foreign asset returns 404, even by direct URL.

**Asset-class colors:** checked with the dataviz palette validator; every pair is apart for color-blind readers. The brand green is darker than the band and the gold has low contrast, so each segment also carries its name, value and share.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | pass |
| `npm test` | 111 tests pass, including 5 new portfolio tests (summary, the private asset never reaching the partner, series carry-forward, chart dates, month yield) |
| `npm run build` | pass |
| Browser, local Supabase with fictional data | See below. |

**Checked in the browser:**
- Meu and Nosso totals match the seeded values.
- The partner's private asset is absent from Nosso and its URL returns 404.
- The partner's "Com detalhes" asset is listed.
- The chart and its tooltip work.
- The stock detail matches the design numbers (result with income −R$ 190,20 · −7,46%).
- The CDB shows the estimated IR at 20% (259 days held).
- The visibility choice saves and reverts.
- At 375 px there is no horizontal scroll.

## Phase 3 — Personal goals and investment links (2026-11-16) · PASS

### Delivered

| Area | Files | Notes |
| --- | --- | --- |
| Schema | `supabase/migrations/202611170001_goal_investments.sql` | `goals.scope` and the `goal_investments` table. See the details below. |
| Progress | `lib/application/couple-data.ts`, `lib/application/goal-links.ts` | `goalsOverview` adds the linked value of today to deposits and splits it into put in and earned. |
| Rules | `lib/application/plans.ts`, `lib/domain/investments.ts` | Personal goals, deposits measured with links, linking and unlinking, and milestones from investments. |
| Screens | See the list below. | |

**Schema:**
- `goals.scope` is `ours` (default, existing goals) or `mine`. A personal goal stays in the owner's household and is readable only by its creator, through `can_see_goal()` in every goal policy.
- `goal_investments` links an asset to a goal, whole (`all`) or as a part (`part` with `part_cents`). It is readable by whoever sees the goal, and written only by the service role.

**Progress:**
- `goalsOverview` without an owner returns the couple's goals; with `ownerId`, that person's goals.
- `findGoal` returns either kind.
- Per person, the split follows who owns each asset.

**Rules:**
- **Personal goals:** no invite and no confirmation; notices go only to the owner.
- **Deposits:** measured against deposits plus links.
- **Links:** the owner links one of their own assets to a goal they can see.
  - "Tudo" excludes other goals.
  - Parts together stay within the value today.
- **Milestones from investments** (`newMilestones`):
  - checked after each sync and after linking;
  - recorded once and never taken back;
  - only the highest one is announced.
- **Sharing:** an asset counting for a couple goal becomes visible to the partner, as "Com detalhes".

**Screens:**
- **New goal:** a "De quem é" choice (Minha / Do casal); `?de=meu` opens it as personal.
- **Goal detail (InvMeta):** the bar splits put in and earned, plus linked investments with owner and part, and "Vincular investimento". It warns that linked assets already count.
- **Investment chooser:** `/couple/goals/[id]/investments`.
- **Link screen (InvVincular):** `/investments/[id]/link`.
  - lists "Minhas metas" and "Metas do casal";
  - offers Tudo or Uma parte;
  - warns before sharing with the partner;
  - shows "Já conta para" with "Tirar da meta".
- **Asset detail:** a goal card with progress, "Trocar", and a note when the asset matures before the goal's deadline. Without a goal, the owner sees "Sem meta · Vincular".
- **Portfolio:**
  - "Minhas metas" cards on Meu;
  - "Por meta" with "Sem meta" on Nosso;
  - goal chips on every asset ("Meta do casal · …", "Minha meta · …", "Sem meta · vincular").
- **Goals list:** a "Só minhas" section.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | pass |
| `npm test` | 113 tests pass, including milestones recorded once and couple-goal sharing |
| `npm run test:db` | 5 suites pass, including the new `goal_investments.sql`. See the details below. |
| `npm run build` | pass |
| Browser, local Supabase | See below. |

**`goal_investments.sql` covers:**
- the partner never sees a personal goal, its members, deposits, milestones or links;
- an outsider sees nothing;
- link shape checks;
- no direct writes;
- the cascade on asset removal.

**Checked in the browser (local Supabase):**
- Created a personal goal and linked a Tesouro whole: put in R$ 8.000 + earned R$ 940.
- A part larger than the asset was refused with a clear message; a valid part of a stock was accepted (goal 19%, earned includes the stock's loss share).
- "Tudo" on an asset already partly linked was refused.
- The couple-goal share warning shows.
- Nosso "Por meta" matches the design line ("1 investimento · 62% de R$ 10.000 · +R$ 400 rendidos").
- The personal goal does not appear in Nosso.

**Found while testing:**
- A `CHECK` with `part_cents > 0` let a NULL part through; it is now `part_cents is not null and part_cents > 0`.
- The dev server needed a restart to pick up a server action added while it ran.
