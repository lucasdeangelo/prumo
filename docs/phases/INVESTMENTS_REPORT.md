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

- The migration is not applied to production yet.
- There are no screens yet; they come in phase 2.
- Personal goals and the `goal_investments` table are phase 3 (only the progress math exists).
