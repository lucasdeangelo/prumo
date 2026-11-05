-- Phases 3-15: controlled write paths, audit, recurrence chain, outbox claim.
-- Authenticated users keep SELECT only. Every write goes through server code
-- (service_role + explicit user_id) or the security definer routines below,
-- which are executable by service_role only.
begin;

-- Tags that represent money moving between own accounts are excluded from income/spending.
alter table public.tags add column excluded_from_totals boolean not null default false;

-- WhatsApp linking: a pending code exists before the phone is known; the phone is
-- proven by the WhatsApp sender when the code is redeemed.
alter table public.whatsapp_links alter column phone_normalized drop not null;
alter table public.whatsapp_links add constraint whatsapp_verified_has_phone
  check (verified_at is null or phone_normalized is not null);
create unique index whatsapp_pending_code_idx on public.whatsapp_links (verification_code_hash)
  where verification_code_hash is not null;

-- One subscription per normalized name (any status, including rejected detections).
create unique index subscriptions_user_normalized_unique_idx
  on public.subscriptions (user_id, normalized_name) where deleted_at is null;

-- Recurring bills form a chain; each paid bill produces at most one successor.
alter table public.upcoming_bills add column parent_bill_id uuid;
alter table public.upcoming_bills add constraint upcoming_parent_same_user
  foreign key (user_id, parent_bill_id) references public.upcoming_bills(user_id, id)
  on delete set null (parent_bill_id);
create unique index upcoming_parent_unique_idx on public.upcoming_bills (parent_bill_id)
  where parent_bill_id is not null;

create index transactions_user_merchant_idx on public.transactions (user_id, normalized_merchant)
  where deleted_at is null;
create index whatsapp_verified_phone_idx on public.whatsapp_links (phone_normalized)
  where verified_at is not null and revoked_at is null;

-- Append-only audit of financial rows, written in the same transaction as the change.
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
  changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into changed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key) and n.key <> 'updated_at';
    if changed is null then return new; end if;
  end if;
  insert into public.audit_logs (user_id, action, entity_type, entity_id, source, metadata)
  values (
    (row_data ->> 'user_id')::uuid,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    (row_data ->> 'id')::uuid,
    coalesce(nullif(current_setting('prumo.source', true), ''), row_data ->> 'source', 'app'),
    case when changed is null then null else jsonb_build_object('changed', to_jsonb(changed)) end
  );
  return coalesce(new, old);
end;
$$;

create trigger transactions_audit after insert or update or delete on public.transactions
  for each row execute function public.audit_row_change();
create trigger upcoming_audit after insert or update or delete on public.upcoming_bills
  for each row execute function public.audit_row_change();
create trigger subscriptions_audit after insert or update or delete on public.subscriptions
  for each row execute function public.audit_row_change();
create trigger accounts_audit after insert or update or delete on public.accounts
  for each row execute function public.audit_row_change();
create trigger tag_rules_audit after insert or update or delete on public.tag_rules
  for each row execute function public.audit_row_change();

-- Provider facts keep their imported values; only user metadata may change afterwards.
create or replace function public.protect_provider_facts()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.source = 'pluggy'
     and coalesce(current_setting('prumo.provider_sync', true), '') <> 'on'
     and (new.amount_cents, new.type, new.transaction_date, new.provider_description)
         is distinct from (old.amount_cents, old.type, old.transaction_date, old.provider_description) then
    raise exception 'Provider transaction facts are immutable' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger transactions_protect_provider before update on public.transactions
  for each row execute function public.protect_provider_facts();

