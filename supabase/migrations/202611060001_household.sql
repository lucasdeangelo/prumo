-- Couple ("casa"): two people, symmetric, each owning their own data.
-- Partners never get direct table access to each other's rows: the server reads with service_role
-- and projects what the partner may see (lib/domain/visibility.ts). These tables are readable by
-- members only; every write goes through server code or the routines below.
begin;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  default_split text not null default 'income' check (default_split in ('equal', 'income')),
  budget_alerts boolean not null default true,
  approval_threshold_cents bigint check (approval_threshold_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null unique references public.profiles(id) on delete restrict,
  color text not null check (color in ('blue', 'terracotta')),
  monthly_income_cents bigint check (monthly_income_cents >= 0),
  -- Where the partner sends settle-up Pix payments ("Chave: celular •••• 4321").
  pix_key text check (pix_key is null or length(pix_key) between 5 and 77),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (household_id, color)
);

-- A household holds at most two people.
create or replace function public.household_max_two()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.household_members where household_id = new.household_id) >= 2 then
    raise exception 'A household has at most two members' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger household_members_max_two before insert on public.household_members
  for each row execute function public.household_max_two();

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Changes that bind both people (free money, conversation limit, budget, split) wait for the other.
create table public.household_proposals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('free_money', 'approval_threshold', 'budget', 'split')),
  payload jsonb not null,
  proposed_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'withdrawn')),
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index household_proposals_one_pending_idx
  on public.household_proposals (household_id, kind) where status = 'pending';

-- Visibility of each account for the partner. New accounts are private ("Só eu vejo").
alter table public.accounts
  add column visibility text not null default 'private' check (visibility in ('private', 'totals', 'details')),
  add column import_enabled boolean not null default true,
  add column credit_limit_cents bigint,
  add column available_limit_cents bigint,
  add column bill_close_date date,
  add column bill_due_date date,
  add column card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  -- Purchases on this final belong to the partner (their additional card), e.g. "adicional •• 7710".
  add column partner_card_last4 text check (partner_card_last4 is null or partner_card_last4 ~ '^[0-9]{4}$'),
  add column institution text;

-- Whose a fact is (mine / ours / the partner's, e.g. a purchase on the partner's additional card),
-- what the partner sees of it, surprises and free money.
alter table public.transactions
  add column scope text not null default 'mine' check (scope in ('mine', 'ours', 'partner')),
  add column privacy text not null default 'account' check (privacy in ('account', 'category_only', 'hidden')),
  add column surprise_until date,
  add column surprise_hide_amount boolean not null default false,
  add column free_money boolean not null default false,
  add column card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  add column installment_number integer check (installment_number > 0),
  add column installment_total integer check (installment_total > 0),
  add column split_method text check (split_method in ('equal', 'income', 'fixed')),
  add column split_share numeric(5, 4) check (split_share between 0 and 1),
  add constraint transactions_surprise_private check (surprise_until is null or scope <> 'ours');

alter table public.upcoming_bills
  add column scope text not null default 'mine' check (scope in ('mine', 'ours'));
alter table public.subscriptions
  add column scope text not null default 'mine' check (scope in ('mine', 'ours'));

create index transactions_user_scope_date_idx on public.transactions (user_id, scope, transaction_date desc)
  where deleted_at is null;

-- Personal privacy rules ("só suas"): applied to the owner's new facts.
create table public.privacy_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  match_type text not null check (match_type in ('tag', 'merchant', 'account')),
  tag_id uuid,
  account_id uuid,
  pattern text check (pattern is null or length(trim(pattern)) between 2 and 60),
  action text not null check (action in ('category_only', 'hidden', 'ask_surprise')),
  created_at timestamptz not null default now(),
  foreign key (user_id, tag_id) references public.tags(user_id, id) on delete cascade,
  foreign key (user_id, account_id) references public.accounts(user_id, id) on delete cascade,
  check (
    (match_type = 'tag' and tag_id is not null) or
    (match_type = 'merchant' and pattern is not null) or
    (match_type = 'account' and account_id is not null)
  )
);

-- Split per category (by tag name, shared vocabulary of the couple). Absent = household default.
create table public.split_rules (
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null check (length(trim(category)) > 0),
  method text not null check (method in ('equal', 'income', 'fixed')),
  fixed_share numeric(5, 4) check (fixed_share between 0 and 1),
  primary key (household_id, category),
  check (method <> 'fixed' or fixed_share is not null)
);

