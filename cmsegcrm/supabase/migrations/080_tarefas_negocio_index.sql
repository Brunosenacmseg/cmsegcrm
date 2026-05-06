-- ═══════════════════════════════════════════════════════════════════════
-- Migration 080: índice em tarefas.negocio_id para o kanban
--
-- O kanban de funis agora exibe um balão de "próxima tarefa" em cada card
-- de negociação (com data e indicador de atraso). Para isso ele consulta
-- `tarefas` filtrando por um lote de `negocio_id`s da página visível.
--
-- A coluna já existe desde a migração 001 (FK p/ negocios), mas não tinha
-- índice — esta migration cria um parcial filtrando só tarefas em aberto,
-- que são as únicas relevantes para o badge.
-- ═══════════════════════════════════════════════════════════════════════

create index if not exists idx_tarefas_negocio_abertas
  on public.tarefas(negocio_id, prazo)
  where negocio_id is not null
    and status not in ('concluida','cancelada');
