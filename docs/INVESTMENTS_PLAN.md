# Plano · Investimentos ligados a metas

Telas de referência: canvas "Prumo — Design System", telas `InvMeu`, `InvNosso`, `InvCDB`, `InvAcao`, `InvMeta`, `InvNovo` e `InvVincular`.
Ordem: web primeiro, app depois. Cada fase fecha com lint, typecheck, testes, build e um relatório em `docs/phases/INVESTMENTS_REPORT.md`, seguindo o [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). Uma fase só começa quando a anterior passa.

## Objetivo

Mostrar a carteira real de cada pessoa, vinda do banco pelo Open Finance, com o ganho ou a perda de cada ativo. Cada investimento pode contar, inteiro ou em parte, para uma meta pessoal ou do casal. A privacidade segue as regras do Meu | Nosso.

## O que a Pluggy entrega (lido na documentação em 2026-11-16)

- `GET /investments?itemId=` (paginado) e `GET /investments/{id}/transactions`.
- **Tipos:**
  - `FIXED_INCOME`: CDB, LCI, LCA, LC, LIG, LF, TREASURY, DEBENTURES, CRI e CRA.
  - `EQUITY`: STOCK, BDR, REAL_ESTATE_FUND, DERIVATIVES e OPTION.
  - Também `ETF`, `MUTUAL_FUND`, `SECURITY` (previdência) e `COE`.
  - Caixinhas do Nubank e do PicPay chegam como CDB. **Não há cripto.**
- **Valores por ativo:**
  - `amount` é o valor bruto atual; `balance` é o líquido, já descontados taxas e IR.
  - `amountOriginal` é o valor aplicado; `taxes` é o IR e `taxes2` é o IOF.
  - Também vêm `quantity`, `value` (preço da cota), `rate`, `rateType` e `fixedAnnualRate` (taxa contratada), `dueDate` e `status` (ACTIVE, PENDING ou TOTAL_WITHDRAWAL).
- **Movimentações:** BUY, SELL, TAX, TRANSFER, INTEREST (dividendos, JCP, aluguel de FII, cupons) e AMORTIZATION.
- **Limites no Open Finance:**
  - `amountProfit` e as rentabilidades (`annualRate`, `lastMonthRate`, `lastTwelveMonthsRate`) vêm sempre nulos, então o Prumo calcula o ganho.
  - Não há série histórica de valor por ativo, e o item traz até 365 dias de movimentações.
- **Plano:** Open Finance e auto-sync são recursos Premium da Pluggy. Um item coleta os produtos habilitados na assinatura.

## Decisões de produto (aceitas em 2026-11-16)

| # | Pergunta | Decisão |
| --- | --- | --- |
| D1 | A barra inferior do design troca **Ajustes** por **Investimentos**. Para onde vai Ajustes? | Ícone de engrenagem no cabeçalho do Início. |
| D2 | Visibilidade padrão de um investimento **Meu** para o par. As contas começam `private`, mas o `InvMeu` mostra "Rafa vê só o total". | Padrão `totals`: o par vê o patrimônio total, não os ativos. A pessoa pode trocar para `private`. |
| D3 | O `InvCDB` mostra os aportes por pessoa ("Ana R$ 500 · Rafa R$ 500"). Um CDB conectado pertence a uma pessoa só, e o banco não sabe quem pôs o dinheiro. | Trocar por uma lista de movimentações (data e valor). A divisão por pessoa aparece na meta, somando os ativos de cada dono. |
| D4 | Botões Registrar aporte, Resgatar, Comprar e Vender. | Só nos investimentos cadastrados à mão. Nos conectados, os botões dão lugar a "Atualizado pelo banco às …". |
| D5 | Gráfico de cotação de 1 ano (`InvAcao`) e cripto. | Ficam para a fase 4, com uma fonte de cotações à parte. Até lá, o gráfico mostra a evolução que o Prumo registrou. |
| D6 | O par vê as metas pessoais? | Não. Uma meta pessoal só aparece para o dono. |

