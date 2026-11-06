-- Pix and TED sent to other people are spending; only moves between the person's own accounts
-- (and card bill payments, already counted as card purchases) stay out of the totals.
begin;

-- New default tag, counted in totals.
insert into public.tags (user_id, name, color, icon, is_default, excluded_from_totals)
select p.id, 'Pix e TED', '#4f8f8b', 'send', true, false
from public.profiles p
on conflict (user_id, name) do nothing;

create or replace function public.ensure_profile(p_user uuid, p_display_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (p_user, nullif(trim(p_display_name), ''))
  on conflict (id) do nothing;
  insert into public.tags (user_id, name, color, icon, is_default, excluded_from_totals)
  select p_user, t.name, t.color, t.icon, true, t.excluded
  from (values
    ('Alimentação', '#eb6834', 'utensils', false),
    ('Mercado', '#1baf7a', 'shopping-cart', false),
    ('Transporte', '#2a78d6', 'car', false),
    ('Moradia', '#6250d6', 'home', false),
    ('Contas', '#eda100', 'receipt', false),
    ('Saúde', '#e34948', 'heart-pulse', false),
    ('Educação', '#008300', 'graduation-cap', false),
    ('Lazer', '#e87ba4', 'party-popper', false),
    ('Assinaturas', '#9085e9', 'repeat', false),
    ('Compras', '#d95926', 'shopping-bag', false),
    ('Salário', '#199e70', 'banknote', false),
    ('Investimentos', '#256abf', 'trending-up', true),
    ('Transferências', '#898781', 'arrow-left-right', true),
    ('Pix e TED', '#4f8f8b', 'send', false),
    ('Outros', '#52514e', 'circle', false)
  ) as t(name, color, icon, excluded)
  on conflict (user_id, name) do nothing;
end;
$$;

-- Imported Pix/TED to someone else that the app (not the person) put in "Transferências".
-- Choices the person made by hand (category_source = 'user') are kept.
update public.transactions t
set tag_id = pix.id, category_source = 'keyword', category_confidence = 0.7
from public.tags transfer, public.tags pix
where transfer.user_id = t.user_id and transfer.name = 'Transferências' and t.tag_id = transfer.id
  and pix.user_id = t.user_id and pix.name = 'Pix e TED'
  and t.source = 'pluggy'
  and t.type = 'debit'
  and coalesce(t.category_source, '') <> 'user'
  and t.deleted_at is null
  and lower(coalesce(t.provider_description, '')) ~ '(pix enviado|ted enviad|transferencia enviada|transferência enviada|doc enviado)'
  and lower(coalesce(t.provider_description, '')) !~ '(mesma titularidade|entre contas)'
  -- Pix to oneself ("Pix enviado LUCAS DE ANGELO"): the stored row no longer has Pluggy's
  -- "Same person transfer" category, so the person's own first name is the best signal left.
  and not exists (
    select 1 from public.profiles p
    where p.id = t.user_id
      and length(split_part(trim(coalesce(p.display_name, '')), ' ', 1)) >= 3
      and lower(t.provider_description) like '%' || lower(split_part(trim(p.display_name), ' ', 1)) || '%'
  );

commit;
