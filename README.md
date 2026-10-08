# Prumo

SaaS de finanças pessoais em construção por fases. O repositório está na **Fase 0 (discovery e arquitetura)**: a aplicação ainda é o starter do Next.js e não oferece gestão financeira, autenticação nem integrações. Veja [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), [SECURITY_MODEL.md](SECURITY_MODEL.md) e [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Requisitos atuais

- Node.js 20.9 ou superior para o Next.js 16; ambiente local verificado com Node.js 24.13.0 e npm 11.19.1.
- npm para instalar as dependências fixadas em `package-lock.json`.

## Instalação e desenvolvimento

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000`. A página exibida ainda é a tela padrão do Create Next App.

## Variáveis de ambiente

Nenhuma é necessária para o starter atual. A validação de ambiente será adicionada na Fase 1. As integrações futuras usarão variáveis como `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `BOT_API_URL`, `INTERNAL_API_SECRET` e `APP_URL`; a exigência de cada uma será específica ao serviço e fase. Nunca use chaves privilegiadas no navegador. Arquivos `.env*` são ignorados pelo Git.

## Migrations e testes

Ainda não existem migrations nem suíte de testes. A Fase 1 adicionará Vitest, lint/typecheck/build como gates; a Fase 2 adicionará migrations Supabase e testes de isolamento A/B. O comando disponível agora é `npm run lint`; `npm run build` verifica o starter.

## Bot, sandbox e deploy

O worker de WhatsApp, Pluggy sandbox e configurações de deploy ainda não existem. O plano prevê Next.js na Vercel, PostgreSQL/Auth no Supabase e worker opcional em VPS com sessão persistente. Isso é arquitetura proposta, não implantação validada. Consulte o plano de implementação antes de iniciar a fase correspondente.