## Modelo de dados

Migração nova `supabase/migrations/2026111x0001_investments.sql`, com RLS e grants no mesmo arquivo. Valores em centavos (`bigint`) e quantidades em `numeric(20,8)`.

### `investments`
Uma linha por ativo.
- **Identificação:**
  - `user_id` (dono), `source` (`pluggy` ou `manual`);
  - `pluggy_item_id` (FK para `pluggy_items(user_id, id)`) e `provider_investment_id`, com `unique (user_id, provider_investment_id)`.
- **Descrição:** `type`, `subtype`, `name`, `code` (ticker ou CNPJ), `isin`, `issuer` e `institution`.
- **Posição:** `quantity`, `unit_value_cents`, `amount_cents` (bruto), `balance_cents` (líquido), `invested_cents`, `taxes_cents` e `value_date`.
- **Contrato:** `rate`, `rate_type`, `fixed_annual_rate`, `due_date` e `status`.
- **Espaço e privacidade:**
  - `scope` (`mine` ou `ours`), como nas transações;
  - `visibility` (`private`, `totals` ou `details`), como nas contas;
  - `include` (boolean), para não importar um ativo.
- **Controle:** `synced_at`, `deleted_at` e `created_at`.

### `investment_movements`
- `investment_id` e `provider_movement_id`, com `unique (investment_id, provider_movement_id)`.
- `type`, `movement_type`, `date`, `quantity`, `unit_value_cents`, `amount_cents` e `net_amount_cents`.
- Movimentações manuais têm `provider_movement_id` nulo e uma chave de idempotência.

### `investment_snapshots`
- `(investment_id, on_date)` como PK, `amount_cents` e `invested_cents`.
- Uma linha por dia, atualizada a cada sync. É daí que saem os gráficos de evolução.

### `goal_investments`
O vínculo entre um investimento e uma meta.
- `goal_id`, `investment_id`, `mode` (`all` ou `part`), `part_cents` e `created_by`.
- Um investimento pode ser repartido entre metas. A soma das partes não pode passar do valor atual; a aplicação valida isso e um teste cobre o caso.

### Metas pessoais
- `goals.household_id` passa a aceitar nulo e ganha a coluna `scope` (`mine` ou `ours`).
- Restrição de consistência: `scope = 'ours'` exige `household_id`; `scope = 'mine'` usa `created_by` como dono.
- A RLS de `goals` e das tabelas filhas passa a aceitar o dono da meta pessoal.
- As metas do casal que já existem viram `ours`. Nada muda nelas.

### RLS e privacidade
- Os dados do par nunca chegam ao navegador sem passar pela projeção do servidor, nos moldes de `lib/domain/visibility.ts`:
  - `private`: não aparece nem no total;
  - `totals`: entra só no patrimônio total;
  - `details`: aparece com os ativos.
- Vincular um ativo Meu a uma meta do casal torna o ativo visível com detalhes para o par. O `InvVincular` avisa disso antes de confirmar.

## Regras de cálculo (`lib/domain/investments.ts`, funções puras)

- **Valor aplicado:** `amountOriginal` quando vier. Senão, sai das movimentações: compras menos o custo médio das vendas.
- **Preço médio (ações, FIIs, ETFs):** custo das compras dividido pela quantidade, ajustado a cada venda.
- **Ganho ou perda bruto:** valor atual menos o valor aplicado, em reais e em %.
- **"Se resgatar hoje":** `balance` da Pluggy. Nos manuais, o valor bruto menos o IR estimado:
  - tabela regressiva 22,5 / 20 / 17,5 / 15% pelos dias aplicados;
  - LCI e LCA são isentas.
