-- Runs only against the local prumo_test database with bootstrap.sql applied.
\set ON_ERROR_STOP on
begin;

-- Same helpers as tenant_isolation.sql; each suite rolls back, so they are created here too.
create function public.test_expect_unique_denied(statement text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
  begin
    execute statement;
  exception when unique_violation then
    blocked := true;
  end;
  if not blocked then raise exception 'Expected uniqueness denial: %', statement; end if;
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
  if not blocked then raise exception 'Expected same-tenant FK denial: %', statement; end if;
end;
$$;

insert into auth.users(id) values
  ('a7000000-0000-4000-8000-00000000000a'),
  ('b7000000-0000-4000-8000-00000000000b');
select public.ensure_profile('a7000000-0000-4000-8000-00000000000a', 'Ana');
select public.ensure_profile('b7000000-0000-4000-8000-00000000000b', 'Rafa');

insert into public.pluggy_items(id, user_id, pluggy_item_id) values
  ('a7100000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-00000000000a', 'inv-item-a'),
  ('b7100000-0000-4000-8000-00000000000b', 'b7000000-0000-4000-8000-00000000000b', 'inv-item-b');

insert into public.investments(id, user_id, source, pluggy_item_id, provider_investment_id, type, subtype, name, amount_cents, invested_cents) values
  ('a7200000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-00000000000a', 'pluggy', 'a7100000-0000-4000-8000-00000000000a', 'p-1', 'FIXED_INCOME', 'CDB', 'CDB Inter', 1200000, 1142000),
  ('b7200000-0000-4000-8000-00000000000b', 'b7000000-0000-4000-8000-00000000000b', 'manual', null, null, 'CRYPTO', null, 'Bitcoin', 147000, 120000);
insert into public.investment_movements(user_id, investment_id, provider_movement_id, type, date, amount_cents) values
  ('a7000000-0000-4000-8000-00000000000a', 'a7200000-0000-4000-8000-00000000000a', 'm-1', 'BUY', current_date - 30, 1142000);
insert into public.investment_snapshots(user_id, investment_id, on_date, amount_cents, invested_cents) values
  ('a7000000-0000-4000-8000-00000000000a', 'a7200000-0000-4000-8000-00000000000a', current_date, 1200000, 1142000),
  ('b7000000-0000-4000-8000-00000000000b', 'b7200000-0000-4000-8000-00000000000b', current_date, 147000, 120000);

-- Defaults: the partner sees only the total, the asset is brought, it is "Meu".
do $$ begin
  if (select visibility from public.investments where id = 'a7200000-0000-4000-8000-00000000000a') <> 'totals' then raise exception 'Default visibility is not totals'; end if;
  if not (select include from public.investments where id = 'a7200000-0000-4000-8000-00000000000a') then raise exception 'New investment not included'; end if;
  if (select scope from public.investments where id = 'a7200000-0000-4000-8000-00000000000a') <> 'mine' then raise exception 'Default scope is not mine'; end if;
end $$;

-- Replay guards: one row per provider id, movement and day.
select public.test_expect_unique_denied($$insert into public.investments(user_id, source, pluggy_item_id, provider_investment_id, type, name)
  values ('a7000000-0000-4000-8000-00000000000a', 'pluggy', 'a7100000-0000-4000-8000-00000000000a', 'p-1', 'FIXED_INCOME', 'dup')$$);
select public.test_expect_unique_denied($$insert into public.investment_movements(user_id, investment_id, provider_movement_id, type, date, amount_cents)
  values ('a7000000-0000-4000-8000-00000000000a', 'a7200000-0000-4000-8000-00000000000a', 'm-1', 'BUY', current_date, 1)$$);
select public.test_expect_unique_denied($$insert into public.investment_snapshots(user_id, investment_id, on_date, amount_cents)
  values ('a7000000-0000-4000-8000-00000000000a', 'a7200000-0000-4000-8000-00000000000a', current_date, 1)$$);

-- Upsert by provider id updates in place and keeps the person's choices.
update public.investments set visibility = 'private', scope = 'ours' where id = 'a7200000-0000-4000-8000-00000000000a';
insert into public.investments(user_id, source, pluggy_item_id, provider_investment_id, type, subtype, name, amount_cents)
values ('a7000000-0000-4000-8000-00000000000a', 'pluggy', 'a7100000-0000-4000-8000-00000000000a', 'p-1', 'FIXED_INCOME', 'CDB', 'CDB Inter', 1210000)
on conflict (user_id, provider_investment_id) do update set amount_cents = excluded.amount_cents;
insert into public.investment_snapshots(user_id, investment_id, on_date, amount_cents)
values ('a7000000-0000-4000-8000-00000000000a', 'a7200000-0000-4000-8000-00000000000a', current_date, 1210000)
on conflict (investment_id, on_date) do update set amount_cents = excluded.amount_cents;
do $$ begin
  if (select count(*) from public.investments where user_id = 'a7000000-0000-4000-8000-00000000000a') <> 1 then raise exception 'Replay duplicated the investment'; end if;
  if (select amount_cents from public.investments where provider_investment_id = 'p-1') <> 1210000 then raise exception 'Replay did not update the value'; end if;
  if (select visibility from public.investments where provider_investment_id = 'p-1') <> 'private' then raise exception 'Replay lost the visibility choice'; end if;
  if (select count(*) from public.investment_snapshots where investment_id = 'a7200000-0000-4000-8000-00000000000a') <> 1 then raise exception 'More than one value for the day'; end if;
end $$;

-- Shape: provider rows need their id, manual rows must not have one.
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.investments(user_id, source, type, name) values ('a7000000-0000-4000-8000-00000000000a', 'pluggy', 'EQUITY', 'Sem id');
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'Provider investment accepted without provider id'; end if;
end $$;

-- Same tenant: nobody hangs an investment on another person's connection, or a movement on another person's asset.
select public.test_expect_fk_denied($$insert into public.investments(user_id, source, pluggy_item_id, provider_investment_id, type, name)
  values ('a7000000-0000-4000-8000-00000000000a', 'pluggy', 'b7100000-0000-4000-8000-00000000000b', 'p-x', 'EQUITY', 'spoof')$$);
select public.test_expect_fk_denied($$insert into public.investment_movements(user_id, investment_id, type, date, amount_cents)
  values ('a7000000-0000-4000-8000-00000000000a', 'b7200000-0000-4000-8000-00000000000b', 'BUY', current_date, 1)$$);
select public.test_expect_fk_denied($$insert into public.investment_snapshots(user_id, investment_id, on_date, amount_cents)
  values ('a7000000-0000-4000-8000-00000000000a', 'b7200000-0000-4000-8000-00000000000b', current_date - 1, 1)$$);

-- Direct writes stay closed for signed-in users and anonymous visitors.
do $$
declare t text;
begin
  foreach t in array array['investments', 'investment_movements', 'investment_snapshots'] loop
    if has_table_privilege('authenticated', format('public.%I', t), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', t), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', t), 'DELETE') then
      raise exception 'Direct write granted on %', t;
    end if;
    if has_table_privilege('anon', format('public.%I', t), 'SELECT') then
      raise exception 'Anonymous read granted on %', t;
    end if;
  end loop;
