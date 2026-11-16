-- Investments: positions the bank reports through Open Finance (Pluggy /investments) or that the
-- person types by hand. One row per asset, its movements (buys, sells, income) and one value per
-- day, which is the only way to draw an evolution: Pluggy has no historical series per asset.
-- Reads by the owner go through RLS; the partner's view is projected on the server (visibility).
begin;

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  source text not null check (source in ('pluggy', 'manual')),
  pluggy_item_id uuid,
  provider_investment_id text,
  -- Pluggy types (FIXED_INCOME, EQUITY, ETF, MUTUAL_FUND, SECURITY, COE) plus CRYPTO for manual ones.
  type text not null check (length(trim(type)) between 1 and 40),
  subtype text check (subtype is null or length(trim(subtype)) between 1 and 40),
  name text not null check (length(trim(name)) between 1 and 160),
  code text,
  isin text,
  issuer text,
  institution text,
  quantity numeric(24, 8),
  unit_value_cents bigint,
  -- Gross value today.
  amount_cents bigint not null default 0,
  -- Net value as the institution reports it (often equal to the gross one).
  balance_cents bigint,
  -- What was put in (cost basis). Null when the bank does not say and no movements explain it.
  invested_cents bigint check (invested_cents is null or invested_cents >= 0),
  -- Income tax plus IOF the institution reports for a withdrawal today.
  taxes_cents bigint check (taxes_cents is null or taxes_cents >= 0),
  -- Contract terms, not measured returns: "110" + "CDI", or a fixed annual rate.
  rate numeric(12, 4),
  rate_type text,
  fixed_annual_rate numeric(12, 4),
  issue_date date,
  due_date date,
  -- Date the institution priced the position (often the last business day).
  value_date date,
  status text not null default 'active' check (status in ('active', 'pending', 'withdrawn')),
  scope text not null default 'mine' check (scope in ('mine', 'ours')),
  -- What the partner sees of a "Meu" investment: nothing, only the total, or the asset itself.
  visibility text not null default 'totals' check (visibility in ('private', 'totals', 'details')),
  -- The person chose not to bring this asset.
  include boolean not null default true,
  synced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, provider_investment_id),
  foreign key (user_id, pluggy_item_id) references public.pluggy_items(user_id, id)
    on delete set null (pluggy_item_id),
  check ((source = 'pluggy') = (provider_investment_id is not null))
);

create index investments_user_idx on public.investments (user_id, status) where deleted_at is null;
create trigger investments_updated_at before update on public.investments for each row execute function public.set_updated_at();

create table public.investment_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  investment_id uuid not null,
  provider_movement_id text,
  -- INTEREST covers dividends, JCP, real-estate fund rent and coupons.
  type text not null check (type in ('BUY', 'SELL', 'TAX', 'TRANSFER', 'INTEREST', 'AMORTIZATION', 'OTHER')),
  movement_type text check (movement_type in ('CREDIT', 'DEBIT')),
  date date not null,
  quantity numeric(24, 8),
  unit_value_cents bigint,
  amount_cents bigint not null check (amount_cents >= 0),
  net_amount_cents bigint,
  description text check (description is null or length(description) <= 300),
  created_at timestamptz not null default now(),
  unique (investment_id, provider_movement_id),
  foreign key (user_id, investment_id) references public.investments(user_id, id) on delete cascade
);

create index investment_movements_date_idx on public.investment_movements (investment_id, date);

create table public.investment_snapshots (
  user_id uuid not null,
  investment_id uuid not null,
  on_date date not null,
  amount_cents bigint not null,
  invested_cents bigint,
  primary key (investment_id, on_date),
  foreign key (user_id, investment_id) references public.investments(user_id, id) on delete cascade
);

alter table public.investments enable row level security;
alter table public.investment_movements enable row level security;
alter table public.investment_snapshots enable row level security;

create policy investments_select on public.investments for select to authenticated
  using (user_id = (select auth.uid()));
create policy investment_movements_select on public.investment_movements for select to authenticated
  using (user_id = (select auth.uid()));
create policy investment_snapshots_select on public.investment_snapshots for select to authenticated
  using (user_id = (select auth.uid()));

-- Writes happen on the server (sync and server actions) with the service role.
revoke all on public.investments, public.investment_movements, public.investment_snapshots from public, anon, authenticated;
grant select on public.investments, public.investment_movements, public.investment_snapshots to authenticated;
grant all on public.investments, public.investment_movements, public.investment_snapshots to service_role;

commit;
