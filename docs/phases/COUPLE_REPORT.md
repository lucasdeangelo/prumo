# Couple ("Meu, Seu, Nosso") report (2026-11-06)

Implements the screens and rules of the design canvas "Prumo — Design System" (pages *Casal*, *Open Finance*, *Mapa, componentes e decisões*, and the app screens), following its UX decisions: private by default, full symmetry, privacy that leaves no trace, free money only as a total, "combinados" instead of permissions, red only for technical failure or a busted household budget, look back without a scoreboard.

## What was built

| Area | Screens | Rules |
| --- | --- | --- |
| Household | Perfil do casal (invite, join, income, Pix key, split proposal, leave), signup with invite | Two people, symmetric; proposals the other confirms; invite code single-use, 7 days |
| Spaces | Seletor Meu \| Nosso with colored top rule; Início Meu and Nosso; Mês, Assinaturas, forms with "De quem é" | Facts carry `scope` (mine/ours/partner); Nosso shows what either marked as the couple's |
| Visibility and privacy | Visibilidade por conta, "Como Rafa vê", privacidade da transação, modo surpresa, regras de privacidade, conta do par | `lib/domain/visibility.ts` projects the partner's view server-side; hidden items never reach the browser |
| Open Finance | 8-step MeuPluggy flow, no-bank and partial states, Conexões, failure/expired screens, desconectar (manter/apagar), ajuda da atualização diária | Accounts start private; import toggle per account; consent and run history stored |
| Cards | Cartões, fatura compartilhada, marcar em lote + rateio, acerto com Pix | Invoice period from close/due dates; partner's additional card purchases start as theirs; "usar sempre" auto-Nosso; BR Code with CRC16 |
| Plans | Orçamento do lar (+ configurar), metas (lista, criar, detalhe, marco), combinados (pedido, histórico, limite), dinheiro livre | 80/100% alerts once per category and month; milestones once; nothing is blocked at the bank |
| Look back | Retrospectiva e pontos para conversar, imagem para compartilhar | Card purchases count already split; month settle-up excludes them; share image has no individual values |

## Gates

- `npm run lint`, `npm run typecheck`: pass.
- `npm test`: 59 tests (domain, couple rules with the designed numbers — R$ 958,40 settle-up, 58/42 split — Pix CRC against the Banco Central example, connection states, WhatsApp parser, HMAC).
- `npm run test:bot`: 5 tests. `npm run test:db`: three suites incl. household isolation (outsider sees nothing, partner never sees the other's privacy rules, two-person limit, private defaults, no direct writes).
- `npm run build`: pass.
- Local Supabase (two test accounts): invite/join, partner view of a "details" account (store hidden for "category only", surprise reserved, hidden item absent from HTML but counted in the month outflow), shared invoice and settle-up matching the design, combinado request → approval, goal deposit → 50% milestone, budget and look back numbers, 27 screens checked at 375 px without horizontal overflow.

## Not verified / limits

- Real Pluggy data with the new card fields (limit, close/due dates, card final, installments) — mapped from the docs; confirm with your MeuPluggy connection.
- MeuPluggy free tier covers only the account holder's own data; each partner connects their own MeuPluggy. Productizing for other couples needs Pluggy's paid plan.
- WhatsApp notices for plans (combinados, alerts, milestones) go only to people who linked WhatsApp.
- Migrations `202611060001_household`, `202611060002_connections`, `202611060003_auto_ours` are applied locally only. Run `npx supabase db push` to apply them to the remote project before deploying this version.
