-- ─────────────────────────────────────────────────────────────
-- 097_tarefas_secondary_responsaveis_visibility.sql
--
-- Corrige tarefas "sumindo": quando um usuário é adicionado como
-- responsável secundário (linha em `tarefa_responsaveis` que NÃO é
-- o `responsavel_id` principal nem `criado_por`), a tarefa não
-- aparecia para ele porque a RLS só checava esses dois campos.
--
-- Solução em duas pontas:
--   1) Estende `scoped_read_tarefas` para também liberar leitura
--      quando o usuário corrente puder ver QUALQUER linha de
--      `tarefa_responsaveis` daquela tarefa.
--   2) Garante que `tarefa_responsaveis` é alimentado mesmo quando
--      `tarefas` é inserido por integrações/automatizações que
--      não escrevem na tabela de junção (Tokio, Porto, RD Station,
--      automacoes, importar, integrador, funis, renovacoes).
--      Faz via trigger + backfill.
--
-- Idempotente.
-- ─────────────────────────────────────────────────────────────

-- 1) RLS: incluir checagem via tarefa_responsaveis ----------------
drop policy if exists "scoped_read_tarefas" on public.tarefas;
create policy "scoped_read_tarefas" on public.tarefas for select using (
  public.can_see_user(responsavel_id)
  or public.can_see_user(criado_por)
  or exists (
    select 1
    from public.tarefa_responsaveis r
    where r.tarefa_id = tarefas.id
      and public.can_see_user(r.user_id)
  )
);

-- 2) Trigger: sincroniza responsavel_id → tarefa_responsaveis ----
create or replace function public.tg_tarefa_responsaveis_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsavel_id is not null then
    insert into public.tarefa_responsaveis (tarefa_id, user_id)
    values (new.id, new.responsavel_id)
    on conflict do nothing;
  end if;
  return new;
end
$$;

drop trigger if exists tg_tarefa_responsaveis_sync_ins on public.tarefas;
create trigger tg_tarefa_responsaveis_sync_ins
  after insert on public.tarefas
  for each row
  execute function public.tg_tarefa_responsaveis_sync();

drop trigger if exists tg_tarefa_responsaveis_sync_upd on public.tarefas;
create trigger tg_tarefa_responsaveis_sync_upd
  after update of responsavel_id on public.tarefas
  for each row
  when (new.responsavel_id is distinct from old.responsavel_id)
  execute function public.tg_tarefa_responsaveis_sync();

-- 3) Backfill: garante que toda tarefa com responsavel_id tem
-- linha correspondente em tarefa_responsaveis.
insert into public.tarefa_responsaveis (tarefa_id, user_id)
select t.id, t.responsavel_id
from public.tarefas t
where t.responsavel_id is not null
  and not exists (
    select 1 from public.tarefa_responsaveis r
    where r.tarefa_id = t.id and r.user_id = t.responsavel_id
  );
