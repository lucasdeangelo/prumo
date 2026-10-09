-- Phase 2: one atomic schema + RLS migration. Never apply user tables without policies.
begin;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text,
  timezone text not null default 'America/Sao_Paulo',
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pluggy_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  pluggy_item_id text not null,
  connector_id text,
  institution_name text,
  status text,
  error_code text,
  last_sync_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, pluggy_item_id)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  pluggy_item_id uuid,
  pluggy_account_id text,
  name text not null check (length(trim(name)) > 0),
  type text,
  subtype text,
  balance_cents bigint,
  balance_synced_at timestamptz,
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  is_manual boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, pluggy_item_id) references public.pluggy_items(user_id, id)
    on delete set null (pluggy_item_id),
  check (not is_manual or (pluggy_item_id is null and pluggy_account_id is null))
);
create unique index accounts_provider_identity_idx
  on public.accounts (user_id, pluggy_item_id, pluggy_account_id)
  where pluggy_item_id is not null and pluggy_account_id is not null;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  color text,
  icon text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, name)
);

create table public.tag_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  pattern text not null check (length(trim(pattern)) > 0),
  pattern_type text not null check (pattern_type in ('merchant', 'description', 'contains', 'exact')),
  tag_id uuid not null,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, tag_id) references public.tags(user_id, id) on delete cascade
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  account_id uuid,
  pluggy_transaction_id text,
  provider_reference_scope text,
  amount_cents bigint not null check (amount_cents > 0),
  type text not null check (type in ('credit', 'debit')),
  provider_description text,
  user_description text,
  merchant text,
  normalized_merchant text,
  transaction_date date not null,
  posted_at timestamptz,
  tag_id uuid,
  category_confidence numeric(4,3) check (category_confidence between 0 and 1),
  category_source text,
  source text not null check (source in ('manual', 'pluggy', 'whatsapp', 'upcoming_reconciliation', 'subscription_reconciliation', 'import')),
  external_reference text,
  is_reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, id),
  foreign key (user_id, account_id) references public.accounts(user_id, id)
    on delete set null (account_id),
  foreign key (user_id, tag_id) references public.tags(user_id, id)
    on delete set null (tag_id),
  check (pluggy_transaction_id is null or provider_reference_scope is not null),
  check (source <> 'pluggy' or pluggy_transaction_id is not null or external_reference is not null)
);
create unique index transactions_pluggy_identity_idx
  on public.transactions (user_id, provider_reference_scope, pluggy_transaction_id)
  where pluggy_transaction_id is not null;
create unique index transactions_external_identity_idx
  on public.transactions (user_id, source, external_reference)
  where external_reference is not null;
create index transactions_user_date_idx on public.transactions (user_id, transaction_date desc) where deleted_at is null;
create index transactions_account_date_idx on public.transactions (user_id, account_id, transaction_date desc) where deleted_at is null;
create index transactions_tag_date_idx on public.transactions (user_id, tag_id, transaction_date desc) where deleted_at is null;

create table public.upcoming_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  account_id uuid,
  description text not null check (length(trim(description)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  type text not null check (type in ('payable', 'receivable')),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'cancelled')),
  recurrence_type text not null default 'once' check (recurrence_type in ('once', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'custom')),
  recurrence_interval integer check (recurrence_interval > 0),
  recurrence_unit text check (recurrence_unit in ('day', 'week', 'month', 'year')),
  tag_id uuid,
  notify_days_before integer not null default 3 check (notify_days_before >= 0),
  matched_transaction_id uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, id),
  foreign key (user_id, account_id) references public.accounts(user_id, id)
    on delete set null (account_id),
  foreign key (user_id, tag_id) references public.tags(user_id, id)
    on delete set null (tag_id),
  foreign key (user_id, matched_transaction_id) references public.transactions(user_id, id)
    on delete set null (matched_transaction_id),
  check (recurrence_type <> 'custom' or (recurrence_interval is not null and recurrence_unit is not null))
);
create unique index upcoming_matched_transaction_idx
  on public.upcoming_bills (matched_transaction_id)
  where matched_transaction_id is not null and deleted_at is null;