create table public.household_budgets (
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null check (length(trim(category)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  primary key (household_id, category)
);
create table public.budget_alerts_sent (
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  threshold integer not null check (threshold in (80, 100)),
  sent_at timestamptz not null default now(),
  primary key (household_id, category, month, threshold)
);

create table public.free_money_allowances (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount_cents bigint not null check (amount_cents >= 0),
  effective_from date not null,
  primary key (household_id, user_id, effective_from)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  icon text,
  target_cents bigint not null check (target_cents > 0),
  deadline date,
  method text not null default 'percent' check (method in ('percent', 'fixed')),
  status text not null default 'pending' check (status in ('pending', 'active', 'done', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.goal_members (
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  percent numeric(5, 2) check (percent between 0 and 100),
  monthly_cents bigint check (monthly_cents >= 0),
  confirmed_at timestamptz,
  primary key (goal_id, user_id)
);
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount_cents bigint not null check (amount_cents <> 0),
  contributed_on date not null,
  automatic boolean not null default false,
  external_reference text,
  created_at timestamptz not null default now(),
  unique (goal_id, external_reference)
);
create table public.goal_milestones (
  goal_id uuid not null references public.goals(id) on delete cascade,
  percent integer not null check (percent in (25, 50, 75, 100)),
  reached_at timestamptz not null default now(),
  primary key (goal_id, percent)
);

-- "Combinados": a conversation before big shared purchases. Nothing is blocked at the bank.
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 80),
  merchant text,
  category text,
  amount_cents bigint not null check (amount_cents > 0),
  installments integer not null default 1 check (installments between 1 and 48),
  note text check (note is null or length(note) <= 280),
  status text not null default 'pending' check (status in ('pending', 'approved', 'talk', 'talked', 'withdrawn')),
  responded_by uuid references public.profiles(id) on delete restrict,
  response_note text check (response_note is null or length(response_note) <= 280),
  responded_at timestamptz,
  outcome_note text check (outcome_note is null or length(outcome_note) <= 280),
  talked_at timestamptz,
  created_at timestamptz not null default now()
);
create index approval_requests_household_idx on public.approval_requests (household_id, created_at desc);

-- Settling up (shared card invoice or month): the app never moves money, it records the agreement.
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('invoice', 'month')),
  reference text not null,
  from_user uuid not null references public.profiles(id) on delete restrict,
  to_user uuid not null references public.profiles(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  settled_at timestamptz not null default now(),
  settled_by uuid not null references public.profiles(id) on delete restrict,
  unique (household_id, kind, reference),
  check (from_user <> to_user)
);

create table public.retro_points (
  household_id uuid not null references public.households(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  point_key text not null,
  marked_by uuid not null references public.profiles(id) on delete restrict,
  marked_at timestamptz not null default now(),
  primary key (household_id, month, point_key)
);

create trigger households_updated_at before update on public.households
  for each row execute function public.set_updated_at();

-- Membership check for RLS, evaluated as the caller.
create or replace function public.is_household_member(p_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household and user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated, service_role;

-- RLS: members read their household; nobody writes directly (server code with service_role does).
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.household_proposals enable row level security;
alter table public.privacy_rules enable row level security;
alter table public.split_rules enable row level security;
alter table public.household_budgets enable row level security;
alter table public.budget_alerts_sent enable row level security;
alter table public.free_money_allowances enable row level security;
alter table public.goals enable row level security;
alter table public.goal_members enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.goal_milestones enable row level security;
alter table public.approval_requests enable row level security;
alter table public.settlements enable row level security;
alter table public.retro_points enable row level security;

alter table public.households force row level security;
alter table public.household_members force row level security;
alter table public.household_invites force row level security;
alter table public.household_proposals force row level security;
alter table public.privacy_rules force row level security;
alter table public.split_rules force row level security;
alter table public.household_budgets force row level security;
alter table public.budget_alerts_sent force row level security;
alter table public.free_money_allowances force row level security;
alter table public.goals force row level security;
alter table public.goal_members force row level security;
alter table public.goal_contributions force row level security;
alter table public.goal_milestones force row level security;
alter table public.approval_requests force row level security;
alter table public.settlements force row level security;
alter table public.retro_points force row level security;

create policy households_select on public.households for select to authenticated
  using ((select public.is_household_member(id)));
create policy household_members_select on public.household_members for select to authenticated
  using ((select public.is_household_member(household_id)));
create policy household_proposals_select on public.household_proposals for select to authenticated
  using ((select public.is_household_member(household_id)));
create policy split_rules_select on public.split_rules for select to authenticated
  using ((select public.is_household_member(household_id)));
create policy household_budgets_select on public.household_budgets for select to authenticated
  using ((select public.is_household_member(household_id)));
create policy budget_alerts_sent_select on public.budget_alerts_sent for select to authenticated
  using ((select public.is_household_member(household_id)));
create policy free_money_allowances_select on public.free_money_allowances for select to authenticated
  using ((select public.is_household_member(household_id)));
create policy goals_select on public.goals for select to authenticated
  using ((select public.is_household_member(household_id)));
create policy goal_members_select on public.goal_members for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and (select public.is_household_member(g.household_id))));
create policy goal_contributions_select on public.goal_contributions for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and (select public.is_household_member(g.household_id))));
create policy goal_milestones_select on public.goal_milestones for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and (select public.is_household_member(g.household_id))));
create policy approval_requests_select on public.approval_requests for select to authenticated
  using ((select public.is_household_member(household_id)));
