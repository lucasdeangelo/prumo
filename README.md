# Prumo

SaaS de finanças pessoais em desenvolvimento por fases. **Fase 2 concluída:** há schema versionado e RLS, mas ainda não há cadastro, login ou funcionalidade financeira. A página `/` é uma apresentação, não um dashboard com dados reais. Veja [arquitetura](ARCHITECTURE.md), [modelo de dados](DATA_MODEL.md), [modelo de segurança](SECURITY_MODEL.md), [plano](IMPLEMENTATION_PLAN.md) e [relatório da Fase 2](docs/phases/PHASE_2_REPORT.md).

## Requisitos e desenvolvimento

- Node.js 20.9 ou superior, npm e Docker Desktop para testes de banco.
- Ambiente verificado: Node.js 24.13.0, npm 11.19.1, Docker 29.8.0.

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000`. A página pública funciona sem conexão com Supabase.

## Ambiente

Use `.env.example` como referência para criar `.env.local` quando configurar um ambiente Supabase. O navegador recebe apenas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. As factories validam essas variáveis ao serem chamadas. Variáveis como `SUPABASE_SERVICE_ROLE_KEY`, segredos Pluggy, IA e bridge interna pertencem somente ao servidor e ainda não são usadas. Nunca coloque segredo sob `NEXT_PUBLIC_`. `.env.local` é ignorado pelo Git.

Separe desenvolvimento, staging e produção. Não use um banco remoto de produção para testes.

## Migrations e testes de RLS

A migration inicial é [202610090001_initial_finance_schema.sql](supabase/migrations/202610090001_initial_finance_schema.sql). Ela cria as 15 tabelas, constraints, índices, grants e RLS em uma única transação. `supabase/seed.sql` está vazio de propósito; tags padrão serão criadas por usuário na Fase 3.

Para iniciar o banco local oficial do Supabase e aplicar as migrations:

```bash
npx supabase db start --yes
```

`npm run test:db` cria um PostgreSQL descartável sem porta publicada, aplica as migrations e testa isolamento A/B, vínculos entre tenants e invariantes de histórico/idempotência. O comando remove seu próprio contêiner ao terminar. O teste não se conecta ao Supabase remoto.

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

O mesmo SQL de isolamento foi executado manualmente contra o banco local oficial do Supabase PostgreSQL 17. Nenhuma migration foi aplicada a um projeto remoto. Para mudanças posteriores, crie uma nova migration; não altere uma já aplicada em staging ou produção.

## Bot, sandbox e deploy

Não há worker de WhatsApp nem Pluggy sandbox. O deploy previsto é Next.js na Vercel, PostgreSQL/Auth no Supabase e worker opcional em VPS com sessão persistente. Nenhum ambiente de produção foi validado.
