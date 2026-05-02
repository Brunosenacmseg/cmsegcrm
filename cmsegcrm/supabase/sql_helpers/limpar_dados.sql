-- ═════════════════════════════════════════════════════════════════════
-- LIMPAR DADOS — wipe operacional (clientes/negociacoes/apolices/tarefas)
--
-- ⚠️  AÇÃO DESTRUTIVA. Faz DELETE em todas as tabelas operacionais.
--     NÃO toca em users, equipes, funis, motivos_perda, produtos,
--     tags, origens, automacoes, agentes_ia, email_templates,
--     campos_personalizados, financeiro_categorias/despesas, contas
--     de configuração (meta_config, rdstation_oauth, etc).
--
-- Use para resetar a base antes de reimportar do RD Station / Meta /
-- Porto / planilhas. Cole no Supabase SQL Editor → Run.
--
-- Ordem é importante por causa de FKs: filhas → pais.
-- ═════════════════════════════════════════════════════════════════════

begin;

-- 1. Logs e tabelas auxiliares
delete from public.automacoes_logs;
delete from public.meta_eventos_log;
delete from public.assinaturas_signatarios;
delete from public.assinaturas;
delete from public.negocio_tags;
delete from public.negocio_produtos;
delete from public.negocio_notas;
delete from public.cliente_tags;

-- 2. Tabelas que referenciam clientes/negocios/apolices
delete from public.comissoes_recebidas;
delete from public.tarefas;
delete from public.historico;
delete from public.anexos               where categoria in ('negocio','cliente','comissao');
delete from public.whatsapp_mensagens;
delete from public.ligacoes;
delete from public.cotacoes;
delete from public.meta_leads;
delete from public.contas_pagar;

-- 3. Apólices, negociações, clientes (FK chain)
delete from public.apolices;
delete from public.negocios;
delete from public.clientes;

-- 4. Logs de importação (comente se quiser manter histórico)
delete from public.importacoes_dados;
delete from public.importacoes_comissao;
delete from public.importacoes_porto;
delete from public.rdstation_syncs;

-- 5. Métricas Meta (estrutura de campanhas/adsets fica)
delete from public.meta_insights;
-- delete from public.meta_ads;          -- descomente se quiser zerar tudo
-- delete from public.meta_adsets;
-- delete from public.meta_campanhas;

commit;

-- Conferência:
select 'clientes'             as tabela, count(*) as registros from public.clientes
union all select 'negocios',     count(*) from public.negocios
union all select 'apolices',     count(*) from public.apolices
union all select 'tarefas',      count(*) from public.tarefas
union all select 'historico',    count(*) from public.historico
union all select 'comissoes_recebidas', count(*) from public.comissoes_recebidas
union all select 'cotacoes',     count(*) from public.cotacoes
union all select 'whatsapp_mensagens', count(*) from public.whatsapp_mensagens
union all select 'assinaturas',  count(*) from public.assinaturas
union all select 'contas_pagar', count(*) from public.contas_pagar
union all select 'meta_leads',   count(*) from public.meta_leads;
