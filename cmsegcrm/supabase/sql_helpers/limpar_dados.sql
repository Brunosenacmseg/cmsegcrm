-- ═════════════════════════════════════════════════════════════════════
-- LIMPAR DADOS — clientes, negociações, funis e tudo que depende deles
--
-- ⚠️  AÇÃO DESTRUTIVA. Faz DELETE em todas as tabelas operacionais.
--     NÃO toca em users, equipes, financeiro_*, meta_config, rdstation_oauth.
--
-- Use para resetar a base antes de reimportar do RD Station / Meta /
-- planilhas. Roda no Supabase SQL Editor.
--
-- Ordem é importante por causa de FKs:
--   filhas → pais. Tudo que referencia um registro vem ANTES dele.
-- ═════════════════════════════════════════════════════════════════════

begin;

-- 1. Mensagens / mural / notificações (poluem painel mas não dependem de cliente)
delete from public.mural_mencoes;
delete from public.mural_reacoes;
delete from public.mural_comentarios;
delete from public.mural_posts;

-- 2. Tabelas que referenciam clientes/negocios/apolices
delete from public.comissoes_recebidas;
delete from public.anexos                 where categoria in ('negocio','cliente','comissao');
delete from public.historico;
delete from public.tarefas;
delete from public.apolices;
delete from public.whatsapp_mensagens;
delete from public.ligacoes;
delete from public.cotacoes;
delete from public.meta_leads;
delete from public.notificacoes;

-- 3. Negócios e clientes
delete from public.negocios;
delete from public.clientes;

-- 4. Funis (precisa apagar relação com equipes primeiro)
delete from public.funis_equipes;
delete from public.funis;

-- 5. Logs de importação (opcional — comente se quiser manter histórico)
delete from public.importacoes_dados;
delete from public.importacoes_comissao;
delete from public.importacoes_porto;
delete from public.rdstation_syncs;

-- 6. Métricas Meta (campanhas/adsets/ads ficam — só leads/insights são reimportáveis)
delete from public.meta_insights;
-- delete from public.meta_ads;          -- descomente se quiser limpar tudo
-- delete from public.meta_adsets;
-- delete from public.meta_campanhas;

commit;

-- Conferência rápida:
select 'clientes'  as tabela, count(*) from public.clientes
union all select 'negocios',     count(*) from public.negocios
union all select 'apolices',     count(*) from public.apolices
union all select 'tarefas',      count(*) from public.tarefas
union all select 'historico',    count(*) from public.historico
union all select 'comissoes_recebidas', count(*) from public.comissoes_recebidas
union all select 'funis',        count(*) from public.funis
union all select 'funis_equipes',count(*) from public.funis_equipes
union all select 'meta_leads',   count(*) from public.meta_leads;
