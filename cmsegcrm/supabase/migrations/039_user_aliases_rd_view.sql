-- ─────────────────────────────────────────────────────────────
-- 039_user_aliases_rd_view.sql
-- Garante que public.user_aliases_rd seja uma VIEW sobre
-- rd_responsaveis_alias.
-- ─────────────────────────────────────────────────────────────

do $$
declare
  v_kind char;
begin
  select c.relkind into v_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'user_aliases_rd';

  raise notice 'user_aliases_rd relkind = %', v_kind;

  if v_kind in ('r','p') then
    -- Migra dados existentes (se a estrutura permitir) antes de dropar
    begin
      insert into public.rd_responsaveis_alias (nome_planilha, email)
      select t.alias, u.email
        from public.user_aliases_rd t
        join public.users u on u.id = t.user_id
       where t.alias is not null and u.email is not null
      on conflict (lower(nome_planilha)) do nothing;
    exception when others then null;
    end;
    execute 'drop table public.user_aliases_rd cascade';
  elsif v_kind = 'v' then
    execute 'drop view public.user_aliases_rd cascade';
  elsif v_kind = 'm' then
    execute 'drop materialized view public.user_aliases_rd cascade';
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
