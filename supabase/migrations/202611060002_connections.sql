-- Connection state shown on "Ajustes › Conexões": consent validity, last run and its outcome.
begin;

alter table public.pluggy_items
  add column consent_expires_at timestamptz,
  add column execution_status text,
  add column last_attempt_at timestamptz,
  add column last_success_at timestamptz,
  add column history jsonb not null default '[]'::jsonb;

commit;
