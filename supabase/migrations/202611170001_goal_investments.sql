-- Personal goals and investments that count for a goal.
-- A goal stays in the person's household (every goal creator has one, even alone). "ours" goals
-- are the couple's, as before; "mine" goals exist only for whoever created them: the partner
-- never sees them, not even their name.
-- goal_investments links an asset to a goal, whole ("all") or a fixed part. The goal's progress
-- adds the linked value of today; nothing is copied into goal_contributions.
begin;

alter table public.goals
  add column scope text not null default 'ours' check (scope in ('mine', 'ours'));

create index goals_owner_idx on public.goals (created_by) where scope = 'mine';

-- Reads: couple goals for both members, personal goals for their owner only.
drop policy goals_select on public.goals;
drop policy goal_members_select on public.goal_members;
drop policy goal_contributions_select on public.goal_contributions;
drop policy goal_milestones_select on public.goal_milestones;

create function public.can_see_goal(p_goal uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.goals g
    where g.id = p_goal
      and public.is_household_member(g.household_id)
      and (g.scope = 'ours' or g.created_by = (select auth.uid()))
  );
$$;
revoke all on function public.can_see_goal(uuid) from public, anon;
grant execute on function public.can_see_goal(uuid) to authenticated, service_role;

create policy goals_select on public.goals for select to authenticated
  using ((select public.is_household_member(household_id)) and (scope = 'ours' or created_by = (select auth.uid())));
create policy goal_members_select on public.goal_members for select to authenticated
  using (public.can_see_goal(goal_id));
create policy goal_contributions_select on public.goal_contributions for select to authenticated
  using (public.can_see_goal(goal_id));
create policy goal_milestones_select on public.goal_milestones for select to authenticated
  using (public.can_see_goal(goal_id));

create table public.goal_investments (
  goal_id uuid not null references public.goals(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  mode text not null check (mode in ('all', 'part')),
  part_cents bigint,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (goal_id, investment_id),
  check ((mode = 'all' and part_cents is null) or (mode = 'part' and part_cents is not null and part_cents > 0))
);

create index goal_investments_investment_idx on public.goal_investments (investment_id);

alter table public.goal_investments enable row level security;
create policy goal_investments_select on public.goal_investments for select to authenticated
  using (public.can_see_goal(goal_id));

revoke all on public.goal_investments from public, anon, authenticated;
grant select on public.goal_investments to authenticated;
grant all on public.goal_investments to service_role;

commit;
