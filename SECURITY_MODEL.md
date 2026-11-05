# Security model

## Trust boundaries

The browser, WhatsApp messages, bank descriptions, webhook bodies, and AI output are untrusted input. The authenticated Supabase identity or an already verified WhatsApp link determines the user. Client-supplied `user_id` is never authority. Next.js handlers/actions validate input with Zod, authorize ownership, and call application services. Database RLS independently restricts each user-owned table. The Supabase service role, Pluggy secret, AI key, and internal API secret remain server-side.

## Tenant isolation

Enable and force RLS as appropriate on every user-data table. Direct rows use `user_id = auth.uid()` for select, update, delete, and `WITH CHECK` for insert/update. Indirect rows such as `subscription_history` use a same-user parent relation. Cross-tenant foreign keys require composite ownership constraints or secure triggers in addition to RLS. Backend repositories always filter by authenticated user, including aggregate queries. Privileged service-role code must apply explicit ownership checks because it bypasses RLS. Service role access is limited to trusted background/integration paths.

Phase 2 gate: create User A and User B in an isolated test database. For accounts, items, transactions, tags, rules, upcoming bills, subscriptions, alerts, and WhatsApp links, verify A cannot select, update, delete, or insert as B. Also test indirect references, nested reads, service-role entry points, and attempted linking to B's rows. A single leak is a blocker. Never run these tests against production.

Phase 2 result: `tests/database/tenant_isolation.sql` passed with actual `auth.uid()` in local Supabase PostgreSQL 17 and with an isolated PostgreSQL 16 Auth fixture. It tests A/B SELECT/INSERT/UPDATE/DELETE denial across the required resources, own-row visibility, indirect history, composite FK rejection, internal table invisibility, and replay constraints. Temporary test-only DML grants exercise RLS policy behavior, then roll back. Production DML grants remain absent. Remote Supabase policy execution and backend/service-role authorization are not yet validated; these are later gates.

## Financial integrity and replay

Use database uniqueness plus transactional idempotency, not an in-memory cache. Incoming financial operations supply or derive stable keys. Reusing a key with a different request hash fails. Webhook receive, dedupe, processing state, and retry handling are recorded. Sync uses provider identities scoped correctly. Bill payment/reconciliation and recurring creation lock relevant rows and write audit/outbox atomically. Multiple workers claim outbox rows safely; repeated jobs converge on one notification. Keep raw facts and user overrides distinguishable.

## External boundaries

- Pluggy: check current official endpoints, authentication, webhook verification, event IDs, rate limits, sandbox behavior, and data scopes in Phase 10. Never infer payload shape. Connect tokens are created server-side. Never store bank credentials.
- WhatsApp: the optional worker has a persistent private session directory excluded from Git. Its bridge uses a rotatable internal secret with constant-time verification, request freshness/replay protection, size limits, per-phone/global rate limits, and timeouts. Phone links require a short-lived, hashed, single-use code and attempt limits.
- AI: send minimized transaction fields. Treat all model output as untrusted; parse structured output, authorize the resulting intent, and permit only named domain operations. No SQL or arbitrary tools. Descriptions and messages cannot override system policy.
- Notifications: enqueue in the database, then deliver asynchronously with dedupe and bounded retries. No direct network send inside a financial transaction.

## Web and operational controls

Protect authenticated mutations against CSRF/origin abuse according to current Next.js/Supabase guidance. Use secure cookies and route protection. Validate environment at startup, separating development, staging, and production credentials. Do not cache private financial responses in shared caches. Use request IDs, operation, status, duration, and sanitized error codes in logs; omit tokens, CPF, bank payloads, and full financial content. Give users safe error messages. External calls have timeouts and only safe retries. Rate-limit auth, connect-token, internal bridge, and agent paths.

Production gate includes dependency review, secret exposure scan, webhook verification, backup/restore exercise, staging tenant tests, incident procedure, and legal review of consent, retention, deletion/export, and Brazilian privacy obligations. Architecture readiness is not legal or production approval.

## Current risk register

