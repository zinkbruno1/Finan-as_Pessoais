# Finanças Pessoais — Dashboard financeiro

Aplicação web de controle financeiro pessoal em português do Brasil (BRL, DD/MM/AAAA, fuso America/Sao_Paulo).

## Como executar

Requisitos: Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes automatizados das regras financeiras
npm run test:db    # testes do esquema do banco (RLS) num PostgreSQL embutido
npm run build      # build de produção em dist/
```

Sem configuração nenhuma, o app roda em **modo local**: os dados ficam salvos no navegador (sobrevivem a recarregar e fechar), mas não sincronizam entre dispositivos. Para login e sincronização, configure o Supabase.

## Configurar o Supabase (login + PostgreSQL + sincronização)

1. Crie uma conta e um projeto em https://supabase.com (o plano gratuito basta). Escolha a região **South America (São Paulo)** e guarde a senha do banco.
2. No painel do projeto, abra **SQL Editor → New query**, cole todo o conteúdo de [`supabase/migrations/001_schema.sql`](supabase/migrations/001_schema.sql) e clique em **Run**. Ele cria as tabelas, índices, gatilhos de `updated_at`, verificação de integridade entre usuários, permissões e as políticas RLS (cada usuário só acessa os próprios dados). Pode ser executado de novo sem problemas.
3. Em **Authentication → Sign In / Providers**, mantenha **Email** habilitado. Em **Authentication → URL Configuration**, defina *Site URL* como `http://localhost:5173` (e depois acrescente a URL de produção em *Redirect URLs*). Se não quiser confirmar e-mail no cadastro, desative *Confirm email* no provedor Email.
4. Em **Project Settings → API Keys** (ou **Data API**), copie a **Project URL** e a chave pública (**anon** ou **publishable**, começa com `eyJ…` ou `sb_publishable_…`). Preencha o arquivo `.env` (já criado a partir de `.env.example`):
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-publica
   ```
   A chave pública é feita para ficar no frontend; a segurança vem das políticas RLS. **Nunca** use a chave `service_role` / `secret` no frontend. O `.env` está no `.gitignore`.

O esquema é testado num PostgreSQL real (PGlite) com `npm run test:db`: criação idempotente, isolamento entre usuários, bloqueio de acesso anônimo, integridade entre usuários e restrições de valores.

Observação: dados criados no **modo local** não migram sozinhos para o Supabase. Para levá-los, exporte um backup em Configurações → Dados (modo local), configure o Supabase, entre no app e importe o arquivo.
5. (Opcional, cotações via backend) Publique a Edge Function de cotações:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU-PROJETO
   npx supabase functions deploy quotes
   npx supabase secrets set BRAPI_TOKEN=seu_token_brapi   # opcional
   ```
6. Reinicie `npm run dev`. O app passa a exigir login.

## Implantação no GitHub Pages

O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) roda os testes, faz o build e publica o site a cada push na branch principal.

1. Crie um repositório no GitHub (público, no plano gratuito) e envie o código:
   ```bash
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin master
   ```
2. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → aba Variables → New repository variable**: crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os mesmos valores do `.env`.
4. Em **Actions**, rode novamente o workflow "Deploy no GitHub Pages" (ou faça um novo push). O site fica em `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.
5. No Supabase, **Authentication → URL Configuration**: coloque essa URL em *Site URL* e acrescente-a em *Redirect URLs* (mantenha `http://localhost:5173` para desenvolvimento).

O build usa caminhos relativos e navegação por `#`, então funciona com qualquer nome de repositório e não precisa de configuração extra de rotas. Também pode ser publicado em Vercel, Netlify ou Cloudflare Pages com as mesmas variáveis.

## Funcionalidades

