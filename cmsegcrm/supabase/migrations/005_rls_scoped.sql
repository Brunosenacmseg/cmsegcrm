-- ═══════════════════════════════════════════════════════════════════
-- CM.segCRM — Migration 005: RLS escopado por role
--
-- Política antes desta migration:
--   "qualquer authenticated lê tudo" — corretores viam dados de todos.
--
-- Política depois desta migration:
--   • admin     → vê tudo
--   • lider     → vê o próprio + membros da própria equipe
--   • corretor  → vê apenas o próprio
--
-- Tabelas com SELECT escopado:
--   clientes, negocios, apolices, tarefas, cotacoes, ligacoes,
--   whatsapp_instancias, whatsapp_mensagens, metas, importacoes_porto
--
-- Tabelas que continuam abertas a todos os autenticados (decisão consciente):
--   users (precisa pra montar UI), funis, equipes, equipe_membros,
--   historico, anexos, manuais, mural_*, notificacoes (já filtra por user),
--   mensagens_internas (já filtra por participante), goto_tokens (já só do próprio)
--
-- Para reverter rapidamente em produção, basta executar
--   /* ROLLBACK */ no fim deste arquivo (comentários).
-- Execute no Supabase SQL Editor depois das migrations 001-004.
-- ═══════════════════════════════════════════════════════════════════

-- ─── HELPERS ─────────────────────────────────────────────────────────
-- security definer = a função roda com privilégios do owner (postgres),
-- então pode ler `users` mesmo se a policy do `users` for restritiva.
-- stable = mesma resposta dentro de uma query, permite cache.

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

