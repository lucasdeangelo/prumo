-- Open and future card invoices.
-- Some banks (Nubank) report every item of the open invoice, and the installments of the coming
-- ones, as pending until the invoice closes. Pending items may come back with another id once
-- posted, so they are not facts: they live in a snapshot replaced on every sync and are shown only
-- in invoices (never in month totals, budgets or the split until the bank confirms them).
begin;

-- Payments applied to a closed invoice; what was left unpaid rolls into the next one.
alter table public.card_bills add column payments_cents bigint not null default 0;

create table public.card_pending_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null,
  provider_transaction_id text not null,
  bill_month text not null check (bill_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  transaction_date date not null,
  description text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  type text not null check (type in ('credit', 'debit')),
  tag_id uuid,
  card_last4 text,
  installment_number integer,
  installment_total integer,
  created_at timestamptz not null default now(),
  unique (account_id, provider_transaction_id),
  foreign key (user_id, account_id) references public.accounts(user_id, id) on delete cascade
);

create index card_pending_items_month_idx on public.card_pending_items (account_id, bill_month);

alter table public.card_pending_items enable row level security;
create policy card_pending_items_select on public.card_pending_items for select to authenticated using (user_id = (select auth.uid()));
grant select on public.card_pending_items to authenticated;
grant all on public.card_pending_items to service_role;

commit;
