# Prumo

Finanças pessoais, mobile first: entradas e saídas com **tags automáticas**, visão por mês com gráficos, **contas futuras**, **assinaturas** detectadas (ou cadastradas por você), conexão com bancos via **Pluggy (Open Finance)** e um **bot de WhatsApp** que registra gastos e manda avisos.

Monolito Next.js 16 (App Router) + Tailwind 4 + Supabase (Postgres, Auth, RLS). O bot é um processo separado em `bot/` (whatsapp-web.js + modelo local pequeno via Ollama), no mesmo estilo do `estoque-bot`.

Veja também: [arquitetura](ARCHITECTURE.md), [modelo de dados](DATA_MODEL.md), [segurança](SECURITY_MODEL.md), [plano](IMPLEMENTATION_PLAN.md) e o [relatório das fases 3–15](docs/phases/PHASE_3_15_REPORT.md).

## Finanças a dois (Meu, Seu, Nosso)

O Prumo é feito para casais. Cada pessoa tem o próprio espaço (**Meu**) e o casal tem um espaço comum (**Nosso**), alternados pelo seletor no topo. Cada um conecta os próprios bancos e escolhe, conta por conta, o que o par vê (só eu / só totais / com detalhes). Contas novas começam como "Só eu vejo".

- **Privacidade:** por lançamento (tudo, só categoria e valor, ocultar), modo surpresa até uma data, regras automáticas e a prévia "Como seu par vê". Mudanças não avisam o par.
- **Fatura compartilhada:** cada compra é Nosso, de um ou do outro; marcação em lote com rateio (50/50, pela renda, fixo) e acerto com Pix copia e cola.
- **Orçamento do lar** com avisos em 80% e 100%, **metas** com aportes e marcos, **combinados** para compras grandes, **dinheiro livre** e **retrospectiva** mensal sem placar.
- Convite: Ajustes › Perfil do casal gera um código; o par usa em Criar conta › "Recebi um convite do meu par".

Detalhes em [docs/phases/COUPLE_REPORT.md](docs/phases/COUPLE_REPORT.md).

## O que tem

| Tela | O que faz |
| --- | --- |
| **Início** (`/overview`) | Resultado do mês, entradas/saídas, saldo informado pelos bancos, barras dos últimos 6 meses, gastos por tag, próximos 14 dias, recentes |
| **Mês** (`/monthly/AAAA-MM`) | Navegação entre meses, gasto acumulado vs. mês anterior, ranking por tag (toque filtra), lista por dia, exportar CSV |
| **Futuras** (`/upcoming`) | Contas a pagar/receber em 30/90/180 dias. "Registrada" = cadastrada; "Prevista" = repetição calculada ou cobrança de assinatura. Pagar cria a movimentação (ou vincula uma do extrato) e agenda a próxima |
| **Assinaturas** (`/subscriptions`) | Ativas, custo mensal/anual, sugestões detectadas ("É assinatura" / "Não é"), cadastro manual |
| **Ajustes** (`/settings`) | Conectar banco (Pluggy), sincronizar, contas manuais, vincular WhatsApp, tags e regras |

**Tags automáticas**, nesta ordem: suas regras → nome do estabelecimento (iFood, Uber, Netflix…) → categoria do banco → "Outros". Ao corrigir a tag de uma movimentação, marque "usar sempre" e o Prumo cria a regra e reclassifica as anteriores automáticas.

**Assinaturas**: débitos do mesmo estabelecimento com intervalo regular (semanal, mensal, trimestral, semestral, anual) e valor estável (±25%) viram sugestão. Serviços conhecidos (Netflix, Spotify, iCloud, academias…) são sugeridos já na primeira cobrança. Rejeitadas não voltam.

## Rodando localmente

Requisitos: Node 20.9+, Docker Desktop.

```bash
npm ci
npx supabase start            # Postgres + Auth locais, aplica as migrations
cp .env.example .env.local    # preencha com os valores impressos pelo comando acima
npm run dev
```

No `.env.local` local use `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, a *publishable key* e a *secret key* que o `supabase start` mostra (`npx supabase status`). A confirmação de e-mail fica desligada no ambiente local.

### Pluggy (Open Finance)

1. Crie uma aplicação em [dashboard.pluggy.ai](https://dashboard.pluggy.ai) e copie `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`.
2. Com `PLUGGY_INCLUDE_SANDBOX=true`, o widget mostra o **Pluggy Bank** de testes: usuário `user-ok`, senha `password-ok`.
3. Em produção, registre o webhook (exige HTTPS público):

```bash
npm run pluggy:webhook -- https://seu-app.vercel.app
```

O webhook é autenticado pelo header `x-prumo-webhook-secret` (`PLUGGY_WEBHOOK_SECRET`); a Pluggy não assina os eventos. Sem webhook, use "Sincronizar agora" em Ajustes.

### Bot do WhatsApp

```bash
npm run bot:install
cp bot/.env.example bot/.env  # mesmo INTERNAL_API_SECRET do app
ollama pull llama3.2:1b        # opcional: só é usado quando o texto é ambíguo
npm run bot                    # escaneie o QR com o WhatsApp do número do bot
```

No app, **Ajustes → WhatsApp → Vincular** gera um código; envie `vincular CÓDIGO` para o bot. A partir daí:

- `gastei 45,90 no mercado` · `recebi 3500 salário` · `paguei 120 luz ontem` · `gastei 30 uber #transporte`
- `paguei aluguel` quita uma conta futura pelo nome
- `resumo` · `saldo` · `contas` · `assinaturas` · `últimas` · `ajuda`

Toda gravação pede confirmação (*sim*/*nao*). O bot só transporta mensagens: a interpretação, validação, tag e gravação acontecem no app, por uma API interna assinada (HMAC + timestamp). A resposta do modelo local é tratada como não confiável e validada de novo.

**Avisos**: contas vencendo (conforme "avisar antes"), conta vencida ontem e cobrança de assinatura. O bot busca a fila a cada 30 s; cada aviso tem chave de deduplicação e é enviado uma vez. `/api/cron/notifications` (Vercel Cron, diário) é uma rede de segurança.

## Comandos

```bash
npm run lint
npm run typecheck
npm test            # domínio, parser do WhatsApp, assinatura HMAC
npm run test:bot    # fluxo de conversa do bot
npm run test:db     # migrations + RLS + funções atômicas em Postgres descartável
npm run build
```

## Deploy

App na Vercel (variáveis do `.env.example`, `vercel.json` já agenda o cron), banco/Auth no Supabase (`npx supabase db push` para aplicar as migrations), bot em uma VPS com disco persistente para a sessão do WhatsApp (`~/.prumo-bot/session` ou `WHATSAPP_SESSION_PATH`, sempre fora da pasta do app) (whatsapp-web.js usa Chromium e não roda em serverless). Separe desenvolvimento, staging e produção. **Nenhuma migration foi aplicada ao projeto Supabase remoto.**

> whatsapp-web.js automatiza o WhatsApp Web e não é uma API oficial; use um número dedicado ao bot.
