-- Runs only against the local prumo_test database with bootstrap.sql applied.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id) values
  ('a8000000-0000-4000-8000-00000000000a'),
  ('b8000000-0000-4000-8000-00000000000b'),
  ('c8000000-0000-4000-8000-00000000000c');
select public.ensure_profile('a8000000-0000-4000-8000-00000000000a', 'Ana');
select public.ensure_profile('b8000000-0000-4000-8000-00000000000b', 'Rafa');
select public.ensure_profile('c8000000-0000-4000-8000-00000000000c', 'Outra');

insert into public.households(id) values ('f8000000-0000-4000-8000-0000000000f8');
insert into public.household_members(household_id, user_id, color) values
  ('f8000000-0000-4000-8000-0000000000f8', 'a8000000-0000-4000-8000-00000000000a', 'blue'),
  ('f8000000-0000-4000-8000-0000000000f8', 'b8000000-0000-4000-8000-00000000000b', 'terracotta');

-- A couple goal (default scope) and Ana's personal goal.
insert into public.goals(id, household_id, name, target_cents, created_by) values
  ('f8100000-0000-4000-8000-0000000000c1', 'f8000000-0000-4000-8000-0000000000f8', 'Viagem', 1000000, 'a8000000-0000-4000-8000-00000000000a');
insert into public.goals(id, household_id, name, target_cents, created_by, scope, status) values
  ('f8100000-0000-4000-8000-0000000000a1', 'f8000000-0000-4000-8000-0000000000f8', 'Pós-graduação', 1800000, 'a8000000-0000-4000-8000-00000000000a', 'mine', 'active');
insert into public.goal_members(goal_id, user_id, percent) values
  ('f8100000-0000-4000-8000-0000000000a1', 'a8000000-0000-4000-8000-00000000000a', 100);
insert into public.goal_contributions(goal_id, user_id, amount_cents, contributed_on) values
  ('f8100000-0000-4000-8000-0000000000a1', 'a8000000-0000-4000-8000-00000000000a', 50000, current_date);
insert into public.goal_milestones(goal_id, percent) values ('f8100000-0000-4000-8000-0000000000a1', 25);

insert into public.investments(id, user_id, source, type, subtype, name, amount_cents, invested_cents) values
  ('a8200000-0000-4000-8000-00000000000a', 'a8000000-0000-4000-8000-00000000000a', 'manual', 'FIXED_INCOME', 'CDB', 'CDB C6', 315000, 300000);
insert into public.goal_investments(goal_id, investment_id, mode, created_by) values
  ('f8100000-0000-4000-8000-0000000000a1', 'a8200000-0000-4000-8000-00000000000a', 'all', 'a8000000-0000-4000-8000-00000000000a');
insert into public.goal_investments(goal_id, investment_id, mode, part_cents, created_by) values
  ('f8100000-0000-4000-8000-0000000000c1', 'a8200000-0000-4000-8000-00000000000a', 'part', 100000, 'a8000000-0000-4000-8000-00000000000a');

-- Existing goals stay the couple's.
do $$ begin
  if (select scope from public.goals where id = 'f8100000-0000-4000-8000-0000000000c1') <> 'ours' then raise exception 'Default goal scope is not ours'; end if;
end $$;

-- Shape of a link: "all" has no part, "part" needs a positive part.
do $$
declare blocked boolean;
begin
  blocked := false;
  begin
    update public.goal_investments set part_cents = 5 where goal_id = 'f8100000-0000-4000-8000-0000000000a1';
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'Whole link accepted a part'; end if;
  blocked := false;
  begin
    update public.goal_investments set part_cents = null where goal_id = 'f8100000-0000-4000-8000-0000000000c1';
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'Partial link accepted without a part'; end if;
end $$;

-- Direct writes stay closed for signed-in users.
do $$ begin
  if has_table_privilege('authenticated', 'public.goal_investments', 'INSERT') or has_table_privilege('authenticated', 'public.goal_investments', 'DELETE') then
    raise exception 'Direct write granted on goal_investments';
  end if;
end $$;

set local role authenticated;

-- Ana sees both goals and what counts for them.
set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-00000000000a';
do $$ begin
  if (select count(*) from public.goals) <> 2 then raise exception 'Owner does not see both goals'; end if;
  if (select count(*) from public.goal_investments) <> 2 then raise exception 'Owner does not see both links'; end if;
  if (select count(*) from public.goal_contributions) <> 1 then raise exception 'Owner does not see the personal deposit'; end if;
end $$;

-- Rafa sees the couple goal and its link, nothing of Ana's personal goal.
set local request.jwt.claim.sub = 'b8000000-0000-4000-8000-00000000000b';
do $$ begin
  if (select count(*) from public.goals) <> 1 then raise exception 'Partner sees a personal goal'; end if;
  if exists (select 1 from public.goals where name = 'Pós-graduação') then raise exception 'Partner sees the personal goal name'; end if;
  if (select count(*) from public.goal_investments) <> 1 then raise exception 'Partner sees a personal link'; end if;
  if (select count(*) from public.goal_members) <> 0 then raise exception 'Partner sees personal members'; end if;
  if (select count(*) from public.goal_contributions) <> 0 then raise exception 'Partner sees personal deposits'; end if;
  if (select count(*) from public.goal_milestones) <> 0 then raise exception 'Partner sees personal milestones'; end if;
end $$;

-- An outsider sees nothing.
set local request.jwt.claim.sub = 'c8000000-0000-4000-8000-00000000000c';
do $$ begin
  if (select count(*) from public.goals) <> 0 then raise exception 'Outsider sees goals'; end if;
  if (select count(*) from public.goal_investments) <> 0 then raise exception 'Outsider sees links'; end if;
end $$;

reset role;

-- Removing the asset removes its links; the goals stay.
delete from public.investments where id = 'a8200000-0000-4000-8000-00000000000a';
do $$ begin
  if (select count(*) from public.goal_investments) <> 0 then raise exception 'Links left behind'; end if;
  if (select count(*) from public.goals where household_id = 'f8000000-0000-4000-8000-0000000000f8') <> 2 then raise exception 'Goals removed with the asset'; end if;
end $$;

rollback;
\echo 'PASS: personal goals stay private, investment links follow goal visibility'
