-- Local PostgreSQL substitute for the minimum Supabase Auth contract.
-- Never apply this fixture to a Supabase project or production database.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant authenticated to postgres;
grant service_role to postgres;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth, public to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
