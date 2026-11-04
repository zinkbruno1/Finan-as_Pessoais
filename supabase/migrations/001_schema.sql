-- Dashboard Financeiro Pessoal — esquema PostgreSQL (Supabase)
-- Valores monetários em centavos (bigint). Datas de calendário em DATE (fuso America/Sao_Paulo no app).
-- Cada linha pertence a um usuário (user_id = auth.uid()) e as políticas RLS isolam os dados.

-- Função utilitária: atualiza updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------- Preferências do usuário ----------------
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  user_name text not null default '',
  currency text not null default 'BRL' check (currency = 'BRL'),
  theme text not null default 'system' check (theme in ('light','dark','system')),
  default_alert_levels int[] not null default '{70,90,100}',
  notify_budget boolean not null default true,
  notify_due boolean not null default true,
  due_days_ahead int not null default 7 check (due_days_ahead between 0 and 90),
  report_format text not null default 'csv' check (report_format in ('csv','pdf')),
  hide_values boolean not null default false,
  asset_classes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------- Contas ----------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  institution text not null default '',
  type text not null check (type in ('checking','savings','wallet','cash','brokerage','other')),
  initial_balance_cents bigint not null default 0,
  initial_date date not null,
  archived boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------- Categorias (hierarquia por parent_id) ----------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('income','expense')),
  parent_id uuid references public.categories(id) on delete cascade,
  color text not null default '#94a3b8',
  icon text not null default '',
  sort_order int not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------- Recorrências ----------------
create table if not exists public.recurrings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  payment_method text not null default '',
  frequency text not null check (frequency in ('daily','weekly','monthly','yearly')),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  due_day int check (due_day between 1 and 31),
  auto_confirm boolean not null default false,
  active boolean not null default true,
  generated_until date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------- Movimentações ----------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  amount_cents bigint not null check (amount_cents > 0),
  description text not null default '',
  original_text text not null default '',
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete restrict,
  date date not null,
  settled_date date,
  status text not null check (status in ('done','pending')),
  payment_method text not null default '',
  payer text not null default '',
  recurring_id uuid references public.recurrings(id) on delete set null,
  recurrence_date date,
  notes text not null default '',
  tags text[] not null default '{}',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Impede duplicar a mesma ocorrência de uma recorrência
create unique index if not exists transactions_recurrence_uniq on public.transactions (recurring_id, recurrence_date) where recurring_id is not null;
create index if not exists transactions_user_date on public.transactions (user_id, date);

-- ---------------- Transferências entre contas próprias ----------------
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_account_id uuid not null references public.accounts(id) on delete restrict,
  to_account_id uuid not null references public.accounts(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  date date not null,
  status text not null check (status in ('done','pending')),
  description text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);

-- ---------------- Investimentos ----------------
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  asset_class text not null,
  institution text not null default '',
  ticker text not null default '',
  valuation_mode text not null check (valuation_mode in ('unit','total')),
  quote_provider text not null default 'none' check (quote_provider in ('none','brapi','coingecko')),
  currency text not null default 'BRL',
  current_unit_price_cents bigint check (current_unit_price_cents >= 0),
  current_total_cents bigint check (current_total_cents >= 0),
  fx_rate numeric,
  quote_source text not null default '',
  quote_kind text not null default 'manual' check (quote_kind in ('manual','realtime','delayed','last_known')),
  quote_at timestamptz,
  daily_change_pct numeric,
  acquisition_date date,
  maturity_date date,
  rate text not null default '',
  indexer text not null default '',
  liquidity text not null default '',
  account_id uuid references public.accounts(id) on delete set null,
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  type text not null check (type in ('buy','contribution','sell','redemption','dividend','interest','fee','tax')),
  quantity numeric not null default 0 check (quantity >= 0),
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  amount_cents bigint not null check (amount_cents >= 0),
  costs_cents bigint not null default 0 check (costs_cents >= 0),
  taxes_cents bigint not null default 0 check (taxes_cents >= 0),
  date date not null,
  account_id uuid references public.accounts(id) on delete restrict,
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quote_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  price_cents bigint not null check (price_cents >= 0),
  currency text not null default 'BRL',
  source text not null,
  kind text not null check (kind in ('manual','realtime','delayed','last_known')),
  quoted_at timestamptz not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------- Planejamento ----------------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  limit_cents bigint not null check (limit_cents > 0),
  alert_levels int[] not null default '{70,90,100}',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  target_cents bigint not null check (target_cents > 0),
  saved_cents bigint not null default 0 check (saved_cents >= 0),
  start_date date not null,
  deadline date,
  link_type text not null default 'none' check (link_type in ('none','account','investment')),
  link_id uuid,
  description text not null default '',
  status text not null default 'active' check (status in ('active','done','archived')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.net_worth_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('other_asset','debt','loan','financing','other_liability')),
  name text not null check (length(trim(name)) > 0),
  value_cents bigint not null check (value_cents >= 0),
  interest_rate text not null default '',
  due_date date,
  status text not null default 'active' check (status in ('active','settled')),
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  keyword text not null check (length(trim(keyword)) > 0),
  kind text not null check (kind in ('income','expense')),
  category_id uuid not null references public.categories(id) on delete cascade,
  subcategory_id uuid references public.categories(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------- Triggers updated_at + RLS ----------------
do $$
declare t text;
begin
  foreach t in array array['user_settings','accounts','categories','recurrings','transactions','transfers','investments',
                           'investment_operations','quote_history','budgets','goals','net_worth_items','category_rules']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_owner" on public.%I', t, t);
    execute format('create policy "%s_owner" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- Permissões explícitas: só usuários autenticados acessam as tabelas (e o RLS restringe às próprias linhas).
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.user_settings, public.accounts, public.categories, public.recurrings, public.transactions, public.transfers,
  public.investments, public.investment_operations, public.quote_history, public.budgets, public.goals,
  public.net_worth_items, public.category_rules
  to authenticated;
revoke all on
  public.user_settings, public.accounts, public.categories, public.recurrings, public.transactions, public.transfers,
  public.investments, public.investment_operations, public.quote_history, public.budgets, public.goals,
  public.net_worth_items, public.category_rules
  from anon;

-- Garante que referências apontem para registros do mesmo usuário (integridade entre usuários).
create or replace function public.check_same_owner() returns trigger language plpgsql security definer set search_path = public as $$
declare ref uuid; col text; tbl text; owner uuid;
begin
  for col, tbl in select * from (values
      ('account_id','accounts'),('from_account_id','accounts'),('to_account_id','accounts'),
      ('category_id','categories'),('subcategory_id','categories'),('parent_id','categories'),
      ('investment_id','investments'),('recurring_id','recurrings')) v(c, t)
  loop
    begin
      execute format('select ($1).%I', col) into ref using new;
    exception when undefined_column then
      continue;
    end;
    if ref is not null then
      execute format('select user_id from public.%I where id = $1', tbl) into owner using ref;
      -- Registro inexistente (ou sendo excluído em cascata) fica a cargo da chave estrangeira.
      if owner is not null and owner <> new.user_id then
        raise exception 'Referência inválida em %', col using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories','recurrings','transactions','transfers','investments','investment_operations',
                           'quote_history','budgets','category_rules']
  loop
    execute format('drop trigger if exists %I_owner_check on public.%I', t, t);
    execute format('create trigger %I_owner_check before insert or update on public.%I for each row execute function public.check_same_owner()', t, t);
  end loop;
end $$;
