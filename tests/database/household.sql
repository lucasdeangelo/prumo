-- Runs only against the local prumo_test database with bootstrap.sql applied.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id) values
  ('a1000000-0000-4000-8000-00000000000a'),
  ('b1000000-0000-4000-8000-00000000000b'),
  ('c1000000-0000-4000-8000-00000000000c');
select public.ensure_profile('a1000000-0000-4000-8000-00000000000a', 'Ana');
select public.ensure_profile('b1000000-0000-4000-8000-00000000000b', 'Rafa');
select public.ensure_profile('c1000000-0000-4000-8000-00000000000c', 'Outra');

insert into public.households(id) values ('f1000000-0000-4000-8000-0000000000f1');
insert into public.household_members(household_id, user_id, color) values
  ('f1000000-0000-4000-8000-0000000000f1', 'a1000000-0000-4000-8000-00000000000a', 'blue'),
  ('f1000000-0000-4000-8000-0000000000f1', 'b1000000-0000-4000-8000-00000000000b', 'terracotta');

-- A third member is refused.
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.household_members(household_id, user_id, color)
    values ('f1000000-0000-4000-8000-0000000000f1', 'c1000000-0000-4000-8000-00000000000c', 'blue');
  exception when check_violation or unique_violation then blocked := true;
  end;
  if not blocked then raise exception 'Third member accepted'; end if;
end $$;

insert into public.goals(id, household_id, name, target_cents, created_by) values
  ('f2000000-0000-4000-8000-0000000000f2', 'f1000000-0000-4000-8000-0000000000f1', 'Viagem', 1000000, 'a1000000-0000-4000-8000-00000000000a');
insert into public.goal_contributions(goal_id, user_id, amount_cents, contributed_on) values
  ('f2000000-0000-4000-8000-0000000000f2', 'b1000000-0000-4000-8000-00000000000b', 60000, current_date);
insert into public.approval_requests(household_id, requested_by, title, amount_cents) values
  ('f1000000-0000-4000-8000-0000000000f1', 'b1000000-0000-4000-8000-00000000000b', 'Sofá', 239000);
insert into public.privacy_rules(user_id, match_type, pattern, action) values
  ('a1000000-0000-4000-8000-00000000000a', 'merchant', 'drogaria', 'category_only');

-- New accounts and facts are private by default.
insert into public.accounts(id, user_id, name, is_manual) values
  ('f3000000-0000-4000-8000-0000000000f3', 'a1000000-0000-4000-8000-00000000000a', 'Carteira', true);
do $$ begin
  if (select visibility from public.accounts where id = 'f3000000-0000-4000-8000-0000000000f3') <> 'private' then
    raise exception 'Accounts must start private';
  end if;
end $$;

-- A surprise cannot be marked as shared ("ours").
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.transactions(user_id, amount_cents, type, transaction_date, source, scope, surprise_until)
    values ('a1000000-0000-4000-8000-00000000000a', 100, 'debit', current_date, 'manual', 'ours', current_date + 30);
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'Shared surprise accepted'; end if;
end $$;

-- Direct writes stay closed for signed-in users.
do $$
declare t text;
begin
  foreach t in array array['households','household_members','household_invites','household_proposals','privacy_rules',
    'goals','goal_contributions','approval_requests','settlements','household_budgets','free_money_allowances'] loop
    if has_table_privilege('authenticated', format('public.%I', t), 'INSERT') then
      raise exception 'Direct INSERT granted on %', t;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.household_invites', 'SELECT') then
    raise exception 'Invite hashes readable by users';
  end if;
end $$;

set local role authenticated;

-- Ana (member) sees the household, its goal, contributions and requests; not Rafa's... nothing private exists here.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-00000000000a';
do $$ begin
  if (select count(*) from public.households) <> 1 then raise exception 'Member cannot see household'; end if;
  if (select count(*) from public.household_members) <> 2 then raise exception 'Member cannot see both members'; end if;
  if (select count(*) from public.goal_contributions) <> 1 then raise exception 'Member cannot see contributions'; end if;
  if (select count(*) from public.approval_requests) <> 1 then raise exception 'Member cannot see requests'; end if;
  if (select count(*) from public.privacy_rules) <> 1 then raise exception 'Owner cannot see own privacy rule'; end if;
end $$;

-- Rafa shares the household but never sees Ana's privacy rules.
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-00000000000b';
do $$ begin
  if (select count(*) from public.households) <> 1 then raise exception 'Partner cannot see household'; end if;
  if (select count(*) from public.privacy_rules) <> 0 then raise exception 'Partner sees the other person''s privacy rules'; end if;
end $$;

-- An outsider sees nothing of the couple.
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-00000000000c';
do $$ begin
  if (select count(*) from public.households) <> 0 then raise exception 'Outsider sees household'; end if;
  if (select count(*) from public.household_members) <> 0 then raise exception 'Outsider sees members'; end if;
  if (select count(*) from public.goals) <> 0 then raise exception 'Outsider sees goals'; end if;
  if (select count(*) from public.goal_contributions) <> 0 then raise exception 'Outsider sees contributions'; end if;
  if (select count(*) from public.approval_requests) <> 0 then raise exception 'Outsider sees requests'; end if;
  if (select count(*) from public.privacy_rules) <> 0 then raise exception 'Outsider sees privacy rules'; end if;
  -- Partner rows in base tables stay invisible: RLS still scopes transactions and accounts to their owner.
  if (select count(*) from public.accounts) <> 0 then raise exception 'Outsider sees accounts'; end if;
end $$;

reset role;
rollback;
\echo 'PASS: household membership, two-person limit, private defaults, outsider isolation'
