-- Overdraft ("cheque especial") of checking accounts, as the bank reports it.
-- Open Finance gives today's balance, the contracted limit and how much of it is in use. The daily
-- balance (days below zero, lowest point) is rebuilt by the app from the transactions.
begin;

alter table public.accounts
  add column overdraft_limit_cents bigint check (overdraft_limit_cents is null or overdraft_limit_cents >= 0),
  add column overdraft_used_cents bigint check (overdraft_used_cents is null or overdraft_used_cents >= 0);

commit;
