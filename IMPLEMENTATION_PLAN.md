# Implementation plan

The repository starts from a Create Next App template. Build one phase per execution. Every phase closes with applicable lint, typecheck, tests, build, documentation, checklist update, and a `docs/phases/PHASE_N_REPORT.md` report. A phase is `PASS` only when its applicable gates pass; missing future gates remain pending. Do not advance automatically.

## Checklist

- [x] Phase 0 — Discovery
- [ ] Phase 1 — Foundation
- [ ] Phase 2 — Database + RLS
- [ ] Phase 3 — Auth
- [ ] Phase 4 — Transactions
- [ ] Phase 5 — Accounts
- [ ] Phase 6 — Dashboard
- [ ] Phase 7 — Monthly
- [ ] Phase 8 — Upcoming
- [ ] Phase 9 — Subscriptions
- [ ] Phase 10 — Pluggy
- [ ] Phase 11 — Reconciliation
- [ ] Phase 12 — Categorization
- [ ] Phase 13 — WhatsApp Worker
- [ ] Phase 14 — WhatsApp Agent
- [ ] Phase 15 — Notifications
- [ ] Phase 16 — Hardening
- [ ] Phase 17 — Deploy

## Sequence and acceptance gates

| Phase | Delivery | Gate beyond standard commands |
| --- | --- | --- |
| 0 | Repository inventory, architecture, data/security plan, risks | Documents reflect actual code; no product feature added |
| 1 | Strict TypeScript, UI/tooling, Vitest, Zod, env validation, Supabase clients | Clean lint/typecheck/test/build; secrets server-side |
| 2 | Versioned schema, constraints, RLS, seed strategy | A/B tenant isolation passes for every required resource; migration clean install/upgrade passes |
| 3 | Email/password auth, session, recovery, route protection, onboarding tags | Authorization and session tests pass |
| 4 | Money/domain/repository, manual transaction CRUD, filters, audit | Cent arithmetic and ledger invariant tests pass |
| 5 | Manual accounts and archive | Archiving/removal preserves transactions |
| 6 | `/overview` aggregates and mobile layout | Server-side totals, 375×667 review |
| 7 | `/monthly/[year-month]`, filters, CSV | Timezone/month boundary and export tests |
| 8 | Upcoming CRUD, recurrence, manual reconciliation/payment | Repeated payment/reconciliation creates no duplicate fact |
| 9 | Manual subscriptions, detection, history, forecasts | Repeated recurrence generation is stable |
| 10 | Pluggy sandbox connect, sync, webhook | Official contract verified; repeated sync/webhook stable; multi-account Item |
| 11 | Automatic reconciliation and confidence | Ambiguous matches require confirmation; replay stable |
| 12 | Rules, normalization, heuristics, optional AI | Manual rules win; validated low-confidence fallback |
| 13 | Isolated WhatsApp worker and secure link/bridge | Tenant ownership, replay, rate-limit, offline core checks |
| 14 | Structured finance intents | Message replay cannot duplicate writes; no arbitrary tool execution |
| 15 | Outbox scheduler, retries, dedupe | Repeated cron sends/enqueues once |
| 16 | Security and reliability audit | `SECURITY_AUDIT.md`, `PRE_DEPLOY_REPORT.md`, critical gates pass |
| 17 | Staging then production deployment | Backup/restore, secrets, HTTPS, webhook, bot persistence, operations verified |

## Test strategy

Use Vitest for pure money, recurrence, normalization, subscription detection, categorization, and reconciliation tests. Use an isolated Supabase/Postgres instance for migration, repository, RLS, same-user FK, and transaction/idempotency integration tests. Route handlers and worker bridge get boundary tests with mocked external adapters. Pluggy fixtures are fictional and based on the official contract at implementation time. Add a small browser/mobile check for core flows and accessibility at 375×667. CI runs lint, typecheck, unit/integration/security suites, and build; production credentials are never used in tests.

Financial property cases include webhook replay, sync replay, account removal preserving history, duplicate bill payment, duplicate reconciliation, repeated cron, and N-fold provider event replay. Tests must assert resulting database state, not only function return values. Do not create tests that merely mirror implementation.

## Migration and release strategy

Phase 2 adds numbered migrations in dependency order documented in [DATA_MODEL.md](DATA_MODEL.md), with RLS and grants in the same release. Never modify an applied migration. Test from an empty database and test upgrade from the preceding version. Later production changes use expand/migrate/verify/contract where needed. Keep development, staging, and production databases separate. Restore testing and retention decisions are mandatory before production.

## Known blockers for future phases

There is no Supabase project or test database configuration in this repository. Provider credentials, webhook contract, and WhatsApp hosting/session storage are also not configured. These do not block Phase 0, but Phase 2/10/13 require their respective environments or documented safe local substitutes. Before implementing Pluggy or other external adapters, read current official documentation. Financial retention and account deletion semantics require a product/legal decision before production.
