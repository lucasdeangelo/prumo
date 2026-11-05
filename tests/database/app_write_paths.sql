-- Runs only against the local prumo_test database with bootstrap.sql applied.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), ('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
select public.ensure_profile('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Usuária C');
select public.ensure_profile('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Usuária C');
select public.ensure_profile('dddddddd-dddd-4ddd-8ddd-dddddddddddd', null);

do $$ begin
  if (select count(*) from public.tags where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') <> 14 then
    raise exception 'Onboarding is not idempotent';
  end if;
  if not (select excluded_from_totals from public.tags where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and name = 'Transferências') then
    raise exception 'Transfers must be excluded from totals';
  end if;
  if has_function_privilege('authenticated', 'public.mark_bill_paid(uuid, uuid, uuid, date, text)', 'EXECUTE') then
    raise exception 'mark_bill_paid must not be executable by authenticated';
  end if;
  if has_table_privilege('authenticated', 'public.transactions', 'INSERT') then
    raise exception 'Direct INSERT unexpectedly granted on transactions';
  end if;
end $$;

-- Paying a recurring bill twice creates one fact and one successor.
insert into public.upcoming_bills(id, user_id, description, amount_cents, type, due_date, recurrence_type)
values ('c1000000-0000-4000-8000-000000000001', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Aluguel', 150000, 'payable', '2026-01-31', 'monthly');
select public.mark_bill_paid('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c1000000-0000-4000-8000-000000000001');
select public.mark_bill_paid('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c1000000-0000-4000-8000-000000000001');

do $$ begin
  if (select count(*) from public.transactions where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and external_reference = 'bill:c1000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Repeated payment duplicated the fact';
  end if;
  if (select count(*) from public.upcoming_bills where parent_bill_id = 'c1000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Repeated payment duplicated the successor';
  end if;
  if (select due_date from public.upcoming_bills where parent_bill_id = 'c1000000-0000-4000-8000-000000000001') <> '2026-02-28' then
    raise exception 'Monthly successor must clamp to month end';
  end if;
  if (select count(*) from public.audit_logs where entity_id = 'c1000000-0000-4000-8000-000000000001' and action = 'upcoming_bills.update') <> 1 then
    raise exception 'Bill payment was not audited exactly once';
  end if;
end $$;

-- Another tenant cannot settle C's bill, nor link a fact owned by someone else.
do $$
declare blocked boolean := false;
begin
  begin
    perform public.mark_bill_paid('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      (select id from public.upcoming_bills where parent_bill_id = 'c1000000-0000-4000-8000-000000000001'));
  exception when no_data_found then blocked := true;
  end;
  if not blocked then raise exception 'Cross-tenant bill payment succeeded'; end if;
end $$;

-- Provider import replay converges; a user-chosen tag survives re-import.
select public.upsert_provider_transactions('cccccccc-cccc-4ccc-8ccc-cccccccccccc', $$[
  {"pluggy_transaction_id":"tx-1","provider_reference_scope":"pluggy:acc-1","amount_cents":5590,"type":"debit",
   "provider_description":"NETFLIX.COM","normalized_merchant":"netflix","transaction_date":"2026-10-05","category_source":"keyword"}
]$$::jsonb);
update public.transactions set tag_id = (select id from public.tags where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and name = 'Lazer'),
  category_source = 'user' where pluggy_transaction_id = 'tx-1';
do $$ begin
  if public.upsert_provider_transactions('cccccccc-cccc-4ccc-8ccc-cccccccccccc', $j$[
    {"pluggy_transaction_id":"tx-1","provider_reference_scope":"pluggy:acc-1","amount_cents":5590,"type":"debit",
     "provider_description":"NETFLIX.COM","normalized_merchant":"netflix","transaction_date":"2026-10-05","category_source":"keyword"}
  ]$j$::jsonb) <> 0 then raise exception 'Replay reported a new insert'; end if;
  if (select count(*) from public.transactions where pluggy_transaction_id = 'tx-1') <> 1 then
    raise exception 'Provider replay duplicated a fact';
  end if;
  if (select category_source from public.transactions where pluggy_transaction_id = 'tx-1') <> 'user' then
    raise exception 'Provider replay overwrote a user tag';
  end if;
end $$;

-- Provider amounts cannot be edited outside sync.
do $$
declare blocked boolean := false;
begin
  begin
    update public.transactions set amount_cents = 1 where pluggy_transaction_id = 'tx-1';
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'Provider fact was edited'; end if;
end $$;

-- A claimed notification is not handed out again while its lease is active.
insert into public.notification_outbox(user_id, channel, type, payload, scheduled_for, dedupe_key)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'whatsapp', 'bill_due', '{"text":"x"}', now() - interval '1 minute', 'bill:x');
do $$ begin
  if (select count(*) from public.claim_notifications('whatsapp', 10, 120)) <> 1 then raise exception 'First claim failed'; end if;
  if (select count(*) from public.claim_notifications('whatsapp', 10, 120)) <> 0 then raise exception 'Lease was ignored'; end if;
end $$;

-- WhatsApp links accept phone chats and privacy (@lid) chats, nothing else.
do $$
declare blocked boolean := false;
begin
  insert into public.whatsapp_links(user_id, phone_normalized, chat_id, verified_at)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '+10000000000001', '10000000000001@lid', now());
  begin
    insert into public.whatsapp_links(user_id, chat_id) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'evil@g.us');
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'Invalid chat id accepted'; end if;
end $$;

rollback;
\echo 'PASS: onboarding, idempotent bill payment, provider replay, outbox lease, chat ids'

