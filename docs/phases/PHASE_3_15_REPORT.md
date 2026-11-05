# Phases 3–15 report (2026-11-04)

**Status: PASS for code and automated gates; Pluggy live sync and a real WhatsApp session are not verified.**

## Delivered

| Phase | Delivery |
| --- | --- |
| 3 Auth | E-mail/password sign-up, sign-in, recovery, `/auth/confirm`, sign-out (POST + origin check), `proxy.ts` session refresh, `requireUser()` with `getClaims()`, idempotent onboarding (`ensure_profile`: profile + 14 default tags) |
| 4 Transactions | Cent-exact money parsing, manual create/edit/soft delete, provider facts immutable, audit triggers |
| 5 Accounts | Manual accounts, archive; Pluggy accounts archived on disconnect, history kept |
| 6 Dashboard | `/overview`: month result, income/spending, bank balance (labelled as provider snapshot), 6-month bars, spending by tag, next 14 days, recent |
| 7 Monthly | `/monthly/[month]`: month switcher, cumulative spending vs. previous month, tag ranking as filter, type filters, day-grouped list, CSV export |
| 8 Upcoming | Bills with recurrence (incl. custom), confirmed vs. predicted forecast, pay (create fact or link a candidate), cancel; `mark_bill_paid` is atomic and idempotent and creates one successor |
| 9 Subscriptions | Manual add, detection (regular interval, stable amount, known services), confirm/reject/pause/cancel, history linking, next charge tracking, monthly/annual cost |
| 10 Pluggy | Connect token server-side, widget (`pluggy-connect-sdk`), item registration with `clientUserId` check, account + `/v2/transactions` cursor sync, webhook with secret header and event dedupe, disconnect, webhook registration script |
| 11 Reconciliation | Scored matching; auto-settles only a single strong match after sync; picker for the rest |
| 12 Categorization | Rules > keyword dictionary > Pluggy category > "Outros"; "use always" learns a merchant rule and re-tags past automatic matches |
| 13 WhatsApp worker | `bot/` (whatsapp-web.js, LocalAuth), HMAC-signed bridge, code-based phone linking, rate limits |
| 14 WhatsApp agent | Deterministic parser (amounts, dates, #tags, queries, "paguei <conta>"), Ollama fallback with server-side Zod validation, sim/não confirmation, message-id idempotency |
| 15 Notifications | Outbox with dedupe keys (bill due, overdue, subscription charge), lease-based claim, retry backoff, daily cron safety net |

## Gates

| Gate | Result |
| --- | --- |
| `npm run lint` / `typecheck` | Pass |
| `npm test` (Vitest, 36 tests) | Pass: money, dates/month boundaries, recurrence stability, categorization order, subscription detection, forecast, summaries, reconciliation ambiguity, WhatsApp parser, AI draft validation, bot↔server HMAC interop and replay |
| `npm run test:bot` (5 tests) | Pass: confirmation flow, single execute, cancel, AI fallback |
| `npm run test:db` | Pass: Phase 2 isolation suite unchanged (no direct INSERT for `authenticated`) + new suite (onboarding idempotency, double payment, cross-tenant payment, provider replay, user tag preserved, provider immutability, outbox lease) |
| `npm run build` | Pass on Next.js 16.4.5 |
| Local Supabase (PostgreSQL 17) | Both migrations applied with `supabase migration up --local` |
| Browser check at 375×812 | Sign-up/onboarding, overview charts, monthly, upcoming, subscription detection/confirm/reject, bill payment (fact + successor + audit), tag correction with learned rule, no horizontal overflow |
| WhatsApp bridge end to end | Simulated with the bot's own `conversation.js` + signed client against the running app: link code, 4 confirmed entries with correct automatic tags, cancel, query summary |

## Not verified

- Pluggy against the sandbox (no `PLUGGY_CLIENT_ID/SECRET`); the contract follows docs.pluggy.ai as read on 2026-11-04. Credit card amount signs are inconsistent in the docs, so direction comes from `type`; confirm with real data.
- A real WhatsApp session (QR scan) and Ollama extraction quality.
- Remote Supabase project: no migration applied.

## Risks and follow-ups

- Upgraded Next.js 16.4.0 → 16.4.5 and Zod 4.6.5 → 4.6.7 (critical/high advisories). Production audit is clean; 8 moderate dev-only advisories remain in lint tooling (`minimatch` via `eslint-config-next`).
- Rate limits and the replay cache are in memory (per instance).
- Phase 16 (hardening audit) and 17 (deploy) remain.
