# Security audit: couple mode (2026-11-05)

Scope: everything added for "Meu, Seu, Nosso" (household, visibility and privacy, shared cards, plans, look back, Open Finance connections) plus the redirect and auth helpers it touches.

## What was checked

- Every server action and service that reads or writes another person's data: who may call it, and whether it filters by owner (writes go through the service-role client, so the filter in code is the only guard).
- Partner view: hidden items, "category only", surprises and free money never leave the server (`lib/domain/visibility.ts`).
- Redirect targets taken from forms or the URL.
- Invite codes, joining and leaving a household.
- Pluggy item ownership and the webhook.
- Dependencies (`npm audit --omit=dev`: 0 vulnerabilities).

## Findings and fixes

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| 1 | High | The partner could move a purchase they only saw as "category only" (or on a "totals" account) to Nosso, which then showed it in full: a way around the owner's privacy. | `setInvoiceOwner` now allows the partner to reassign only what they already see in full (`partnerMayReassign`: shared, theirs, or a "detail" line). Anything else answers "Compra não encontrada." |
| 2 | Medium | Leaving removed only the person who left. The other kept the old household, so a future partner would see the old couple's goals, combinados and settle-ups. | Leaving ends the space for both: both memberships, open invites and pending proposals go; shared facts, bills and subscriptions return to "mine". The old history stays in a household nobody belongs to. |
| 3 | Medium | Open redirect: the import step redirected to any `returnTo`; other helpers accepted `/\host`, which browsers treat as another site. | One rule, `lib/safe-path.ts` (`safeRelativePath`), used by every redirect: same-site paths only, no `//`, backslashes or control characters. |
| 4 | Low | No limit on invite-code attempts. | 10 tries per person per 15 minutes (codes are 8 characters from 32 and expire in 7 days). |
| 5 | Low | A Pluggy item with no `clientUserId` could be claimed by any signed-in person who knew its id. | The item must carry this person's id (connect tokens always set it). |

## Still true / limits

- The rate limit lives in memory per server instance: enough for one instance, not for several. Move it to the database or a shared store before scaling out.
- The leave flow is covered by type checks and code review, not yet by a database test or a run in the app.
- RLS remains the second line: authenticated users can only `select` rows of their own household; all writes are server-side.

## Gates

`npm run lint`, `npm run typecheck`, `npm test` (61), `npm run test:bot` (5), `npm run test:db` (3 suites), `npm run build`, `npm audit --omit=dev`: all pass.
