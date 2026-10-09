# Phase 2 Report

## Scope

Database schema, constraints, indexes, RLS, and tenant-isolation tests only. No authentication UI, backend financial operation, Pluggy sync, bot, or remote database deployment was implemented.

## Implemented

- Created one atomic, versioned migration for all 15 planned tables. It includes same-user composite foreign keys, non-cascading ledger relationships, positive-cent checks, provider identity indexes, idempotency/dedupe constraints, `updated_at` triggers, explicit grants, and RLS enabled and forced on every table.
- Restricted authenticated access to SELECT on user-readable data. Financial writes remain unavailable until audited application operations are implemented. Internal webhook, idempotency, and outbox tables have no user-facing policies.
- Added local Supabase CLI configuration, an intentionally empty seed, and an isolated PostgreSQL test runner. Test fixtures use fictional users A and B.
- Preserved the pre-existing `.env.example` change made outside this phase; it was not staged or committed.

## Files changed

`supabase/migrations/202610090001_initial_finance_schema.sql`, `supabase/config.toml`, `supabase/seed.sql`, `supabase/.gitignore`, `tests/database/bootstrap.sql`, `tests/database/compose.yaml`, `tests/database/tenant_isolation.sql`, `scripts/test-db.mjs`, `package.json`, `package-lock.json`, `README.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `SECURITY_MODEL.md`, `IMPLEMENTATION_PLAN.md`, and this report.

## Database changes

The migration was applied only to a disposable PostgreSQL 16 instance and the official local Supabase PostgreSQL 17 database. No remote Supabase project was linked or altered. New roles/Auth stubs in `bootstrap.sql` exist only in the disposable test container. Supabase local Auth provided its real `auth.uid()` for the second test run.

## Tests executed

| Check | Result |
| --- | --- |
| Clean migration on PostgreSQL 16 | PASS |
| `npm run test:db` | PASS; A/B isolation, ownership FKs, history preservation, dedupe |
| `npx supabase db start --yes` | PASS; applied migration and empty seed on local Supabase PostgreSQL 17 |
| Same A/B SQL against local Supabase Auth/PostgreSQL 17 | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS; 3 unit tests |
| `npm run build` | PASS |
| `npm audit --omit=dev` | PASS; 0 production dependency vulnerabilities |
| Upgrade from a prior schema version | NOT APPLICABLE; this is the first migration |

The first disposable-database test detected that an earlier local application still had direct write grants. That disposable container was recreated, the final migration reapplied, and the full tests passed. This was not a remote database or deployed migration.

## Results

The required A/B test verifies that A cannot SELECT, UPDATE, DELETE, or INSERT pretending to be B for accounts, Pluggy Items, transactions, tags, tag rules, upcoming bills, subscriptions, alerts, and WhatsApp links. It also checks profiles, subscription history, audit reads, hidden internal tables, cross-tenant FKs, transaction persistence after account deletion, subscription history retention, and uniqueness for repeated provider facts, webhooks, and outbox notifications. The test temporarily grants DML inside a transaction to exercise RLS, then rolls back. Production grants remain read-only.

## Security checks

All 15 tables have RLS enabled and forced. User-readable policies derive tenant identity from `auth.uid()`. Composite FKs prevent links to another tenant's account, tag, item, transaction, or subscription. No browser service-role client was added. Supabase local config disables automatic table exposure. `service_role` still bypasses RLS by design; future backend paths must verify ownership explicitly.

## Known limitations

No remote Supabase migration or live user authentication was tested. The test uses direct SQL role/JWT simulation rather than a complete signup/login HTTP flow. Direct authenticated mutations are intentionally blocked, so Phases 3–15 must introduce controlled writes with audit and ownership checks. Provider ID scope and webhook payloads await current Pluggy documentation in Phase 10. `alerts.reference_id` is polymorphic and requires explicit same-user validation before use. Legal retention/deletion policy and backup/restore are not complete.

## Technical debt

The development-only `braces` advisory from Phase 1 remains open; production dependency audit is clean. The local Supabase CLI requires Docker and stores a local backup when stopped. `supabase/config.toml` is local-development configuration, not production credentials. Default category tags will be created during Phase 3 onboarding.

## Pending items

Phase 3: email/password Auth, session refresh, protected routes, profile/onboarding creation, and tags. Before enabling any financial write, add its domain transaction and audit behavior and review the corresponding RLS grants. Never deploy the local test bootstrap to a real Supabase project.

## Final status

**PASS for Phase 2 local database and tenant-isolation gates.** No remote migration, authentication flow, or production security approval is claimed.