end $$;

set local role authenticated;

-- Each person reads only their own rows; the partner's view is projected on the server.
set local request.jwt.claim.sub = 'a7000000-0000-4000-8000-00000000000a';
do $$ begin
  if (select count(*) from public.investments) <> 1 then raise exception 'Owner does not see exactly their investment'; end if;
  if (select count(*) from public.investment_movements) <> 1 then raise exception 'Owner does not see their movements'; end if;
  if (select count(*) from public.investment_snapshots) <> 1 then raise exception 'Owner does not see their snapshots'; end if;
end $$;

set local request.jwt.claim.sub = 'b7000000-0000-4000-8000-00000000000b';
do $$ begin
  if (select count(*) from public.investments where name = 'CDB Inter') <> 0 then raise exception 'Other person sees an investment'; end if;
  if (select count(*) from public.investment_movements) <> 0 then raise exception 'Other person sees movements'; end if;
  if (select count(*) from public.investment_snapshots) <> 1 then raise exception 'Other person sees snapshots'; end if;
end $$;

reset role;

-- Removing an asset takes its movements and history with it.
delete from public.investments where id = 'a7200000-0000-4000-8000-00000000000a';
do $$ begin
  if (select count(*) from public.investment_movements where investment_id = 'a7200000-0000-4000-8000-00000000000a') <> 0 then raise exception 'Movements left behind'; end if;
  if (select count(*) from public.investment_snapshots where investment_id = 'a7200000-0000-4000-8000-00000000000a') <> 0 then raise exception 'Snapshots left behind'; end if;
end $$;

rollback;
\echo 'PASS: investments isolation, replay keys, same-tenant links, preserved choices'
