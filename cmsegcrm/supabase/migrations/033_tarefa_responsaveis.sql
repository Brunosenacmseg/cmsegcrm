-- ═════════════════════════════════════════════════════════════════════
-- 033_tarefa_responsaveis.sql
--
-- Permite múltiplos responsáveis por tarefa.
-- O campo `tarefas.responsavel_id` continua existindo como o "principal"
-- (compatibilidade), mas a fonte de verdade passa a ser a tabela
-- `tarefa_responsaveis`. Toda tarefa deve ter pelo menos uma linha aqui
-- (incluindo o próprio `responsavel_id`).
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.tarefa_responsaveis (
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  user_id   uuid not null references public.users(id)   on delete cascade,
  primary key (tarefa_id, user_id)
);

create index if not exists idx_tarefa_resp_user on public.tarefa_responsaveis(user_id);

-- Backfill: replica o responsavel_id atual de cada tarefa para a tabela.
insert into public.tarefa_responsaveis (tarefa_id, user_id)
select t.id, t.responsavel_id
from public.tarefas t
where t.responsavel_id is not null
  and not exists (
    select 1 from public.tarefa_responsaveis r
    where r.tarefa_id = t.id and r.user_id = t.responsavel_id
  );

alter table public.tarefa_responsaveis enable row level security;

-- Políticas: leitura para autenticados (a visibilidade da tarefa em si
-- já é controlada pela RLS da tabela `tarefas`); escrita liberada para
-- autenticados (o app filtra por papel).
drop policy if exists "auth_read_tarefa_resp"   on public.tarefa_responsaveis;
create policy "auth_read_tarefa_resp"   on public.tarefa_responsaveis for select using (auth.role() = 'authenticated');
drop policy if exists "auth_insert_tarefa_resp" on public.tarefa_responsaveis;
create policy "auth_insert_tarefa_resp" on public.tarefa_responsaveis for insert with check (auth.role() = 'authenticated');
drop policy if exists "auth_delete_tarefa_resp" on public.tarefa_responsaveis;
create policy "auth_delete_tarefa_resp" on public.tarefa_responsaveis for delete using (auth.role() = 'authenticated');
