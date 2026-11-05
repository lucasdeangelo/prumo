-- "Usar sempre para Mercado": future card purchases of a category enter as Nosso with its split.
begin;

alter table public.split_rules add column auto_ours boolean not null default false;

commit;
