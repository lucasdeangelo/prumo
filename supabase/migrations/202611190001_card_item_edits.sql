-- Edits to card purchases the bank still shows as pending (open invoice, scheduled installments).
-- Pending items are a snapshot replaced on every sync and may come back with another id once
-- posted, so the person's tag, description and owner live here, keyed by the provider id and by a
-- fingerprint of the purchase. Each sync applies them to the snapshot, and to the confirmed
-- transaction once the bank posts it (then applied_at is set).
begin;

create table public.card_item_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null,
  provider_transaction_id text not null,
  -- date|amount|type|installment|normalized description: survives a new provider id.
  fingerprint text not null check (char_length(fingerprint) between 1 and 400),
  tag_id uuid,
  user_description text check (user_description is null or char_length(user_description) between 1 and 120),
  scope text check (scope is null or scope in ('mine', 'ours', 'partner')),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_transaction_id),
  foreign key (user_id, account_id) references public.accounts(user_id, id) on delete cascade,
  foreign key (user_id, tag_id) references public.tags(user_id, id) on delete set null (tag_id)
);

create index card_item_edits_open_idx on public.card_item_edits (account_id) where applied_at is null;

alter table public.card_item_edits enable row level security;
create policy card_item_edits_select on public.card_item_edits for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.card_item_edits from public, anon, authenticated;
grant select on public.card_item_edits to authenticated;
grant all on public.card_item_edits to service_role;

-- The snapshot shows the edits right away.
alter table public.card_pending_items
  add column user_description text check (user_description is null or char_length(user_description) between 1 and 120),
  add column scope text not null default 'mine' check (scope in ('mine', 'ours', 'partner')),
  add column edited boolean not null default false;

commit;