- **Proventos:** soma das movimentações INTEREST nos últimos 12 meses. O "resultado com proventos" é a variação mais os proventos.
- **"Rende por mês, em média":** ganho dividido pelos meses desde a primeira aplicação.
- **Progresso da meta:**
  - soma dos aportes manuais (`goal_contributions`) e do valor atual de cada vínculo (`all` conta o ativo inteiro; `part` conta `min(part_cents, valor atual)`);
  - o card mostra a separação entre "aportaram" (valor aplicado) e "rendeu" (ganho);
  - a divisão por pessoa vem do dono de cada ativo mais o `user_id` dos aportes manuais.
- **Evitar contar duas vezes:** "Registrar aporte" numa meta com investimentos conectados não cria um `goal_contribution`, porque o dinheiro já aparece no valor do ativo. O aporte manual fica para dinheiro guardado fora de investimentos e para os ativos cadastrados à mão.
- **Marcos (25/50/75/100%):** são checados também depois de cada sync. A PK de `goal_milestones` garante que cada marco avisa uma vez só. Se o valor cair, o marco não "desacontece".
- **"No ritmo atual, completa em":** média dos aportes dos últimos 6 meses sobre o que falta, sem projetar rendimento. Fica conservador.

## Sync (`lib/application/pluggy-sync.ts`)

- `lib/integrations/pluggy.ts` ganha `listInvestments(itemId)` (paginado) e `listInvestmentTransactions(investmentId)`, com tipos e validação Zod.
- `syncItem` chama `syncInvestments(userId, row.id, itemId)` depois das contas, num `try` isolado: uma falha em investimentos não derruba a importação de transações e fica registrada no histórico da conexão.
- Upsert dos ativos e das movimentações por id do provedor, mais o upsert do snapshot do dia.
- Um ativo que sumiu da resposta, ou veio com `TOTAL_WITHDRAWAL`, fica como resgatado. O histórico e os vínculos são mantidos, e ele sai da soma das metas.
- Se o produto não estiver habilitado (403 ou lista vazia), a tela mostra o estado "seu banco ainda não enviou investimentos".
- O webhook e o cron (`syncStaleItems`) continuam como estão. Investimentos entram no mesmo ciclo.

## Fases

### Fase 0 · Verificar com dados reais (sem tela)
1. Confirmar no painel da Pluggy se o plano atual inclui `INVESTMENTS` e `INVESTMENT_TRANSACTIONS`.
2. Rodar um script local, só de leitura, que chama `/investments` nas conexões existentes e imprime quais campos vêm preenchidos, sem valores nem identificadores.
3. Se não vier nada, testar uma nova conexão para ver se o consentimento precisa incluir investimentos.

**Gate:** tabela de quais campos o banco real preenche. Se `amountOriginal` vier vazio, a fase 1 prioriza o cálculo pelas movimentações.

**Resultado (2026-11-16), com as conexões de produção (MeuPluggy):**
- O plano da Pluggy já inclui `INVESTMENTS` e `INVESTMENTS_TRANSACTIONS` nos itens, então não é preciso refazer as conexões por causa do plano.
- Só vieram renda fixa já resgatada (`TOTAL_WITHDRAWAL`); não havia ativo vigente para testar.
- **Campos preenchidos nesses registros:**
  - `type`, `subtype`, `name`, `issuer`, `amount`, `balance`, `amountOriginal`, `amountWithdrawal`, `taxes` e `taxes2`;
  - `quantity`, `value`, `rate`, `rateType`, `date`, `dueDate`, `issueDate` e `status`.
- **Campos vazios:** `code`, `isin`, `amountProfit`, `fixedAnnualRate` e as três rentabilidades.
- `/investments/{id}/transactions` voltou vazio em todos.

**O que muda nas fases seguintes:**
- O valor aplicado sai de `amountOriginal`, e o cálculo pelas movimentações fica como alternativa.
- O detalhe de renda fixa não pode depender da lista de movimentações (D3). Sem movimentações, mostra "Aplicado em `issueDate`" e o valor aplicado.
- Para desenvolver com ativos vigentes, usar o conector sandbox da Pluggy (`PLUGGY_INCLUDE_SANDBOX`).
- Para ver a carteira real, os investimentos atuais precisam estar autorizados no MeuPluggy para o banco onde estão.

