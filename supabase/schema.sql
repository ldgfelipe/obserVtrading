-- SchemaVv Supabase (ejecutar una vez en SQL Editor)
-- Tablas: obserVtrading (Vercel) + policies de lectura

-- 1. Snapshot de pares (un row por par y por ciclo)
create table if not exists public.pairs_snapshot (
  id bigint generated always as identity primary key,
  symbol text not null,
  price numeric,
  rsi numeric,
  adx numeric,
  atr_pct numeric,
  bb_position numeric,
  ema20 numeric,
  trend_pct numeric,
  vol24 numeric,
  score numeric,
  created_at timestamptz not null default now()
);

-- 2. Estado del bot (balance paper + ultimo par)
create table if not exists public.bot_state (
  id int primary key default 1,
  paper_balance_mxn numeric not null default 0,
  current_symbol text,
  last_cycle timestamptz,
  updated_at timestamptz not null default now()
);

-- 3. Registro de ciclos ejecutados
create table if not exists public.cycles (
  id bigint generated always as identity primary key,
  started timestamptz not null default now(),
  pairs int,
  best_symbol text,
  best_score numeric,
  decision text,
  decision_reason text,
  paper_balance_mxn numeric
);

-- 4. Senales de decision
create table if not exists public.signals (
  id bigint generated always as identity primary key,
  action text,
  symbol text,
  reason text,
  created_at timestamptz not null default now()
);

-- 5. Ordenes (paper/real)
create table if not exists public.orders (
  id bigint generated always as identity primary key,
  action text,
  symbol text,
  price numeric,
  units numeric,
  amount_mxn numeric,
  fee_mxn numeric,
  type text default 'paper',
  created_at timestamptz not null default now()
);

-- 6. Configuracion editable desde el panel admin (JSONB)
create table if not exists public.bot_settings (
  id int primary key default 1,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.bot_settings (id, config, updated_at)
values (1, '{}'::jsonb, now())
on conflict (id) do nothing;

-- Indices
create index if not exists idx_pairs_snapshot_symbol      on public.pairs_snapshot (symbol);
create index if not exists idx_pairs_snapshot_created_at  on public.pairs_snapshot (created_at desc);
create index if not exists idx_signals_created_at         on public.signals (created_at desc);
create index if not exists idx_orders_created_at          on public.orders (created_at desc);

-- Permisos
alter table public.pairs_snapshot enable row level security;
alter table public.cycles        enable row level security;
alter table public.signals       enable row level security;
alter table public.orders        enable row level security;
alter table public.bot_state     enable row level security;
alter table public.bot_settings  enable row level security;

create policy "Public select pairs_snapshot" on public.pairs_snapshot for select using (true);
create policy "Public select cycles"         on public.cycles        for select using (true);
create policy "Public select signals"        on public.signals       for select using (true);
create policy "Public select orders"         on public.orders        for select using (true);
create policy "Public select bot_state"      on public.bot_state     for select using (true);
create policy "Public select bot_settings"   on public.bot_settings  for select using (true);