create index upcoming_user_due_idx on public.upcoming_bills (user_id, due_date) where deleted_at is null;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  normalized_name text not null check (length(trim(normalized_name)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  frequency text not null check (frequency in ('weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'custom')),
  next_charge_date date,
  account_id uuid,
  tag_id uuid,
  status text not null check (status in ('candidate', 'active', 'paused', 'cancelled', 'rejected')),
  is_auto_detected boolean not null default false,
  detection_confidence numeric(4,3) check (detection_confidence between 0 and 1),
  notify_days_before integer not null default 3 check (notify_days_before >= 0),
  last_amount_change_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, id),
  foreign key (user_id, account_id) references public.accounts(user_id, id)
    on delete set null (account_id),
  foreign key (user_id, tag_id) references public.tags(user_id, id)
    on delete set null (tag_id)
);
create index subscriptions_user_status_idx on public.subscriptions (user_id, status) where deleted_at is null;
create index subscriptions_user_name_idx on public.subscriptions (user_id, normalized_name) where deleted_at is null;

create table public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  subscription_id uuid not null,
  transaction_id uuid,
  amount_cents bigint not null check (amount_cents > 0),
  charged_at date not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, subscription_id) references public.subscriptions(user_id, id) on delete restrict,
  foreign key (user_id, transaction_id) references public.transactions(user_id, id)
    on delete set null (transaction_id)
);
create unique index subscription_history_fact_idx
  on public.subscription_history (subscription_id, transaction_id)
  where transaction_id is not null;

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  type text not null check (type in ('low_balance', 'large_transaction', 'bill_due', 'subscription_charge', 'weekly_summary', 'monthly_summary')),
  threshold_cents bigint check (threshold_cents > 0),
  reference_id uuid,
  channel text not null default 'in_app',
  is_active boolean not null default true,
  notify_days_before integer check (notify_days_before >= 0),
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  phone_normalized text not null check (phone_normalized ~ '^\+[1-9][0-9]{7,14}$'),
  verified_at timestamptz,
  verification_code_hash text,
  verification_expires_at timestamptz,
  verification_attempts integer not null default 0 check (verification_attempts >= 0),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, id)
);
create unique index whatsapp_active_phone_idx
  on public.whatsapp_links (phone_normalized) where revoked_at is null;

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text,
  dedupe_key text,
  event_type text not null,
  payload_hash text,
  status text not null check (status in ('received', 'processing', 'processed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  check (external_event_id is not null or dedupe_key is not null)
);
create unique index webhook_external_event_idx on public.webhook_events (provider, external_event_id)
  where external_event_id is not null;
create unique index webhook_fallback_dedupe_idx on public.webhook_events (provider, dedupe_key)
  where dedupe_key is not null;

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  scope text not null,
  idempotency_key text not null,
  request_hash text,
  response_data jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique nulls not distinct (user_id, scope, idempotency_key)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text,
  entity_id uuid,
  source text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index audit_user_created_idx on public.audit_logs (user_id, created_at desc);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  channel text not null,
  type text not null,
  payload jsonb not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  leased_until timestamptz,
  sent_at timestamptz,
  last_error text,
  dedupe_key text,
  created_at timestamptz not null default now()
);
create unique index notification_dedupe_idx
  on public.notification_outbox (user_id, channel, dedupe_key) where dedupe_key is not null;
create index notification_ready_idx on public.notification_outbox (status, scheduled_for)
  where status in ('pending', 'failed');

-- updated_at is database-maintained, including writes by trusted background jobs.
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger pluggy_items_updated_at before update on public.pluggy_items for each row execute function public.set_updated_at();
create trigger accounts_updated_at before update on public.accounts for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();
create trigger upcoming_updated_at before update on public.upcoming_bills for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

-- All user-bearing tables are RLS protected. Internal queues/events are service-only.
alter table public.profiles enable row level security;
alter table public.pluggy_items enable row level security;
alter table public.accounts enable row level security;
alter table public.tags enable row level security;
alter table public.tag_rules enable row level security;
alter table public.transactions enable row level security;
alter table public.upcoming_bills enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_history enable row level security;
alter table public.alerts enable row level security;
alter table public.whatsapp_links enable row level security;
alter table public.webhook_events enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notification_outbox enable row level security;

alter table public.profiles force row level security;
alter table public.pluggy_items force row level security;
alter table public.accounts force row level security;
alter table public.tags force row level security;
alter table public.tag_rules force row level security;
alter table public.transactions force row level security;
alter table public.upcoming_bills force row level security;
alter table public.subscriptions force row level security;
alter table public.subscription_history force row level security;
alter table public.alerts force row level security;
alter table public.whatsapp_links force row level security;
alter table public.webhook_events force row level security;
alter table public.idempotency_keys force row level security;
alter table public.audit_logs force row level security;
alter table public.notification_outbox force row level security;