### Fase 1 · Modelo e sync
- Migração, RLS e grants.
- `pluggy.ts`, `syncInvestments`, snapshots e `lib/domain/investments.ts`.
- **Testes:**
  - domínio: ganho, preço médio com vendas parciais, tabela de IR, proventos e progresso da meta com partes;
  - replay: sincronizar duas vezes gera o mesmo estado e um snapshot por dia;
  - isolamento A/B em `tests/database/tenant_isolation.sql`.

**Gate:** um sync real popula a carteira sem alterar transações nem contas.

### Fase 2 · Telas da carteira (web)
- `/investments` com o seletor Meu | Nosso (`InvMeu` e `InvNosso`): patrimônio, aplicado, ganhos e perdas, "Onde está" por classe, "Por meta", lista com filtros (Todos, Renda fixa, Variável) e a linha "Atualizado pelo Open Finance hoje às …".
- `/investments/[id]`, com uma variante para renda fixa (`InvCDB`) e outra para renda variável (`InvAcao`), conforme D3, D4 e D5.
- Projeção da visão do par no servidor e a barra inferior conforme D1.
- Em Ajustes → Conexões: liga/desliga a importação de cada ativo e escolhe a visibilidade.

**Gate:** revisão em 375×667; um teste prova que um ativo `private` do par nunca vai no payload.

### Fase 3 · Metas pessoais e vínculo
- Migração das metas pessoais.
- Criar meta com "De quem é" (Meu | Nosso).
- "Minhas metas" no `InvMeu`.
- `InvVincular` como sheet, com "Tudo" ou "Uma parte" e o aviso de visibilidade.
- `InvMeta`: investimentos vinculados, aportaram e rendeu, divisão por pessoa, rendimento do mês e previsão.
- Marcos checados depois do sync. As telas de meta do casal (`/couple/goals`) passam a somar os vínculos.

**Gate:**
- trocar ou desfazer um vínculo recalcula o progresso;
- a soma das partes é validada;
- um marco cruzado pelo rendimento avisa uma vez só.

### Fase 4 · Cadastro manual e estimativas
- `/investments/new` (`InvNovo`): tipo, De quem é, instituição, valor, data, rentabilidade (% do CDI, prefixado ou IPCA+), vencimento e meta.
- Valorização diária dos manuais de renda fixa com o CDI, a Selic e o IPCA da API pública SGS do Banco Central, com cache diário.
- Estimativa "vira ≈ R$ X no vencimento, já descontado o IR".
- Registrar aporte, resgate, compra e venda nos manuais.
- **Opcional:** cotações de ações, FIIs, ETFs e cripto por um provedor externo, para o gráfico de 1 ano e para valorizar os manuais. O provedor e a chave ficam para decidir nessa hora.

**Gate:** a estimativa bate com um cálculo de referência em testes.

### Fase 5 · App
- Endpoints em `lib/mobile/screens` (um módulo `investments.ts`) e as telas em `mobile/src/app/(app)/investments`, com os mesmos componentes do design.
- Gera um APK novo.

## Riscos

- O plano da Pluggy pode não incluir investimentos, ou cobrar à parte. A fase 0 responde isso antes de qualquer código.
- Os bancos preenchem campos de formas diferentes. Pode faltar valor aplicado, e o histórico vem curto (365 dias); o cálculo cai para as movimentações e mostra "desde que o Prumo acompanha" quando faltar a origem.
- Os valores chegam com atraso (D-1 em muitos casos). A tela sempre mostra a data do valor.
- As conexões atuais podem precisar ser refeitas para incluir investimentos no consentimento.
- O Prumo mostra números, não recomenda nada. O aviso do `InvAcao` ("não recomenda comprar ou vender") vale para todas as telas de renda variável.
