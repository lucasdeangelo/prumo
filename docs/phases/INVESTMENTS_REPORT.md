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

## Phase 4 — Manual investments and estimates (2026-11-16) · PASS

### Delivered

| Area | Files | Notes |
| --- | --- | --- |
| Public rates | `supabase/migrations/202611180001_market_rates.sql`, `lib/integrations/bcb.ts`, `lib/application/market-rates.ts` | Banco Central SGS series, stored in `market_rates` (server-only). See the details below. |
| Valuation | `lib/domain/fixed-income.ts` | See the rules below. |
| Manual investments | `lib/application/manual-investments.ts`, `app/(app)/investments/manual-actions.ts` | Create, record movements, change a price, delete, and revalue every day. See the details below. |
| Screens | See the list below. | |

**Public rates:**
- Series used: CDI 12, Selic 11, IPCA 433, IPCA 12 months 13522.
- History is fetched since 2018 the first time, then only new days, at most once an hour per process.
- When the Banco Central fails, the stored rates are used.

**Valuation rules:**
- **Accrual:** once per business day.
  - % of the CDI or of the Selic, by the day's rate;
  - Prefixado: (1 + rate)^(1/252);
  - IPCA+: the month's IPCA spread over its weekdays, plus the real rate.
- **Holidays:** the weekdays without a published CDI.
- **Days not published yet:** use the last known rate.
- **Movements:** deposits earn from their day, withdrawals leave on their day.
- **Maturity estimate:** today's rates (IPCA from the last 12 months), net of the regressive income tax for the whole period; LCI and LCA are exempt.

**Manual investments:**
- **Create:** kinds are CDB, Tesouro, LCI/LCA, stocks, real-estate funds, ETFs, funds and crypto. Creating one writes the first BUY, values the asset and can link it to a goal.
- **Movements:**
  - aporte and resgate for fixed income and funds;
  - compra and venda for quoted assets;
  - a new quote, or a new total for funds.
- **Validation:** a withdrawal above today's value, or a sale above the quantity held, is refused.
- **Fully sold:** the asset becomes withdrawn.
- **Delete:** soft delete, which also removes the asset's goal links.
- **Daily revaluation:** runs with the 15-minute sync cron, and the work happens once a day per asset. Each run also writes the day's snapshot.

**Screens:**
- `/investments/new` (InvNovo): "Importar do banco ou da corretora", the type grid, De quem é, institution, amount and date (or code, quantity and price), the yield (% do CDI, Selic for Tesouro, Prefixado or IPCA+) with maturity, and an optional goal. A live estimate reads "vira ≈ R$ X em <mês>, já descontado o IR".
- `/investments/[id]/movement`: the movement form, only for manual assets.
- **Asset detail:**
  - movement buttons on manual assets (D4);
  - "Apagar este investimento" on manual assets;
  - a maturity estimate for any open fixed income with a contract, connected or manual;
  - a footer that says where the value comes from.
- **Portfolio:** a "+" in the header and "Cadastrar à mão" in the empty state.

**Not done:**
- Automatic quotes for stocks, real-estate funds, ETFs and crypto, the optional part of D5. The person updates the price; the screen says so.
- The 1-year quote chart of InvAcao, which needs that provider.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | pass |
| `npm test` | 123 tests pass, including 10 in `tests/fixed-income.test.ts` (CDI with holidays, unpublished days, prefixado over 252 days, withdrawals, IPCA+, maturity estimate with IR and LCI exemption) |
| `npm run test:db` | 5 suites pass; `market_rates` is not readable by clients |
| `npm run build` | pass |
| Local Supabase with real Banco Central rates | See below. |

**Checked on the local Supabase, with real Banco Central rates:**
- **CDB:** R$ 3.000 at 110% of the CDI since 01/06/2026 is worth R$ 3.204,94 on 16/11 (about 15% a year).
- **Deposit:** a deposit added exactly.
- **Withdrawal:** one above the value was refused.
- **Crypto:**
  - it is valued at quantity × price, and a new quote revalued it;
  - a sale above the quantity was refused;
  - a full sale closed it.
- **Daily job:** a second run did no work.
- **Browser:** the form estimate showed ≈ R$ 3.291,14 for the same CDB held to 15/03/2027.
- **Found:** a manual asset without movements would have been zeroed by the daily revaluation; it is now left as it is.

## Phase 5 — Investments and goals in the app, version 2.0.0 (2026-11-16) · PASS

### Delivered

| Area | Files | Notes |
| --- | --- | --- |
| Mobile API | `lib/mobile/screens/investments.ts`, `lib/mobile/screens/index.ts`, `lib/mobile/actions.ts` | New screens and six actions. See the details below. |
| Shared labels | `lib/domain/investments.ts` | `describeAsset`, `rateText` and `goalChip` moved to the domain, so the web and the app word assets and goal chips the same way. |
| App screens | `mobile/src/app/(app)/investments/*`, `mobile/src/ui/investments.tsx`, `mobile/src/app/(app)/couple/goals/*` | See the list below. |
| Version | `mobile/app.json` | 2.0.0, versionCode 4. |

**Mobile API:**
- **New screens:**
  - `investments`, `investments/new`, `investments/:id`, `investments/:id/link` and `investments/:id/movement`;
  - `couple/goals/:id/investments`.
- **Updated goal screens:**
  - `couple/goals` has a personal list;
  - `couple/goals/new` accepts `?de=meu`;
  - `couple/goals/:id` finds personal goals and includes the linked assets, put in and earned.
- **New actions:** `investmentPreference`, `linkInvestment`, `unlinkInvestment`, `createManualInvestment`, `recordMovement` and `deleteManual`.

**App screens:**
- **Navigation:** the Investimentos tab replaces Ajustes, which opens from a gear on Início (D1).
- **Portfolio (Meu and Nosso):**
  - patrimony;
  - an evolution chart where tapping a point reads it;
  - "Onde está";
  - "Minhas metas" on Meu and "Por meta" on Nosso;
  - assets with goal chips, a filter in Nosso, and withdrawn assets grouped apart;
  - "Fora do Nosso".
- **Asset detail:** lines, goal cards, the link card, manual movement buttons, owner choices, and delete or "não trazer".
- **Link screen:** link to a goal, whole or as a part.
- **Movement form:** aporte, resgate, compra, venda, a new quote or a new total.
- **New investment:** the type grid, and a maturity estimate computed on the device with the shared domain code.
- **Goals:** "De quem é" when creating a goal, a "Só minhas" list, and on the goal screen the linked investments plus the put-in and earned bar.

### Gates

| Gate | Result |
| --- | --- |
| Web: `npm run typecheck`, `npm run lint`, `npm test` | pass, 123 tests |
| App: `npm run typecheck`, `npm run lint` | pass |
| Mobile API on the local Supabase | See below. |
| APK | Release build 2.0.0, arm64. |

**Mobile API on the local Supabase (fictional data):**
- Every new screen loader answered with the expected shape: the stock detail lines, the goal cards, the link options, the movement kind, and today's Banco Central rates on "Novo investimento".
- The personal goal shows its linked assets, put in and earned.
- **Signed in as the partner:** the personal goal is absent from the goal list and its URL fails; the private fund and the other person's "Meu" assets never appear.
