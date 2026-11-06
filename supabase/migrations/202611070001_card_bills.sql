-- Card invoices as the bank reports them.
-- Banks assign each card purchase to an invoice by their own rules (installments posted monthly,
-- purchases after the close date go to the next one). Open Finance tells us which invoice each
-- transaction belongs to (bill id once closed, forecast month while open), and the closed invoices
-- with their real totals. The app groups purchases by that, not by date windows.
begin;

alter table public.transactions
  add column bill_month text check (bill_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

create index transactions_bill_month_idx on public.transactions (account_id, bill_month) where bill_month is not null and deleted_at is null;

create table public.card_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null,
  provider_bill_id text,
  -- Invoice month = month of the due date ("2026-11" for an invoice due on 2026-11-03).
  bill_month text not null check (bill_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  due_date date not null,
  total_cents bigint not null,
  minimum_cents bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, bill_month),
  foreign key (user_id, account_id) references public.accounts(user_id, id) on delete cascade
);

create trigger card_bills_updated_at before update on public.card_bills for each row execute function public.set_updated_at();

alter table public.card_bills enable row level security;
create policy card_bills_select on public.card_bills for select to authenticated using (user_id = (select auth.uid()));
grant select on public.card_bills to authenticated;
grant all on public.card_bills to service_role;

-- Provider import now also carries the invoice month. Kept when the provider stops sending it.
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
      transaction_date date, posted_at timestamptz, tag_id uuid, category_confidence numeric, category_source text,
      card_last4 text, installment_number integer, installment_total integer, scope text, bill_month text)
  ), written as (
    insert into public.transactions as t (user_id, account_id, pluggy_transaction_id, provider_reference_scope,
      amount_cents, type, provider_description, merchant, normalized_merchant, transaction_date, posted_at,
      tag_id, category_confidence, category_source, source, card_last4, installment_number, installment_total, scope, bill_month)
    select p_user, account_id, pluggy_transaction_id, provider_reference_scope, amount_cents, type,
      provider_description, merchant, normalized_merchant, transaction_date, posted_at,
      tag_id, category_confidence, category_source, 'pluggy', card_last4, installment_number, installment_total,
      coalesce(scope, 'mine'), bill_month
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
      card_last4 = excluded.card_last4,
      installment_number = excluded.installment_number,
      installment_total = excluded.installment_total,
      bill_month = coalesce(excluded.bill_month, t.bill_month),
      tag_id = case when t.category_source = 'user' then t.tag_id else excluded.tag_id end,
      category_confidence = case when t.category_source = 'user' then t.category_confidence else excluded.category_confidence end,
      category_source = case when t.category_source = 'user' then t.category_source else excluded.category_source end
    where (t.amount_cents, t.type, t.provider_description, t.transaction_date, t.tag_id, t.card_last4, t.installment_number, t.installment_total, t.bill_month)
      is distinct from (excluded.amount_cents, excluded.type, excluded.provider_description, excluded.transaction_date,
        case when t.category_source = 'user' then t.tag_id else excluded.tag_id end, excluded.card_last4, excluded.installment_number,
        excluded.installment_total, coalesce(excluded.bill_month, t.bill_month))
    returning (t.xmax::text = '0') as is_insert
  )
  select count(*) filter (where is_insert) into inserted from written;
  perform set_config('prumo.provider_sync', 'off', true);
  return inserted;
end;
$$;
revoke all on function public.upsert_provider_transactions(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_provider_transactions(uuid, jsonb) to service_role;

commit;
