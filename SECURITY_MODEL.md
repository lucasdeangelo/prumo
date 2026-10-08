# Security model

## Trust boundaries

The browser, WhatsApp messages, bank descriptions, webhook bodies, and AI output are untrusted input. The authenticated Supabase identity or an already verified WhatsApp link determines the user. Client-supplied `user_id` is never authority. Next.js handlers/actions validate input with Zod, authorize ownership, and call application services. Database RLS independently restricts each user-owned table. The Supabase service role, Pluggy secret, AI key, and internal API secret remain server-side.

## Tenant isolation

Enable and force RLS as appropriate on every user-data table. Direct rows use `user_id = auth.uid()` for select, update, delete, and `WITH CHECK` for insert/update. Indirect rows such as `subscription_history` use a same-user parent relation. Cross-tenant foreign keys require composite ownership constraints or secure triggers in addition to RLS. Backend repositories always filter by authenticated user, including aggregate queries. Privileged service-role code must apply explicit ownership checks because it bypasses RLS. Service role access is limited to trusted background/integration paths.

Phase 2 gate: create User A and User B in an isolated test database. For accounts, items, transactions, tags, rules, upcoming bills, subscriptions, alerts, and WhatsApp links, verify A cannot select, update, delete, or insert as B. Also test indirect references, nested reads, service-role entry points, and attempted linking to B's rows. A single leak is a blocker. Never run these tests against production.

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
| Critical | No auth, RLS, or tenant boundary | Starter has no Supabase/schema/auth | Phases 2–3; block financial features until isolation passes |
| Critical | Master schema cascades can erase ledger | `profiles -> auth.users` and `subscription_history -> subscriptions` cascade proposals | Explicit deletion/retention policy and non-cascading ledger links before migration |
| High | Cross-user relation through foreign keys | Master columns reference IDs without ownership constraint | Composite same-user FKs/triggers and adversarial tests |
| High | Duplicate facts on sync/payment | No idempotency infrastructure exists | Unique provider identity, transactional keys, locking, replay tests |
| High | External IDs may have wrong uniqueness scope | Master proposes global unique Pluggy IDs | Verify provider contracts, scope unique indexes correctly |
| High | No database isolation or auth enforcement | No schema, RLS, or protected routes exist after Phase 1 | Phase 2 RLS, Phase 3 auth, and A/B tests |
| Medium | Environment validation is lazy until a Supabase client is created | Public landing page does not instantiate a client | Phase 3 should validate required auth configuration on the relevant server paths |
| Medium | LocalAuth session persistence and unofficial WhatsApp library operations | Worker not present | Isolate worker; document operational and provider risks in Phase 13 |
| Medium | Backup, restore, retention, and consent undefined | No operational documents/config | Define and exercise before production |
| Medium | Development tooling includes a high-severity transitive `braces` advisory | `npm audit` reports GHSA-vfj7-8cjw-p6xm through `eslint-config-next`; `npm audit --omit=dev` reports zero | Track upstream fix; do not accept untrusted glob patterns in tooling; reassess in Phase 16 |
