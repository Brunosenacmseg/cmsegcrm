-- ─────────────────────────────────────────────────────────────
-- 102_user_soft_delete_handoff.sql
-- Exclusão de usuário com:
--   1) preservação do responsável (vendedor_id/corretor_id)
--      nas negociações já fechadas (ganho / perdido) – nada muda;
--   2) transferência das negociações EM ANDAMENTO para o líder
--      da equipe do usuário excluído;
--   3) soft-delete em public.users (coluna deleted_at) para que
--      o histórico continue exibindo o nome do usuário antigo.
-- ─────────────────────────────────────────────────────────────

-- A) Soft-delete column
alter table public.users
  add column if not exists deleted_at timestamptz;

create index if not exists idx_users_deleted_at
  on public.users (deleted_at)
  where deleted_at is null;

-- B) Função que descobre o líder de fallback para um usuário.
--    Ordem de preferência:
--      1) líder da equipe à qual o usuário pertence (equipe_membros);
--      2) líder de qualquer equipe (qualquer linha de equipes.lider_id);
--      3) primeiro admin ativo.
--    Se o próprio usuário for o líder, ignora e segue para o próximo.
create or replace function public.usuario_lider_fallback(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.lider_id
        from public.equipe_membros m
        join public.equipes e on e.id = m.equipe_id
       where m.user_id = p_user_id
         and e.lider_id is not null
         and e.lider_id <> p_user_id
       order by e.created_at
       limit 1
    ),
    (
      select e.lider_id
        from public.equipes e
       where e.lider_id is not null
         and e.lider_id <> p_user_id
       order by e.created_at
       limit 1
    ),
    (
      select u.id
        from public.users u
       where u.role = 'admin'
         and u.id <> p_user_id
         and u.deleted_at is null
       order by u.created_at
       limit 1
    )
  );
$$;

-- C) RPC chamada pela API admin para excluir o usuário com handoff.
--    Retorna jsonb com {ok, leader_id, transferidos}.
create or replace function public.excluir_usuario_com_handoff(
  p_user_id          uuid,
  p_admin_id         uuid,
  p_leader_override  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_role text;
  v_alvo_role  text;
  v_lider_id   uuid;
  v_transferidos integer := 0;
begin
  -- valida solicitante
  select role into v_admin_role
    from public.users
   where id = p_admin_id;
  if v_admin_role is null or v_admin_role <> 'admin' then
    raise exception 'Apenas admin pode excluir usuários' using errcode = '42501';
  end if;

  -- valida alvo
  select role into v_alvo_role
    from public.users
   where id = p_user_id
     and deleted_at is null;
  if v_alvo_role is null then
    raise exception 'Usuário não encontrado ou já excluído' using errcode = 'P0002';
  end if;

  if p_user_id = p_admin_id then
    raise exception 'Você não pode excluir a si mesmo' using errcode = '42501';
  end if;

  -- determina líder destino das negociações em andamento
  v_lider_id := coalesce(p_leader_override, public.usuario_lider_fallback(p_user_id));

  -- só transfere se houver alguém pra receber; caso contrário,
  -- mantemos os campos para evitar quebrar FK e perder atribuição
  if v_lider_id is not null and v_lider_id <> p_user_id then
    update public.negocios
       set vendedor_id = case when vendedor_id = p_user_id then v_lider_id else vendedor_id end,
           corretor_id = case when corretor_id = p_user_id then v_lider_id else corretor_id end,
           updated_at  = now()
     where status = 'em_andamento'
       and (vendedor_id = p_user_id or corretor_id = p_user_id);
    get diagnostics v_transferidos = row_count;
  end if;

  -- remove do(s) time(s) e libera liderança se for o caso
  delete from public.equipe_membros where user_id = p_user_id;
  update public.equipes set lider_id = null where lider_id = p_user_id;

  -- soft delete
  update public.users
     set deleted_at = now()
   where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'leader_id', v_lider_id,
    'transferidos', v_transferidos
  );
end;
$$;

grant execute on function public.excluir_usuario_com_handoff(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.usuario_lider_fallback(uuid) to authenticated, service_role;
