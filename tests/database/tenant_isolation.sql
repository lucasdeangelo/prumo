-- Runs only against the local prumo_test database with bootstrap.sql applied.
\set ON_ERROR_STOP on
begin;

create function public.test_expect_denied(statement text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
  begin
    execute statement;
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'Expected permission/RLS denial: %', statement;
  end if;
end;
$$;

create function public.test_expect_fk_denied(statement text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
  begin
    execute statement;
  exception when foreign_key_violation then
    blocked := true;
  end;
  if not blocked then
    raise exception 'Expected same-tenant FK denial: %', statement;
  end if;
end;
$$;

create function public.test_expect_unique_denied(statement text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
  begin
    execute statement;
  exception when unique_violation then
    blocked := true;
  end;
  if not blocked then
    raise exception 'Expected idempotency uniqueness denial: %', statement;
  end if;
end;
$$;

-- Realistic but entirely fictional user fixtures.
insert into auth.users(id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
insert into public.profiles(id, display_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Pessoa A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Pessoa B');

insert into public.pluggy_items(id, user_id, pluggy_item_id) values
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'item-a'),
  ('b1111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'item-b');
insert into public.accounts(id, user_id, name, is_manual) values
  ('a2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Conta A', true),
  ('b2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Conta B', true);
insert into public.tags(id, user_id, name) values
  ('a3333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Alimentação'),
  ('b3333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Alimentação');
insert into public.tag_rules(id, user_id, pattern, pattern_type, tag_id) values
  ('a4444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'mercado', 'contains', 'a3333333-3333-4333-8333-333333333333'),
  ('b4444444-4444-4444-8444-444444444444', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'mercado', 'contains', 'b3333333-3333-4333-8333-333333333333');
insert into public.transactions(id, user_id, account_id, tag_id, amount_cents, type, user_description, transaction_date, source) values
  ('a5555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a2222222-2222-4222-8222-222222222222', 'a3333333-3333-4333-8333-333333333333', 1500, 'debit', 'Café', current_date, 'manual'),
  ('b5555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b2222222-2222-4222-8222-222222222222', 'b3333333-3333-4333-8333-333333333333', 2500, 'debit', 'Almoço', current_date, 'manual');
insert into public.upcoming_bills(id, user_id, account_id, description, amount_cents, type, due_date) values
  ('a6666666-6666-4666-8666-666666666666', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a2222222-2222-4222-8222-222222222222', 'Luz A', 8500, 'payable', current_date),
  ('b6666666-6666-4666-8666-666666666666', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b2222222-2222-4222-8222-222222222222', 'Luz B', 9500, 'payable', current_date);
insert into public.subscriptions(id, user_id, name, normalized_name, amount_cents, frequency, status) values
  ('a7777777-7777-4777-8777-777777777777', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Vídeo A', 'video a', 3990, 'monthly', 'active'),
  ('b7777777-7777-4777-8777-777777777777', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Vídeo B', 'video b', 4490, 'monthly', 'active');
insert into public.subscription_history(id, user_id, subscription_id, transaction_id, amount_cents, charged_at) values
  ('a8888888-8888-4888-8888-888888888888', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a7777777-7777-4777-8777-777777777777', 'a5555555-5555-4555-8555-555555555555', 3990, current_date),
  ('b8888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b7777777-7777-4777-8777-777777777777', 'b5555555-5555-4555-8555-555555555555', 4490, current_date);
insert into public.alerts(id, user_id, type) values
  ('a9999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bill_due'),
  ('b9999999-9999-4999-8999-999999999999', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bill_due');
insert into public.whatsapp_links(user_id, phone_normalized) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '+5511999990001'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '+5511999990002');
insert into public.audit_logs(user_id, action, source) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'fixture.created', 'test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'fixture.created', 'test');
insert into public.notification_outbox(user_id, channel, type, payload, scheduled_for, dedupe_key) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'in_app', 'bill_due', '{}', now(), 'bill-due-b');
insert into public.webhook_events(provider, external_event_id, event_type, status) values
  ('fixture', 'event-1', 'test', 'processed');
insert into public.idempotency_keys(user_id, scope, idempotency_key) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bill-paid', 'fixture-1');

-- Schema and grant checks: all 15 tables must be RLS-enabled and forced.
do $$
declare protected_count integer;
declare table_name text;
begin
  select count(*) into protected_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity
    and c.relname = any (array['profiles','pluggy_items','accounts','tags','tag_rules','transactions',
      'upcoming_bills','subscriptions','subscription_history','alerts','whatsapp_links',
      'webhook_events','idempotency_keys','audit_logs','notification_outbox']);
  if protected_count <> 15 then raise exception 'Expected 15 RLS-protected tables, got %', protected_count; end if;
  foreach table_name in array array['accounts','pluggy_items','transactions','tags','tag_rules','upcoming_bills','subscriptions','alerts','whatsapp_links'] loop
    if has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT') then
      raise exception 'Direct INSERT unexpectedly granted on %', table_name;
    end if;
  end loop;
end;
$$;

-- Composite FKs must reject relationships crossing tenant boundaries even for privileged writers.
select public.test_expect_fk_denied($$insert into public.accounts(user_id, pluggy_item_id, name) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'b1111111-1111-4111-8111-111111111111', 'Wrong item')$$);
select public.test_expect_fk_denied($$insert into public.tag_rules(user_id, pattern, pattern_type, tag_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bad', 'exact', 'b3333333-3333-4333-8333-333333333333')$$);
select public.test_expect_fk_denied($$insert into public.transactions(user_id, account_id, amount_cents, type, transaction_date, source) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'b2222222-2222-4222-8222-222222222222', 100, 'debit', current_date, 'manual')$$);
select public.test_expect_fk_denied($$insert into public.transactions(user_id, tag_id, amount_cents, type, transaction_date, source) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'b3333333-3333-4333-8333-333333333333', 100, 'debit', current_date, 'manual')$$);
select public.test_expect_fk_denied($$insert into public.upcoming_bills(user_id, description, amount_cents, type, due_date, matched_transaction_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Wrong fact', 100, 'payable', current_date, 'b5555555-5555-4555-8555-555555555555')$$);
select public.test_expect_fk_denied($$insert into public.subscriptions(user_id, name, normalized_name, amount_cents, frequency, status, account_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Wrong account', 'wrong account', 100, 'monthly', 'active', 'b2222222-2222-4222-8222-222222222222')$$);
select public.test_expect_fk_denied($$insert into public.subscription_history(user_id, subscription_id, amount_cents, charged_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'b7777777-7777-4777-8777-777777777777', 100, current_date)$$);

-- Temporarily grant DML to exercise RLS itself; rollback removes these grants.
grant select, insert, update, delete on public.profiles, public.pluggy_items, public.accounts,
  public.tags, public.tag_rules, public.transactions, public.upcoming_bills,
  public.subscriptions, public.subscription_history, public.alerts, public.whatsapp_links,
  public.audit_logs, public.webhook_events, public.idempotency_keys, public.notification_outbox
  to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare table_name text;
declare own_count integer;
declare other_count integer;
declare affected integer;
begin
  if (select count(*) from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1 then raise exception 'A profile invisible'; end if;
  if (select count(*) from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> 0 then raise exception 'B profile visible'; end if;
  update public.profiles set display_name = 'tampered' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'B profile update succeeded'; end if;
  delete from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'B profile delete succeeded'; end if;

  foreach table_name in array array['pluggy_items','accounts','tags','tag_rules','transactions','upcoming_bills','subscriptions','subscription_history','alerts','whatsapp_links','audit_logs'] loop
    execute format('select count(*) from public.%I where user_id = $1', table_name) into own_count using 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
    execute format('select count(*) from public.%I where user_id = $1', table_name) into other_count using 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid;
    if own_count < 1 or other_count <> 0 then raise exception '% leaked or hid rows: own %, other %', table_name, own_count, other_count; end if;

    execute format('update public.%I set user_id = user_id where user_id = $1', table_name) using 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception '% allowed B UPDATE', table_name; end if;
    execute format('delete from public.%I where user_id = $1', table_name) using 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception '% allowed B DELETE', table_name; end if;
  end loop;
  if (select count(*) from public.notification_outbox) <> 0 then raise exception 'outbox exposed'; end if;
  if (select count(*) from public.webhook_events) <> 0 then raise exception 'webhook exposed'; end if;
  if (select count(*) from public.idempotency_keys) <> 0 then raise exception 'idempotency keys exposed'; end if;
end;
$$;

-- Every required resource rejects an attempt by A to create a row owned by B.
select public.test_expect_denied($$insert into public.profiles(id) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$);
select public.test_expect_denied($$insert into public.pluggy_items(user_id, pluggy_item_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'spoof')$$);
select public.test_expect_denied($$insert into public.accounts(user_id, name, is_manual) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'spoof', true)$$);
select public.test_expect_denied($$insert into public.tags(user_id, name) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'spoof')$$);
select public.test_expect_denied($$insert into public.tag_rules(user_id, pattern, pattern_type, tag_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'spoof', 'exact', 'b3333333-3333-4333-8333-333333333333')$$);
select public.test_expect_denied($$insert into public.transactions(user_id, amount_cents, type, transaction_date, source) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 100, 'debit', current_date, 'manual')$$);
select public.test_expect_denied($$insert into public.upcoming_bills(user_id, description, amount_cents, type, due_date) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'spoof', 100, 'payable', current_date)$$);
select public.test_expect_denied($$insert into public.subscriptions(user_id, name, normalized_name, amount_cents, frequency, status) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'spoof', 'spoof', 100, 'monthly', 'active')$$);
select public.test_expect_denied($$insert into public.alerts(user_id, type) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bill_due')$$);
select public.test_expect_denied($$insert into public.whatsapp_links(user_id, phone_normalized) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '+5511999990003')$$);
select public.test_expect_denied($$insert into public.subscription_history(user_id, subscription_id, amount_cents, charged_at) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b7777777-7777-4777-8777-777777777777', 100, current_date)$$);
select public.test_expect_denied($$insert into public.audit_logs(user_id, action, source) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'spoof', 'test')$$);

reset role;

-- Historical facts survive hard account removal and subscription deletion is restricted.
insert into public.accounts(id, user_id, name, is_manual) values
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Temporary', true);
insert into public.transactions(id, user_id, account_id, amount_cents, type, transaction_date, source) values
  ('b0000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000001', 100, 'debit', current_date, 'manual');
delete from public.accounts where id = 'b0000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from public.transactions where id = 'b0000000-0000-4000-8000-000000000002' and account_id is null) <> 1 then
    raise exception 'Account deletion erased or retained a dangling transaction link';
  end if;
end $$;
select public.test_expect_fk_denied($$delete from public.subscriptions where id = 'b7777777-7777-4777-8777-777777777777'$$);

-- Database-level replay guards for provider facts, webhooks and notifications.
insert into public.transactions(user_id, amount_cents, type, transaction_date, source, provider_reference_scope, pluggy_transaction_id)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 100, 'debit', current_date, 'pluggy', 'item-b:account-b', 'tx-1');
select public.test_expect_unique_denied($$insert into public.transactions(user_id, amount_cents, type, transaction_date, source, provider_reference_scope, pluggy_transaction_id)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 100, 'debit', current_date, 'pluggy', 'item-b:account-b', 'tx-1')$$);
select public.test_expect_unique_denied($$insert into public.webhook_events(provider, external_event_id, event_type, status) values ('fixture', 'event-1', 'test', 'received')$$);
select public.test_expect_unique_denied($$insert into public.notification_outbox(user_id, channel, type, payload, scheduled_for, dedupe_key)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'in_app', 'bill_due', '{}', now(), 'bill-due-b')$$);

rollback;
\echo 'PASS: Phase 2 tenant isolation, ownership FKs, ledger preservation, replay constraints'
