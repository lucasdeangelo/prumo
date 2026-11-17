-- Runs only against the local prumo_test database with bootstrap.sql applied.
\set ON_ERROR_STOP on
begin;

create function public.test_expect_fk_denied(statement text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
  begin
    execute statement;
  exception when foreign_key_violation then
    blocked := true;
  end;
  if not blocked then raise exception 'Expected same-tenant FK denial: %', statement; end if;
end;
$$;

insert into auth.users(id) values
  ('a9000000-0000-4000-8000-00000000000a'),
  ('b9000000-0000-4000-8000-00000000000b');
select public.ensure_profile('a9000000-0000-4000-8000-00000000000a', 'Ana');
select public.ensure_profile('b9000000-0000-4000-8000-00000000000b', 'Bia');

insert into public.accounts(id, user_id, name, is_manual) values
  ('a9100000-0000-4000-8000-00000000000a', 'a9000000-0000-4000-8000-00000000000a', 'Cartão A', true),
  ('b9100000-0000-4000-8000-00000000000b', 'b9000000-0000-4000-8000-00000000000b', 'Cartão B', true);
insert into public.tags(id, user_id, name) values
  ('a9200000-0000-4000-8000-00000000000a', 'a9000000-0000-4000-8000-00000000000a', 'Teste edição A'),
  ('b9200000-0000-4000-8000-00000000000b', 'b9000000-0000-4000-8000-00000000000b', 'Teste edição B');

insert into public.card_item_edits(id, user_id, account_id, provider_transaction_id, fingerprint, tag_id, user_description, scope) values
  ('a9300000-0000-4000-8000-00000000000a', 'a9000000-0000-4000-8000-00000000000a', 'a9100000-0000-4000-8000-00000000000a', 'p-ana', '2026-11-10|4590|debit||mercado', 'a9200000-0000-4000-8000-00000000000a', 'Feira', 'ours'),
  ('b9300000-0000-4000-8000-00000000000b', 'b9000000-0000-4000-8000-00000000000b', 'b9100000-0000-4000-8000-00000000000b', 'p-bia', '2026-11-10|990|debit||padaria', null, null, 'mine');

-- An edit never points at another person's card or tag.
select public.test_expect_fk_denied($$insert into public.card_item_edits(user_id, account_id, provider_transaction_id, fingerprint)
  values ('a9000000-0000-4000-8000-00000000000a', 'b9100000-0000-4000-8000-00000000000b', 'x', 'f')$$);
select public.test_expect_fk_denied($$insert into public.card_item_edits(user_id, account_id, provider_transaction_id, fingerprint, tag_id)
  values ('a9000000-0000-4000-8000-00000000000a', 'a9100000-0000-4000-8000-00000000000a', 'y', 'f', 'b9200000-0000-4000-8000-00000000000b')$$);

-- One edit per purchase of a card.
do $$ begin
  begin
    insert into public.card_item_edits(user_id, account_id, provider_transaction_id, fingerprint)
      values ('a9000000-0000-4000-8000-00000000000a', 'a9100000-0000-4000-8000-00000000000a', 'p-ana', 'f');
    raise exception 'Duplicate edit accepted';
  exception when unique_violation then null;
  end;
end $$;

-- Deleting a tag keeps the edit (its name and owner still matter) without the tag.
delete from public.tags where id = 'a9200000-0000-4000-8000-00000000000a';
do $$ begin
  if (select tag_id from public.card_item_edits where id = 'a9300000-0000-4000-8000-00000000000a') is not null then raise exception 'Tag left on the edit'; end if;
  if (select user_description from public.card_item_edits where id = 'a9300000-0000-4000-8000-00000000000a') <> 'Feira' then raise exception 'Edit lost with the tag'; end if;
end $$;

-- Writes stay on the server; anonymous visitors read nothing.
do $$ begin
  if has_table_privilege('authenticated', 'public.card_item_edits', 'INSERT')
    or has_table_privilege('authenticated', 'public.card_item_edits', 'UPDATE')
    or has_table_privilege('authenticated', 'public.card_item_edits', 'DELETE') then
    raise exception 'Direct write granted on card_item_edits';
  end if;
  if has_table_privilege('anon', 'public.card_item_edits', 'SELECT') then raise exception 'Anonymous read granted on card_item_edits'; end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-00000000000a';
do $$ begin
  if (select count(*) from public.card_item_edits) <> 1 then raise exception 'Owner does not see exactly their edit'; end if;
end $$;
set local request.jwt.claim.sub = 'b9000000-0000-4000-8000-00000000000b';
do $$ begin
  if exists (select 1 from public.card_item_edits where provider_transaction_id = 'p-ana') then raise exception 'Other person sees an edit'; end if;
end $$;

rollback;
\echo 'PASS: card item edits isolation, same-tenant links, tag removal'