-- Idempotent onboarding: profile plus default tags.
create or replace function public.ensure_profile(p_user uuid, p_display_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (p_user, nullif(trim(p_display_name), ''))
  on conflict (id) do nothing;
  insert into public.tags (user_id, name, color, icon, is_default, excluded_from_totals)
  select p_user, t.name, t.color, t.icon, true, t.excluded
  from (values
    ('Alimentação', '#eb6834', 'utensils', false),
    ('Mercado', '#1baf7a', 'shopping-cart', false),
    ('Transporte', '#2a78d6', 'car', false),
    ('Moradia', '#6250d6', 'home', false),
    ('Contas', '#eda100', 'receipt', false),
    ('Saúde', '#e34948', 'heart-pulse', false),
    ('Educação', '#008300', 'graduation-cap', false),
    ('Lazer', '#e87ba4', 'party-popper', false),
    ('Assinaturas', '#9085e9', 'repeat', false),
    ('Compras', '#d95926', 'shopping-bag', false),
    ('Salário', '#199e70', 'banknote', false),
    ('Investimentos', '#256abf', 'trending-up', true),
    ('Transferências', '#898781', 'arrow-left-right', true),
    ('Outros', '#52514e', 'circle', false)
  ) as t(name, color, icon, excluded)
  on conflict (user_id, name) do nothing;
end;
$$;

create or replace function public.next_due_date(p_date date, p_type text, p_interval integer, p_unit text)
returns date language sql immutable set search_path = '' as $$
  select (case p_type
    when 'weekly' then p_date + interval '1 week'
    when 'monthly' then p_date + interval '1 month'
    when 'bimonthly' then p_date + interval '2 months'
    when 'quarterly' then p_date + interval '3 months'
    when 'semiannual' then p_date + interval '6 months'
    when 'annual' then p_date + interval '1 year'
    when 'custom' then p_date + make_interval(
      days => case p_unit when 'day' then p_interval else 0 end,
      weeks => case p_unit when 'week' then p_interval else 0 end,
      months => case p_unit when 'month' then p_interval else 0 end,
      years => case p_unit when 'year' then p_interval else 0 end)
  end)::date;
$$;

-- Settles a bill exactly once: links an existing fact or creates one, then schedules the successor.
create or replace function public.mark_bill_paid(
  p_user uuid, p_bill uuid, p_transaction uuid default null, p_paid_on date default null, p_source text default 'app'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  bill public.upcoming_bills%rowtype;
  fact public.transactions%rowtype;
  fact_id uuid;
  successor uuid;
begin
  perform set_config('prumo.source', p_source, true);
  select * into bill from public.upcoming_bills
  where id = p_bill and user_id = p_user and deleted_at is null for update;
  if not found then raise exception 'Bill not found' using errcode = 'no_data_found'; end if;
  if bill.status = 'paid' then
    return jsonb_build_object('already_paid', true, 'transaction_id', bill.matched_transaction_id);
  end if;
  if bill.status = 'cancelled' then raise exception 'Bill is cancelled' using errcode = 'check_violation'; end if;

  if p_transaction is not null then
    select * into fact from public.transactions
    where id = p_transaction and user_id = p_user and deleted_at is null for update;
    if not found then raise exception 'Transaction not found' using errcode = 'no_data_found'; end if;
    if fact.type <> (case bill.type when 'payable' then 'debit' else 'credit' end) then
      raise exception 'Transaction direction does not match bill' using errcode = 'check_violation';
    end if;
    fact_id := fact.id;
  else
    insert into public.transactions (user_id, account_id, amount_cents, type, user_description,
      transaction_date, tag_id, category_source, category_confidence, source, external_reference, is_reviewed)
    values (p_user, bill.account_id, bill.amount_cents,
      case bill.type when 'payable' then 'debit' else 'credit' end,
      bill.description, coalesce(p_paid_on, current_date), bill.tag_id,
      case when bill.tag_id is null then null else 'user' end,
      case when bill.tag_id is null then null else 1 end,
      'upcoming_reconciliation', 'bill:' || bill.id::text, true)
    on conflict (user_id, source, external_reference) where external_reference is not null do nothing
    returning id into fact_id;
    if fact_id is null then
      select id into fact_id from public.transactions
      where user_id = p_user and source = 'upcoming_reconciliation' and external_reference = 'bill:' || bill.id::text;
    end if;
  end if;

  update public.upcoming_bills
  set status = 'paid', paid_at = now(), matched_transaction_id = fact_id
  where id = bill.id;

  if bill.recurrence_type <> 'once' then
    insert into public.upcoming_bills (user_id, account_id, description, amount_cents, type, due_date,
      recurrence_type, recurrence_interval, recurrence_unit, tag_id, notify_days_before, parent_bill_id)
    values (p_user, bill.account_id, bill.description, bill.amount_cents, bill.type,
      public.next_due_date(bill.due_date, bill.recurrence_type, bill.recurrence_interval, bill.recurrence_unit),
      bill.recurrence_type, bill.recurrence_interval, bill.recurrence_unit, bill.tag_id,
      bill.notify_days_before, bill.id)
    on conflict (parent_bill_id) where parent_bill_id is not null do nothing
    returning id into successor;
  end if;

  return jsonb_build_object('already_paid', false, 'transaction_id', fact_id, 'next_bill_id', successor);
end;
$$;

-- Imports provider facts. Replays converge on one row; user-chosen tags are never overwritten.
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
      transaction_date date, posted_at timestamptz, tag_id uuid, category_confidence numeric, category_source text)
  ), written as (
    insert into public.transactions as t (user_id, account_id, pluggy_transaction_id, provider_reference_scope,
      amount_cents, type, provider_description, merchant, normalized_merchant, transaction_date, posted_at,
      tag_id, category_confidence, category_source, source)
    select p_user, account_id, pluggy_transaction_id, provider_reference_scope, amount_cents, type,
      provider_description, merchant, normalized_merchant, transaction_date, posted_at,
      tag_id, category_confidence, category_source, 'pluggy'
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
      tag_id = case when t.category_source = 'user' then t.tag_id else excluded.tag_id end,
      category_confidence = case when t.category_source = 'user' then t.category_confidence else excluded.category_confidence end,
      category_source = case when t.category_source = 'user' then t.category_source else excluded.category_source end
    where (t.amount_cents, t.type, t.provider_description, t.transaction_date, t.tag_id)
      is distinct from (excluded.amount_cents, excluded.type, excluded.provider_description, excluded.transaction_date,
        case when t.category_source = 'user' then t.tag_id else excluded.tag_id end)
    returning (t.xmax::text = '0') as is_insert
  )
  select count(*) filter (where is_insert) into inserted from written;
  perform set_config('prumo.provider_sync', 'off', true);
  return inserted;