- **Visão geral**: saldo atual, entradas, gastos, resultado, total investido, % economizado, pendências; gráficos de entradas × gastos (diário/semanal/mensal/anual), distribuição por categoria (clicável), evolução do saldo (início × fim), últimas movimentações, próximos vencimentos e resumo inteligente calculado apenas com dados reais.
- **Lançamento rápido**: "20 alimentação mercado", "45,90 pizza", "80 farmácia ontem", "1500 salário", "250 transferência para investimentos". Identifica valor, tipo, categoria/subcategoria, data, conta e transferências; mostra prévia editável e pede confirmação quando há ambiguidade. Funciona sem IA, com regras configuráveis, histórico de lançamentos e dicionário embutido. O texto original é preservado.
- **Formulário completo**: valor, tipo, categoria, subcategoria, descrição, data, data de liquidação, conta, forma de pagamento, status, recorrência, fonte pagadora, tags e observações. Editar, duplicar, excluir (com confirmação) e marcar como pago/recebido.
- **Gastos e Entradas**: indicadores, detalhamento por categoria/subcategoria, tabela com pesquisa, filtros (categoria, subcategoria, conta, data, forma de pagamento, status), ordenação, paginação e exportação CSV. Entradas distinguem Recebido, Previsto e Atrasado.
- **Contas e transferências**: conta corrente, poupança, carteira digital, dinheiro, corretora; saldo inicial com data; arquivamento. Transferências não contam como receita/despesa.
- **Recorrências**: diária, semanal, mensal, anual; data final opcional; dia de vencimento; geração sem duplicação (até 31 dias à frente) como pendente ou realizada.
- **Investimentos**: cadastro completo, operações (compra, aporte, venda, resgate, dividendos, juros, taxas, impostos), custo médio, rentabilidade sem contar aportes como lucro, distribuição por classe e instituição, evolução patrimonial, histórico de cotações, atualização manual e botão "Atualizar cotações" com fonte, data/hora e tipo da cotação.
- **Orçamentos**: limite mensal por categoria, barra de progresso, previsão até o fim do mês, alertas configuráveis (padrão 70/90/100%) e reutilização dos limites do mês anterior.
- **Metas**: valor desejado, prazo, vínculo opcional com conta ou investimento (sem contar o dinheiro duas vezes), progresso e contribuição mensal necessária.
- **Relatórios**: períodos (semana/mês/ano atual e anterior, personalizado), tabela comparativa, patrimônio líquido (com bens e dívidas), nove relatórios exportáveis em CSV e PDF (via impressão do navegador).
- **Configurações**: nome, tema claro/escuro/sistema, notificações, alertas padrão, ocultar valores, classes de ativos, categorias e subcategorias (criar, editar, excluir, reordenar), regras de categorização, backup/restauração JSON com validação e detecção de duplicados, dados de demonstração (carregar/remover) e exclusão total.
- **Pesquisa global** (Ctrl+K) e atalhos: Alt+G novo gasto, Alt+E nova entrada, Alt+T transferência, Alt+I investimento.

## Regras de cálculo (resumo)

- Valores em centavos inteiros (sem erros de arredondamento).
- Só movimentações **realizadas** alteram saldo e resultado; pendentes/previstas ficam separadas.
- A data que conta para saldo e resultado é a de **liquidação** (quando informada) ou a da movimentação.
- Saldo da conta = saldo inicial (no início do dia de referência) + entradas − saídas realizadas ± transferências ± operações de investimento vinculadas.
- Resultado do período = entradas realizadas − despesas efetivas. Economia = resultado positivo ÷ entradas; sem entradas, "Não disponível".
- Transferências e aportes/resgates são movimentações patrimoniais, não receita/despesa. O total investido aparece separado do saldo em contas.
- Patrimônio líquido = contas + investimentos + outros bens − dívidas (estimativa a partir do que foi cadastrado).

Os testes em `src/domain/*.test.ts` e `src/lib/lib.test.ts` cobrem essas regras.

## Integrações externas e limitações

| Fonte | Uso | Limitações |
|---|---|---|
| [brapi.dev](https://brapi.dev) | Ações, FIIs, ETFs, BDRs da B3 | Cotação com atraso. Sem token, só alguns tickers de teste (PETR4, VALE3, ITUB4, MGLU3). Com token, configure `BRAPI_TOKEN` na Edge Function (nunca no frontend). |
| [CoinGecko](https://www.coingecko.com/api) | Criptomoedas em BRL | API pública com limite de requisições. |
| [AwesomeAPI](https://docs.awesomeapi.com.br) | Câmbio USD/BRL | Gratuita, sem chave. |
| Renda fixa, Tesouro, fundos, previdência | — | Sem fonte gratuita confiável por título; atualização manual do valor total. |

Falhas de API não quebram o app: o último valor é mantido e marcado como "Último valor conhecido". Cotações com mais de 3 dias também recebem essa marcação.

## Estrutura

```
src/
  domain/      tipos, regras financeiras, interpretador do lançamento rápido, recorrências, demo (+ testes)
  lib/         formatação BRL, datas no fuso de São Paulo, CSV, hooks
  data/        persistência (local e Supabase) e cotações
  store/       estado global, navegação, diálogos
  components/  biblioteca de componentes, layout, formulários, tabelas, gráficos
  pages/       Visão geral, Lançamentos, Gastos/Entradas, Investimentos, Orçamentos/Metas, Relatórios, Configurações
supabase/
  migrations/001_schema.sql   esquema PostgreSQL + RLS
  functions/quotes/           Edge Function de cotações
```
