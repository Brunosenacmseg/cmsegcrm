-- ─────────────────────────────────────────────────────────────
-- 113_tarefas_concluida_em.sql
-- Adiciona coluna concluida_em na tabela tarefas. O frontend de
-- /dashboard/negocios/[id] já tenta gravar nela ao clicar em
-- "Realizada", mas a coluna não existia e o update quebrava com
-- "Could not find the 'concluida_em' column of 'tarefas' in the
-- schema cache".
-- ─────────────────────────────────────────────────────────────

alter table public.tarefas add column if not exists concluida_em timestamptz;
create index if not exists tarefas_concluida_em_idx on public.tarefas(concluida_em) where concluida_em is not null;
update public.tarefas set concluida_em = coalesce(concluida_em, created_at)
  where status in ('concluida','realizada') and concluida_em is null;
