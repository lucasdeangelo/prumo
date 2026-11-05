-- WhatsApp may identify senders by a privacy id (…@lid) instead of their phone number.
-- The chat id the user linked from is where reminders must be delivered.
begin;

alter table public.whatsapp_links add column chat_id text
  check (chat_id is null or chat_id ~ '^[0-9]{6,20}@(c\.us|lid)$');

commit;