create policy settlements_select on public.settlements for select to authenticated
  using ((select public.is_household_member(household_id)));
create policy retro_points_select on public.retro_points for select to authenticated
  using ((select public.is_household_member(household_id)));
-- Privacy rules are personal: only their owner reads them. Invites carry a code hash: server only.
create policy privacy_rules_select on public.privacy_rules for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.households, public.household_members, public.household_invites, public.household_proposals,
  public.privacy_rules, public.split_rules, public.household_budgets, public.budget_alerts_sent,
  public.free_money_allowances, public.goals, public.goal_members, public.goal_contributions,
  public.goal_milestones, public.approval_requests, public.settlements, public.retro_points
  from public, anon, authenticated;
grant select on public.households, public.household_members, public.household_proposals,
  public.privacy_rules, public.split_rules, public.household_budgets, public.budget_alerts_sent,
  public.free_money_allowances, public.goals, public.goal_members, public.goal_contributions,
  public.goal_milestones, public.approval_requests, public.settlements, public.retro_points
  to authenticated;
grant all on public.households, public.household_members, public.household_invites, public.household_proposals,
  public.privacy_rules, public.split_rules, public.household_budgets, public.budget_alerts_sent,
  public.free_money_allowances, public.goals, public.goal_members, public.goal_contributions,
  public.goal_milestones, public.approval_requests, public.settlements, public.retro_points
  to service_role;
revoke all on function public.household_max_two() from public, anon, authenticated;

-- Provider import now also carries card final, installments and the initial owner (partner card).
-- Scope is set only on insert: once a person marks a purchase as Nosso, re-imports keep it.
create or replace function public.upsert_provider_transactions(p_user uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare inserted integer;
begin
  perform set_config('prumo.source', 'pluggy', true);
  perform set_config('prumo.provider_sync', 'on', true);
  with incoming as (
    select * from jsonb_to_recordset(p_rows) as r(
      account_id uuid, pluggy_transaction_id text, provider_reference_scope text, amount_cents bigint,
      type text, provider_description text, merchant text, normalized_merchant text,
      transaction_date date, posted_at timestamptz, tag_id uuid, category_confidence numeric, category_source text,
      card_last4 text, installment_number integer, installment_total integer, scope text)
  ), written as (
    insert into public.transactions as t (user_id, account_id, pluggy_transaction_id, provider_reference_scope,
      amount_cents, type, provider_description, merchant, normalized_merchant, transaction_date, posted_at,
      tag_id, category_confidence, category_source, source, card_last4, installment_number, installment_total, scope)
    select p_user, account_id, pluggy_transaction_id, provider_reference_scope, amount_cents, type,
      provider_description, merchant, normalized_merchant, transaction_date, posted_at,
      tag_id, category_confidence, category_source, 'pluggy', card_last4, installment_number, installment_total,
      coalesce(scope, 'mine')
    from incoming
    on conflict (user_id, provider_reference_scope, pluggy_transaction_id) where pluggy_transaction_id is not null
    do update set
      amount_cents = excluded.amount_cents,
      type = excluded.type,
      provider_description = excluded.provider_description,
      merchant = excluded.merchant,
      normalized_merchant = excluded.normalized_merchant,
      transaction_date = excluded.transaction_date,
      posted_at = excluded.posted_at,
      card_last4 = excluded.card_last4,
      installment_number = excluded.installment_number,
      installment_total = excluded.installment_total,
      tag_id = case when t.category_source = 'user' then t.tag_id else excluded.tag_id end,
      category_confidence = case when t.category_source = 'user' then t.category_confidence else excluded.category_confidence end,
      category_source = case when t.category_source = 'user' then t.category_source else excluded.category_source end
    where (t.amount_cents, t.type, t.provider_description, t.transaction_date, t.tag_id, t.card_last4, t.installment_number)
      is distinct from (excluded.amount_cents, excluded.type, excluded.provider_description, excluded.transaction_date,
        case when t.category_source = 'user' then t.tag_id else excluded.tag_id end, excluded.card_last4, excluded.installment_number)
    returning (t.xmax::text = '0') as is_insert
  )
  select count(*) filter (where is_insert) into inserted from written;
  perform set_config('prumo.provider_sync', 'off', true);
  return inserted;
end;
$$;
revoke all on function public.upsert_provider_transactions(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_provider_transactions(uuid, jsonb) to service_role;

commit;