-- Indica se o usuário atual pode ver registros do `target_id`:
--   • próprio usuário                                           → sim
--   • admin                                                      → sim
--   • líder com `target_id` membro da própria equipe             → sim
--   • registros sem dono (target_id null)                        → admin/líder
create or replace function public.can_see_user(target_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  with me as (
    select id, role from public.users where id = auth.uid()
  )
  select case
    when target_id is null then (select role in ('admin','lider') from me)
    when target_id = (select id from me) then true
    when (select role from me) = 'admin' then true
    when (select role from me) = 'lider' then exists (
      select 1
      from public.equipes e
      join public.equipe_membros em on em.equipe_id = e.id
      where e.lider_id = (select id from me) and em.user_id = target_id
    )
    else false
  end
$$;

-- ─── REMOVE policies amplas e cria policies escopadas ────────────────

-- Helper macro: dropar uma policy se existir
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in (
        'clientes','negocios','apolices','tarefas','cotacoes','ligacoes',
        'whatsapp_instancias','whatsapp_mensagens','metas','importacoes_porto'
      )
      and policyname like 'autenticados%'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ─── CLIENTES ────────────────────────────────────────────────────────
create policy "scoped_read_clientes"   on public.clientes for select using (public.can_see_user(vendedor_id));
create policy "auth_insert_clientes"   on public.clientes for insert with check (auth.role() = 'authenticated');
create policy "auth_update_clientes"   on public.clientes for update using (auth.role() = 'authenticated');
create policy "admin_delete_clientes"  on public.clientes for delete using (public.current_user_role() = 'admin');

-- ─── NEGOCIOS ────────────────────────────────────────────────────────
create policy "scoped_read_negocios"   on public.negocios for select using (public.can_see_user(vendedor_id));
create policy "auth_insert_negocios"   on public.negocios for insert with check (auth.role() = 'authenticated');
create policy "auth_update_negocios"   on public.negocios for update using (auth.role() = 'authenticated');
create policy "admin_delete_negocios"  on public.negocios for delete using (public.current_user_role() = 'admin');

-- ─── APOLICES ────────────────────────────────────────────────────────
create policy "scoped_read_apolices"   on public.apolices for select using (public.can_see_user(vendedor_id));
create policy "auth_insert_apolices"   on public.apolices for insert with check (auth.role() = 'authenticated');
create policy "auth_update_apolices"   on public.apolices for update using (auth.role() = 'authenticated');
create policy "admin_delete_apolices"  on public.apolices for delete using (public.current_user_role() = 'admin');

-- ─── TAREFAS ─────────────────────────────────────────────────────────
-- Tarefas: visível para responsável OU criador, ou admin/líder
create policy "scoped_read_tarefas"    on public.tarefas for select using (
  public.can_see_user(responsavel_id) or public.can_see_user(criado_por)
);
create policy "auth_insert_tarefas"    on public.tarefas for insert with check (auth.role() = 'authenticated');
create policy "auth_update_tarefas"    on public.tarefas for update using (auth.role() = 'authenticated');
create policy "admin_delete_tarefas"   on public.tarefas for delete using (public.current_user_role() = 'admin');

-- ─── COTACOES ────────────────────────────────────────────────────────
create policy "scoped_read_cotacoes"   on public.cotacoes for select using (public.can_see_user(user_id));
create policy "auth_insert_cotacoes"   on public.cotacoes for insert with check (auth.role() = 'authenticated');
create policy "auth_update_cotacoes"   on public.cotacoes for update using (auth.role() = 'authenticated');
create policy "admin_delete_cotacoes"  on public.cotacoes for delete using (public.current_user_role() = 'admin');

-- ─── LIGACOES ────────────────────────────────────────────────────────
create policy "scoped_read_ligacoes"   on public.ligacoes for select using (public.can_see_user(user_id));
create policy "auth_insert_ligacoes"   on public.ligacoes for insert with check (auth.role() = 'authenticated');
create policy "auth_update_ligacoes"   on public.ligacoes for update using (auth.role() = 'authenticated');
create policy "admin_delete_ligacoes"  on public.ligacoes for delete using (public.current_user_role() = 'admin');

-- ─── WHATSAPP_INSTANCIAS ─────────────────────────────────────────────
-- Cada usuário tem sua própria instância (chave WhatsApp pessoal)
create policy "own_read_whatsapp_inst"   on public.whatsapp_instancias for select using (public.can_see_user(user_id));
create policy "own_insert_whatsapp_inst" on public.whatsapp_instancias for insert with check (auth.uid() = user_id);
create policy "own_update_whatsapp_inst" on public.whatsapp_instancias for update using (auth.uid() = user_id or public.current_user_role() = 'admin');
create policy "admin_delete_whatsapp_inst" on public.whatsapp_instancias for delete using (public.current_user_role() = 'admin');

-- ─── WHATSAPP_MENSAGENS (escopo via instancia) ───────────────────────
create policy "scoped_read_whatsapp_msg" on public.whatsapp_mensagens for select using (
  exists (
    select 1 from public.whatsapp_instancias i
    where i.id = whatsapp_mensagens.instancia_id and public.can_see_user(i.user_id)
  )
);
create policy "auth_insert_whatsapp_msg" on public.whatsapp_mensagens for insert with check (auth.role() = 'authenticated');
create policy "auth_update_whatsapp_msg" on public.whatsapp_mensagens for update using (auth.role() = 'authenticated');
create policy "admin_delete_whatsapp_msg" on public.whatsapp_mensagens for delete using (public.current_user_role() = 'admin');

-- ─── METAS ───────────────────────────────────────────────────────────
-- Visível: o próprio (user_id) ou quem criou (criado_por), ou admin/líder
create policy "scoped_read_metas"      on public.metas for select using (
  public.can_see_user(user_id) or public.can_see_user(criado_por)
);
create policy "auth_insert_metas"      on public.metas for insert with check (auth.role() = 'authenticated');
create policy "auth_update_metas"      on public.metas for update using (auth.role() = 'authenticated');
create policy "admin_delete_metas"     on public.metas for delete using (public.current_user_role() = 'admin');

-- ─── IMPORTACOES_PORTO (admin/líder) ─────────────────────────────────
create policy "manager_read_porto_imp"  on public.importacoes_porto for select using (public.current_user_role() in ('admin','lider'));
create policy "auth_write_porto_imp"    on public.importacoes_porto for all using (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK (em caso de problema, executar abaixo manualmente):
-- ═══════════════════════════════════════════════════════════════════
-- do $$
-- declare
--   t text;
-- begin
--   for t in select unnest(array['clientes','negocios','apolices','tarefas','cotacoes',
--                                'ligacoes','whatsapp_instancias','whatsapp_mensagens',
--                                'metas','importacoes_porto']) loop
--     execute format('drop policy if exists "scoped_read_%s"   on public.%I', t, t);
--     execute format('drop policy if exists "auth_insert_%s"   on public.%I', t, t);
--     execute format('drop policy if exists "auth_update_%s"   on public.%I', t, t);
--     execute format('drop policy if exists "admin_delete_%s"  on public.%I', t, t);
--   end loop;
--   -- Recriar as políticas abertas:
--   create policy "autenticados leem" on public.clientes for select using (auth.role() = 'authenticated');
--   create policy "autenticados escrevem clientes" on public.clientes for all using (auth.role() = 'authenticated');
--   -- (...repetir para cada tabela...)
-- end $$;
