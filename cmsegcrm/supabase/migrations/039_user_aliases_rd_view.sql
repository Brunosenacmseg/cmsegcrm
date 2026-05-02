-- ─────────────────────────────────────────────────────────────
-- 039_user_aliases_rd_view.sql
-- Garante que public.user_aliases_rd seja uma VIEW sobre
-- rd_responsaveis_alias. Se já existir como tabela, migra dados
-- antes de dropar.
-- ─────────────────────────────────────────────────────────────

do $$
declare
  v_kind char;
begin
  select c.relkind into v_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'user_aliases_rd';

  if v_kind is null then
    return;
  end if;

  -- Se for tabela "de verdade" (r) ou particionada (p), preserva dados.
  if v_kind in ('r','p') then
    begin
      insert into public.rd_responsaveis_alias (nome_planilha, email)
      select t.alias, u.email
        from public.user_aliases_rd t
        join public.users u on u.id = t.user_id
       where t.alias is not null and u.email is not null
      on conflict (lower(nome_planilha)) do nothing;
    exception when others then
      -- estrutura diferente do esperado; ignora migração de dados
      null;
    end;
  end if;

  -- Drop universal: tenta cada tipo possível
  begin execute 'drop view  if exists public.user_aliases_rd cascade'; exception when others then null; end;
  begin execute 'drop materialized view if exists public.user_aliases_rd cascade'; exception when others then null; end;
  begin execute 'drop table if exists public.user_aliases_rd cascade'; exception when others then null; end;
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
