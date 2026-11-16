-- Public rates from the Banco Central (SGS) used to value investments typed by hand:
-- cdi and selic as daily % per business day (series 12 and 11), ipca as monthly % (433, keyed by
-- the first day of the month) and ipca12 as the 12-month % (13522). Not personal data; read and
-- written only on the server.
begin;

create table public.market_rates (
  series text not null check (series in ('cdi', 'selic', 'ipca', 'ipca12')),
  on_date date not null,
  value numeric(14, 8) not null,
  primary key (series, on_date)
);

alter table public.market_rates enable row level security;
revoke all on public.market_rates from public, anon, authenticated;
grant all on public.market_rates to service_role;

commit;
