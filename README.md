# Prumo

SaaS de finanças pessoais em desenvolvimento por fases. **Fase 1 concluída:** há uma base Next.js/TypeScript e uma página pública de apresentação. Ainda não existem cadastro, dados financeiros, banco configurado ou integrações funcionais. Consulte [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) e [relatório da Fase 1](docs/phases/PHASE_1_REPORT.md).

## Requisitos e instalação

- Node.js 20.9 ou superior, npm e acesso ao registro de pacotes para a primeira instalação.
- Ambiente local verificado: Node.js 24.13.0, npm 11.19.1.

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000`. A página pública funciona sem Supabase. Ela é uma apresentação do produto planejado, não um dashboard nem um modo demo com dados reais.

## Ambiente

Copie `.env.example` para `.env.local` quando for configurar Supabase. As chaves públicas seguem a nomenclatura atual do provedor: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. O projeto aceita HTTPS e HTTP apenas para `localhost` ou `127.0.0.1`. As factories Supabase validam esses valores ao serem chamadas e falham com mensagem clara se estiverem ausentes ou inválidos. A página pública não as chama.

`SUPABASE_SERVICE_ROLE_KEY`, segredos Pluggy, IA e bridge interna são opções reservadas ao servidor para fases posteriores. Não use prefixo `NEXT_PUBLIC_` nesses segredos. Nenhum cliente com service role existe nesta fase. Arquivos `.env*` são ignorados, exceto `.env.example`.

## Comandos

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Vitest testa o parser de ambiente nesta fase. Testes de isolamento, banco e regras financeiras começam nas fases correspondentes. O projeto usa `strict: true` em TypeScript.

## Migrations, bot, sandbox e deploy

Não há migrations nesta fase. A Fase 2 criará o schema versionado e RLS; a Fase 3 cuidará de autenticação, sessão e proteção de rotas. O worker de WhatsApp, Pluggy sandbox e infraestrutura de deploy ainda não existem. A arquitetura prevista é Next.js na Vercel, PostgreSQL/Auth no Supabase e worker opcional em VPS com sessão persistente. Nenhum ambiente de produção foi validado.
