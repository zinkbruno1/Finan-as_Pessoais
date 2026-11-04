// Valida supabase/migrations/001_schema.sql num PostgreSQL real (PGlite), simulando o ambiente do Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/001_schema.sql', import.meta.url), 'utf8');
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'OK  ' : 'FALHA'} ${name} ${extra}`); };
async function expectError(name, fn, code) {
  try { await fn(); ok(name, false, '(não deu erro)'); }
  catch (e) { ok(name, !code || e.code === code, `[${e.code}] ${e.message}`); }
}

// --- Simulação mínima do Supabase: schema auth, auth.uid(), papéis e permissões padrão ---
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users values ('${A}'), ('${B}');`);

await db.exec(sql);
ok('migração executa sem erros', true);
await db.exec(sql);
ok('migração é idempotente (executa 2x)', true);

const as = async (user, q, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  return db.query(q, params);
};

// --- Usuário A cria dados ---
const accA = (await as(A, `insert into accounts (name, type, initial_balance_cents, initial_date) values ('Nubank','checking',150000,'2026-11-01') returning id, user_id`)).rows[0];
ok('insert sem user_id usa auth.uid()', accA.user_id === A);
const catA = (await as(A, `insert into categories (name, kind) values ('Alimentação','expense') returning id`)).rows[0].id;
const subA = (await as(A, `insert into categories (name, kind, parent_id) values ('Pizza','expense',$1) returning id`, [catA])).rows[0].id;
const txA = (await as(A, `insert into transactions (kind, amount_cents, description, category_id, subcategory_id, account_id, date, status, tags)
  values ('expense', 4590, 'Pizza', $1, $2, $3, '2026-11-02', 'done', '{a,b}') returning id`, [catA, subA, accA.id])).rows[0].id;
ok('A insere lançamento com categoria e conta próprias', !!txA);
await as(A, `insert into user_settings (user_name) values ('A')`);
const up = await as(A, `insert into user_settings (user_id, user_name, asset_classes) values ($1, 'A2', '{Ações}') on conflict (user_id) do update set user_name = excluded.user_name returning user_name`, [A]);
ok('upsert de user_settings', up.rows[0].user_name === 'A2');
const upd = await as(A, `update transactions set amount_cents = 5000 where id = $1 returning updated_at, created_at`, [txA]);
ok('A edita o próprio lançamento', upd.rows.length === 1);

// --- Isolamento: usuário B ---
ok('B não vê contas de A', (await as(B, `select * from accounts`)).rows.length === 0);
ok('B não vê lançamentos de A', (await as(B, `select * from transactions`)).rows.length === 0);
ok('B não vê preferências de A', (await as(B, `select * from user_settings`)).rows.length === 0);
ok('B não altera lançamento de A', (await as(B, `update transactions set amount_cents = 1 where id = $1 returning id`, [txA])).rows.length === 0);
ok('B não exclui lançamento de A', (await as(B, `delete from transactions where id = $1 returning id`, [txA])).rows.length === 0);
await expectError('B não insere linha com user_id de A', () => as(B, `insert into accounts (user_id, name, type, initial_date) values ($1,'X','checking','2026-11-01')`, [A]), '42501');
await expectError('B não referencia conta de A (trigger de integridade)', () => as(B, `insert into transactions (kind, amount_cents, account_id, date, status) values ('expense', 100, $1, '2026-11-02','done')`, [accA.id]), '42501');
await expectError('B não referencia categoria de A', () => as(B, `insert into categories (name, kind, parent_id) values ('X','expense',$1)`, [catA]), '42501');
await expectError('anônimo não acessa as tabelas', () => as(null, `select * from accounts`), '42501');

// --- Restrições ---
await expectError('valor zero é rejeitado', () => as(A, `insert into transactions (kind, amount_cents, date, status) values ('expense', 0, '2026-11-02','done')`), '23514');
await expectError('status inválido é rejeitado', () => as(A, `insert into transactions (kind, amount_cents, date, status) values ('expense', 10, '2026-11-02','pago')`), '23514');
const accA2 = (await as(A, `insert into accounts (name, type, initial_date) values ('Corretora','brokerage','2026-11-01') returning id`)).rows[0].id;
await expectError('transferência para a mesma conta é rejeitada', () => as(A, `insert into transfers (from_account_id, to_account_id, amount_cents, date, status) values ($1,$1,100,'2026-11-02','done')`, [accA.id]), '23514');
await as(A, `insert into transfers (from_account_id, to_account_id, amount_cents, date, status) values ($1,$2,25000,'2026-11-02','done')`, [accA.id, accA2]);
ok('transferência válida entre contas próprias', true);
const rec = (await as(A, `insert into recurrings (kind, description, amount_cents, frequency, start_date) values ('expense','Aluguel',150000,'monthly','2026-11-01') returning id`)).rows[0].id;
await as(A, `insert into transactions (kind, amount_cents, date, status, recurring_id, recurrence_date) values ('expense',150000,'2026-11-10','pending',$1,'2026-11-10')`, [rec]);
await expectError('ocorrência recorrente duplicada é rejeitada', () => as(A, `insert into transactions (kind, amount_cents, date, status, recurring_id, recurrence_date) values ('expense',150000,'2026-11-10','pending',$1,'2026-11-10')`, [rec]), '23505');
await expectError('excluir conta com lançamentos é bloqueado', () => as(A, `delete from accounts where id = $1`, [accA.id]), '23001');
const inv = (await as(A, `insert into investments (name, asset_class, valuation_mode) values ('PETR4','Ações','unit') returning id`)).rows[0].id;
await as(A, `insert into investment_operations (investment_id, type, quantity, amount_cents, date) values ($1,'buy',10.5,30000,'2026-11-02')`, [inv]);
await as(A, `insert into quote_history (investment_id, price_cents, source, kind, quoted_at) values ($1, 5271, 'brapi', 'delayed', now())`, [inv]);
await as(A, `delete from investments where id = $1`, [inv]);
ok('excluir investimento remove operações e cotações (cascade)', (await as(A, `select count(*)::int n from investment_operations`)).rows[0].n === 0);
await as(A, `insert into budgets (category_id, month, limit_cents) values ($1, '2026-11', 80000)`, [catA]);
await expectError('orçamento duplicado (categoria+mês) é rejeitado', () => as(A, `insert into budgets (category_id, month, limit_cents) values ($1, '2026-11', 1)`, [catA]), '23505');
await expectError('mês de orçamento inválido é rejeitado', () => as(A, `insert into budgets (category_id, month, limit_cents) values ($1, '11/2026', 1)`, [catA]), '23514');
await as(A, `delete from categories where id = $1`, [catA]);
const after = (await as(A, `select category_id, subcategory_id from transactions where id = $1`, [txA])).rows[0];
ok('excluir categoria mantém o lançamento sem categoria', after && after.category_id === null && after.subcategory_id === null);

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