| Severity | Risk | Evidence now | Required mitigation |
| --- | --- | --- | --- |
| Critical | Auth and backend authorization are absent | Phase 2 has only schema/RLS; no user session or product route | Complete Phase 3 before exposing private data |
| High | Account deletion/retention workflow not defined | Schema restricts profile and subscription deletion; account deletion preserves transactions | Design verified export/deletion process before production |
| High | Duplicate facts on sync/payment | No idempotency infrastructure exists | Unique provider identity, transactional keys, locking, replay tests |
| High | External IDs may have wrong uniqueness scope | Master proposes global unique Pluggy IDs | Verify provider contracts, scope unique indexes correctly |
| High | Direct financial writes would bypass domain/audit | Phase 2 intentionally grants authenticated users SELECT only | Add controlled write path and audit with each feature phase |
| Medium | Generic `alerts.reference_id` has no ownership FK | Reference type is not known at schema level | Validate same-user target before dereference in Phase 15 |
| Medium | Environment validation is lazy until a Supabase client is created | Public landing page does not instantiate a client | Phase 3 should validate required auth configuration on the relevant server paths |
| Medium | LocalAuth session persistence and unofficial WhatsApp library operations | Worker not present | Isolate worker; document operational and provider risks in Phase 13 |
| Medium | Backup, restore, retention, and consent undefined | No operational documents/config | Define and exercise before production |
| Low | Development tooling has moderate transitive `minimatch` advisories | On 2026-11-05 `npm audit` reports 8 moderate through `eslint-config-next` 16.4.5 (the earlier `braces` advisory is gone); `npm audit --omit=dev` reports zero | Track upstream fix; do not accept untrusted glob patterns in tooling; reassess in Phase 16 |

## Phases 3–15 implementation (2026-11-04)

- **Identity**: pages and actions call `requireUser()`, which verifies the JWT with `auth.getClaims()`. `proxy.ts` only refreshes cookies and redirects anonymous visitors; it is not the authorization boundary. Post-login `next` accepts same-site relative paths only.
- **Write path**: authenticated users still have SELECT only (the Phase 2 gate holds and is re-tested). Writes go through server actions → application services using the service-role client, always filtered by the verified `user_id`, with ownership checks on referenced tags/accounts. Multi-step financial writes are `security definer` routines executable by `service_role` only: `mark_bill_paid` (row lock, idempotent, one successor), `upsert_provider_transactions` (replay converges, user tags preserved), `claim_notifications` (lease + `skip locked`), `ensure_profile`.
- **Audit**: triggers on transactions, bills, subscriptions, accounts and tag rules write `audit_logs` in the same transaction (changed column names only, no amounts in metadata). Imported provider amounts/dates/descriptions are immutable outside sync (trigger).
- **WhatsApp bridge**: `POST /api/internal/whatsapp` requires `X-Prumo-Timestamp` + `X-Prumo-Signature` (HMAC-SHA256 over `ts.body`, constant-time compare, 5 min window, replayed signatures rejected, 16 KB limit). Per-phone rate limits (30/min, link 5/15 min). Phones are linked by a single-use 8-character code (HMAC-hashed at rest, 15 min TTL) that the user sends from their own WhatsApp, so the phone is proven by the sender. Writes use the WhatsApp message id as `external_reference`, so a retried "sim" cannot duplicate a fact. The local model only proposes a JSON draft; the server validates it with Zod and the user confirms before any write.
- **Pluggy**: connect tokens are created server-side with `clientUserId` = user id; registering an item checks that `clientUserId`. The webhook requires the `x-prumo-webhook-secret` header (Pluggy offers no signature), checks `clientId`, dedupes by `eventId`, answers before syncing (`after()`), and re-reads data with our API key. Bank credentials never reach the app.
- **Other**: CSV export neutralizes formula injection; `/api/cron/notifications` requires `Bearer CRON_SECRET`; private pages send `Cache-Control: private, no-store`.

Residual risks: in-memory rate limits and replay cache are per instance; Next.js was upgraded to 16.4.5 and Zod to 4.6.7 on 2026-11-05 (`npm audit --omit=dev`: 0 vulnerabilities); 8 moderate dev-only advisories remain in `minimatch` via `eslint-config-next`, whose suggested fix is a downgrade to Next 15; whatsapp-web.js is unofficial and its session folder is a credential; Pluggy webhooks rely on a shared secret header.
