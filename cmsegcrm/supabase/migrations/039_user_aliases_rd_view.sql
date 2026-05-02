-- ─────────────────────────────────────────────────────────────
-- 039_user_aliases_rd_view.sql
-- Compat: o código (api/importar e api/rdstation/sync-responsaveis)
-- já lê de "user_aliases_rd". Em alguns ambientes essa tabela foi
-- criada manualmente; em outros não existe.
-- 1) Migra qualquer linha existente para rd_responsaveis_alias
-- 2) Dropa a tabela antiga
-- 3) Recria como VIEW sobre rd_responsaveis_alias
-- ─────────────────────────────────────────────────────────────

do $$
declare
  v_kind char;
begin
  select c.relkind into v_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'user_aliases_rd';

  if v_kind = 'r' then
    -- Tabela existente: migra dados pra rd_responsaveis_alias antes de dropar
    insert into public.rd_responsaveis_alias (nome_planilha, email)
    select t.alias, u.email
      from public.user_aliases_rd t
      join public.users u on u.id = t.user_id
     where t.alias is not null and u.email is not null
    on conflict (lower(nome_planilha)) do nothing;

    drop table public.user_aliases_rd cascade;
  elsif v_kind = 'v' then
    drop view public.user_aliases_rd;
  end if;
end $$;

create view public.user_aliases_rd as
select
  a.id,
  u.id   as user_id,
  a.nome_planilha as alias,
  a.criado_em
from public.rd_responsaveis_alias a
left join public.users u on lower(u.email) = lower(a.email)
where a.ativo;

grant select on public.user_aliases_rd to anon, authenticated;