end;
$$;

-- Leases WhatsApp notifications so concurrent workers never deliver the same row twice.
create or replace function public.claim_notifications(p_channel text, p_limit integer, p_lease_seconds integer)
returns setof public.notification_outbox language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.notification_outbox o
  set status = 'processing', leased_until = now() + make_interval(secs => p_lease_seconds), attempts = o.attempts + 1
  where o.id in (
    select id from public.notification_outbox
    where channel = p_channel and attempts < 5 and scheduled_for <= now()
      and (status in ('pending', 'failed') or (status = 'processing' and leased_until < now()))
    order by scheduled_for
    limit p_limit
    for update skip locked
  )
  returning o.*;
end;
$$;

revoke all on function public.audit_row_change(), public.protect_provider_facts(),
  public.ensure_profile(uuid, text), public.next_due_date(date, text, integer, text),
  public.mark_bill_paid(uuid, uuid, uuid, date, text), public.upsert_provider_transactions(uuid, jsonb),
  public.claim_notifications(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ensure_profile(uuid, text), public.next_due_date(date, text, integer, text),
  public.mark_bill_paid(uuid, uuid, uuid, date, text), public.upsert_provider_transactions(uuid, jsonb),
  public.claim_notifications(text, integer, integer)
  to service_role;

commit;
