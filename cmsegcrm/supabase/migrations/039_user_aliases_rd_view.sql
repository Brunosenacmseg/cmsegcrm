-- ─────────────────────────────────────────────────────────────
-- 039_user_aliases_rd_view.sql
-- Compat: o código (api/importar e api/rdstation/sync-responsaveis)
-- já lê de "user_aliases_rd" mas a tabela nunca foi criada.
-- Cria uma VIEW sobre rd_responsaveis_alias resolvendo o user_id
-- pelo email — assim código antigo passa a enxergar os aliases
-- recém-cadastrados.
-- ─────────────────────────────────────────────────────────────

create or replace view public.user_aliases_rd as
select
  a.id,
  u.id   as user_id,
  a.nome_planilha as alias,
  a.criado_em
from public.rd_responsaveis_alias a
left join public.users u on lower(u.email) = lower(a.email)
where a.ativo;

grant select on public.user_aliases_rd to anon, authenticated;
