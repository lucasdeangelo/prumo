# Data model proposal

## Conventions

All schema changes use numbered, immutable Supabase SQL migrations. UUIDs identify internal records. User-owned rows carry `user_id`; composite foreign keys or equivalent database triggers ensure referenced rows belong to the same user. Application authorization and RLS are additional layers. `created_at` and `updated_at` use `timestamptz`; calendar dates use `date`. Amounts and balances use `BIGINT` cents. Source payloads, secrets, and bank credentials are not retained by default.

The master's table list is the baseline: `profiles`, `pluggy_items`, `accounts`, `tags`, `tag_rules`, `transactions`, `upcoming_bills`, `subscriptions`, `subscription_history`, `alerts`, `whatsapp_links`, `webhook_events`, `idempotency_keys`, `audit_logs`, and `notification_outbox`. Do not treat the proposed shape as an applied schema; no migration exists yet.

## Relationships and corrections needed before migration

| Area | Proposed constraint and behavior | Reason |
| --- | --- | --- |
| Profiles | `profiles.id` references `auth.users.id`; account deletion uses a separate explicit retention/deletion workflow | `ON DELETE CASCADE` from auth to ledger-related rows would silently erase history |
| Ownership | Add `UNIQUE(user_id, id)` on referenced user-owned tables and composite `(user_id, foreign_id)` FKs, or validated triggers where composite FKs are impractical | A valid ID from another tenant must not be linkable |
| Accounts and Items | `accounts.pluggy_item_id ON DELETE SET NULL`; archive/disconnect instead of deleting; retain account row when needed for history | Keeps ledger context |
| Transactions | `account_id ON DELETE SET NULL`; provider transaction ID unique per provider/appropriate account scope; partial unique index for non-null external identity; `deleted_at` for user-visible removal | Prevents duplicate import without assuming IDs are globally unique |
| Provider fields | Keep immutable provider description/amount/date and separate user metadata override where edits are allowed | Sync must not silently overwrite user edits or hide provider facts |
| Upcoming | `matched_transaction_id` nullable and same-user; unique active link to one transaction where business rules require it; paid transition atomic | One fact cannot settle unrelated bills accidentally |
| Subscriptions | Soft delete/cancel; `subscription_history.subscription_id` must not cascade-delete financial history | Preserves charge history |
| Tags/rules | Same-user tag reference; restrict deletion while referenced or null out historical category with an audit trail | Avoids cross-tenant tagging and lost context |
| Webhooks | Unique `(provider, external_event_id)` when ID exists; otherwise documented stable fingerprint with collision window; never store raw sensitive payload in ordinary logs | Supports dedupe and privacy |
| Idempotency | Scope must include tenant or trusted external provider namespace; unique normalized `(scope, idempotency_key)`; request hash mismatch returns conflict | Prevents cross-user key collision and replay with changed intent |
| Outbox | Unique non-null `dedupe_key` in appropriate tenant/channel scope; claim/lease and retry fields | Multiple schedulers cannot enqueue/send duplicates |
| WhatsApp | Partial uniqueness of active verified normalized phone; hashed code, expiry, attempt count, and revocation | Prevents phone takeover and reuse |
| Audit | Append-only access via trusted service/database routine; sanitized metadata and retention policy | Audit cannot be silently rewritten |

Additional fields may be needed for safe operation, especially `provider`, external account scope, sync timestamp, immutable provider values, verification attempts, outbox lease/retry timestamps, and explicit event fingerprints. Introduce them in Phase 2 migrations only after naming and constraints are tested. Avoid a global `UNIQUE(pluggy_account_id)` or `UNIQUE(pluggy_transaction_id)` without verifying provider identity scope in current Pluggy documentation.

## Proposed migration order

1. Extensions and shared database helpers: UUID support, `updated_at` handling, safe ownership helper if needed.
2. `profiles`, `pluggy_items`, `accounts`, `tags`, `tag_rules` with ownership constraints.
3. `transactions`, indexes, provider identity constraints, immutable/provider metadata approach.
4. `upcoming_bills`, `subscriptions`, `subscription_history`, and same-user relationship constraints.
5. `alerts` and `whatsapp_links`.
6. `webhook_events`, `idempotency_keys`, `audit_logs`, and `notification_outbox`.
7. RLS enablement, policies, grants, and any controlled routines. RLS ships in the same Phase 2 release as tables; no user-owned table is exposed between migrations.
8. Seed default tags through a user creation routine or idempotent onboarding, never production demo transactions.

This order is logical; versioned files may split it differently to satisfy FK dependencies. Once applied, corrections require new migrations. Production changes follow expand, migrate, verify, contract when data already exists. Test a clean install and upgrade path before release.

## Indexes and checks to validate in Phase 2

At minimum: `transactions(user_id, transaction_date DESC)`, account/date and tag/date variants, `upcoming_bills(user_id, due_date)`, `subscriptions(user_id, status)` and normalized name, `audit_logs(user_id, created_at DESC)`, and `notification_outbox(status, scheduled_for)`. Prefer partial indexes for active/non-null rows. Check `amount_cents > 0`, supported enum-like values, confidence from 0 to 1, recurrence intervals greater than zero, and sane notification offsets. Decide whether `NUMERIC(4,3)` permits the desired `1.000` bound and enforce it explicitly.

## Financial state transitions

`markUpcomingBillAsPaid` locks the bill, returns the existing result when already paid, searches compatible facts, links one if appropriate, otherwise creates one manual fact, then records audit in the same transaction. Reconciliation locks both sides and uses a unique relation to make repeated runs converge. Subscription recurrence generation uses a stable key such as subscription ID plus scheduled due date. A cancelled subscription stops future forecasts but leaves existing facts/history. Precise recurrence semantics, month-end anchoring, and configurable matching thresholds are specified and tested in their implementation phases.