-- Tenant data: SELECT and permitted mutations always derive identity from auth.uid().
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy pluggy_items_select on public.pluggy_items for select to authenticated using (user_id = (select auth.uid()));

create policy accounts_select on public.accounts for select to authenticated using (user_id = (select auth.uid()));
create policy accounts_insert on public.accounts for insert to authenticated with check (user_id = (select auth.uid()) and is_manual and pluggy_item_id is null and pluggy_account_id is null);
create policy accounts_update on public.accounts for update to authenticated using (user_id = (select auth.uid()) and is_manual) with check (user_id = (select auth.uid()) and is_manual and pluggy_item_id is null and pluggy_account_id is null);

create policy tags_select on public.tags for select to authenticated using (user_id = (select auth.uid()));
create policy tags_insert on public.tags for insert to authenticated with check (user_id = (select auth.uid()));
create policy tags_update on public.tags for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy tags_delete on public.tags for delete to authenticated using (user_id = (select auth.uid()));

create policy tag_rules_select on public.tag_rules for select to authenticated using (user_id = (select auth.uid()));
create policy tag_rules_insert on public.tag_rules for insert to authenticated with check (user_id = (select auth.uid()));
create policy tag_rules_update on public.tag_rules for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy tag_rules_delete on public.tag_rules for delete to authenticated using (user_id = (select auth.uid()));

create policy transactions_select on public.transactions for select to authenticated using (user_id = (select auth.uid()));
create policy transactions_insert on public.transactions for insert to authenticated with check (user_id = (select auth.uid()) and source = 'manual' and pluggy_transaction_id is null and provider_reference_scope is null);
create policy transactions_update on public.transactions for update to authenticated using (user_id = (select auth.uid()) and source = 'manual') with check (user_id = (select auth.uid()) and source = 'manual');

create policy upcoming_select on public.upcoming_bills for select to authenticated using (user_id = (select auth.uid()));
create policy upcoming_insert on public.upcoming_bills for insert to authenticated with check (user_id = (select auth.uid()) and matched_transaction_id is null and status = 'pending');
create policy upcoming_update on public.upcoming_bills for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy subscriptions_select on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy subscriptions_insert on public.subscriptions for insert to authenticated with check (user_id = (select auth.uid()) and not is_auto_detected);
create policy subscriptions_update on public.subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy subscription_history_select on public.subscription_history for select to authenticated using (user_id = (select auth.uid()));

create policy alerts_select on public.alerts for select to authenticated using (user_id = (select auth.uid()));
create policy alerts_insert on public.alerts for insert to authenticated with check (user_id = (select auth.uid()));
create policy alerts_update on public.alerts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy alerts_delete on public.alerts for delete to authenticated using (user_id = (select auth.uid()));

create policy whatsapp_links_select on public.whatsapp_links for select to authenticated using (user_id = (select auth.uid()));
-- Link creation and verification require trusted, rate-limited server routines in Phase 13.

create policy audit_logs_select on public.audit_logs for select to authenticated using (user_id = (select auth.uid()));
-- webhook_events, idempotency_keys and notification_outbox have no user-facing policies.

revoke all on public.profiles, public.pluggy_items, public.accounts, public.tags, public.tag_rules,
  public.transactions, public.upcoming_bills, public.subscriptions, public.subscription_history,
  public.alerts, public.whatsapp_links, public.webhook_events, public.idempotency_keys,
  public.audit_logs, public.notification_outbox from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Phase 2 exposes reads only. Future phases grant writes alongside audited domain operations.
grant select on public.profiles, public.pluggy_items, public.accounts, public.tags,
  public.tag_rules, public.transactions, public.upcoming_bills, public.subscriptions,
  public.subscription_history, public.alerts, public.whatsapp_links, public.audit_logs
  to authenticated;

-- Supabase service_role bypasses RLS. Backend code must still check ownership explicitly.
grant all on public.profiles, public.pluggy_items, public.accounts, public.tags, public.tag_rules,
  public.transactions, public.upcoming_bills, public.subscriptions, public.subscription_history,
  public.alerts, public.whatsapp_links, public.webhook_events, public.idempotency_keys,
  public.audit_logs, public.notification_outbox to service_role;

commit;
