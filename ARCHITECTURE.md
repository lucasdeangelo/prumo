# Architecture

## Phase 0 baseline (2026-10-08)

This repository is an unmodified Create Next App starter. It has App Router pages in JavaScript, a Tailwind stylesheet, default assets, and no product behavior. Installed versions are Next.js 16.4.0, React 19.3.0, Tailwind CSS 4.3.3, ESLint 9.39.5, Node.js 24.13.0, and npm 11.19.1. The package manifest pins Next and React but uses major ranges for Tailwind and ESLint. There is no TypeScript, Supabase, validation, tests, integration, or deployment configuration. The official [Next.js App Router documentation](https://nextjs.org/docs/app) confirms the chosen routing model; recheck current compatibility before adding packages in Phase 1.

## Target shape

Use a modular monolith in Next.js App Router. Route handlers and server actions are transport boundaries; application services coordinate transactions; pure domain functions define financial rules; repositories own persistence. Server Components render authenticated data by default. Client Components handle interactive UI only. An optional, separately deployed WhatsApp worker communicates through authenticated internal endpoints and has no direct financial rules or database access.

```text
Browser -> Next.js UI / route handlers -> application services -> pure domain
                                       -> repositories -> Supabase Postgres + RLS
                                       -> adapters: Pluggy, AI, notifications
WhatsApp <-> worker <-> authenticated internal API -> application services
```

Target directories follow `app/`, `components/`, `lib/domain/`, `lib/application/`, `lib/repositories/`, `lib/integrations/`, `lib/auth/`, `lib/supabase/`, `bot/`, `supabase/migrations/`, and `tests/`. Create directories when the corresponding phase needs them. Avoid a separate REST backend.

## Financial boundaries

- `Transaction` is a posted fact; `UpcomingBill` is an expectation; `Subscription` is a recurrence rule. A reconciliation links an existing fact to an expectation without inserting another fact.
- Persist BRL values as signed/unsigned `BIGINT` cents according to a documented invariant. Proposed invariant: `amount_cents > 0`, with `type` expressing direction; balances may be signed. Convert external decimal values with exact decimal parsing, never floating point arithmetic.
- Every financial write runs in one database transaction with ownership checks, uniqueness/idempotency constraints, audit entry, and any outbox entry. A domain function does not perform network calls.
- Connected account balances are provider snapshots with sync timestamps. Computed ledger totals are separate metrics and must be labeled separately. Transfers are excluded from economic income/spending only after they are identified reliably.
- Preserve historical transactions through soft deletion and nullable links. Imported provider facts retain provider fields; user corrections are stored as overrides or separately tracked edits.
- Use `America/Sao_Paulo` as the initial presentation timezone. Store instants in `timestamptz`; store bill and transaction calendar dates as `date`. Month boundaries are derived in the user's timezone.

## User experience and operations

Design at 375×667 first and support 320–430px. Use single-column screens, at least 44px touch targets, and at least 16px form text. Distinguish confirmed, estimated, predicted, and detected data. Keep charts and financial aggregates server-side or query-side; page through transaction lists. Avoid caching authenticated financial responses without explicit invalidation.

External adapters have typed errors, timeouts, bounded retries on idempotent operations, and no secrets in client bundles or logs. Pluggy capabilities are discovered/recorded instead of assumed. AI is a fallback after deterministic categorization and produces validated intent only. Outbox delivery isolates the core from WhatsApp availability.

## Decisions and phase boundary

Retain the starter code until Phase 1 replaces it as part of foundation work. Phase 0 adds documentation only. Phase 1 establishes strict TypeScript, tooling, UI foundation, environment validation, and Supabase clients. Phase 2 creates the schema and proves RLS isolation before any user financial feature is built. See [DATA_MODEL.md](DATA_MODEL.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Phase 1 implementation note (2026-10-08)

The starter is now strict TypeScript with a Portuguese mobile landing page, Tailwind tokens, local shadcn-style `Button` and `Badge` components, Lucide, Zod environment parsing, Vitest, and browser/server Supabase client factories. The client factories are not used by a product route yet, so no credentials are needed to build the public landing page; they validate configuration when called. The browser client receives only the publishable key. The server client uses cookie-based SSR support and is marked `server-only`; session refresh and route protection are Phase 3 work. Starter cache component options were removed so private finance pages will not inherit opt-in caching. No data or auth capability exists yet.
