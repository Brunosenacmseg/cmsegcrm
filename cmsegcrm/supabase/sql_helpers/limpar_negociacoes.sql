-- ═════════════════════════════════════════════════════════════════════
-- Apaga TODAS as negociações dos funis (e o que depende delas).
-- Mantém: funis, etapas, clientes, usuários, equipes, financeiro, meta.
--
-- ⚠️ AÇÃO DESTRUTIVA. Cole no Supabase SQL Editor → Run.
-- ═════════════════════════════════════════════════════════════════════

begin;

-- 1. Tudo que referencia negocios (filhas primeiro)
delete from public.comissoes_recebidas where negocio_id is not null;
delete from public.tarefas              where negocio_id is not null;
delete from public.historico            where negocio_id is not null;
delete from public.anexos               where negocio_id is not null;
update public.apolices    set negocio_id = null where negocio_id is not null;
update public.meta_leads  set negocio_id = null where negocio_id is not null;

-- 2. Negociações
delete from public.negocios;

commit;

-- Conferência:
select 'negocios'             as tabela, count(*) from public.negocios
union all select 'funis',         count(*) from public.funis
union all select 'clientes',      count(*) from public.clientes
union all select 'apolices',      count(*) from public.apolices
union all select 'tarefas',       count(*) from public.tarefas
union all select 'comissoes_recebidas', count(*) from public.comissoes_recebidas;
