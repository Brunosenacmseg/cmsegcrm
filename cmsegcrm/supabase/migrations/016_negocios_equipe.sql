-- ─────────────────────────────────────────────────────────────
-- 016_negocios_equipe.sql
-- A) Negociações podem pertencer a uma EQUIPE inteira
--    (em vez de só vendedor) — usado pra cobrança/sinistro
--    quando a Porto Seguro envia inadimplência/sinistro pra
--    distribuir pra um time todo.
--
-- B) RLS atualizado: usuário vê negocios se
--    - é admin, OU
--    - pode ver vendedor_id (regra antiga), OU
--    - é membro/líder da equipe_id
--
-- C) Seed das equipes "Cobrança" e "Sinistro" (se não existirem).
--
-- D) Policies: permissão de DELETE/UPDATE para admin sobre
--    equipes e equipe_membros.
-- ─────────────────────────────────────────────────────────────

alter table public.negocios
  add column if not exists equipe_id uuid references public.equipes(id) on delete set null;

create index if not exists idx_negocios_equipe on public.negocios(equipe_id);

-- Helper RLS
create or replace function public.is_member_of_equipe(target_equipe uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.equipe_membros em
    where em.equipe_id = target_equipe and em.user_id = auth.uid()
  ) or exists (
    select 1 from public.equipes e
    where e.id = target_equipe and e.lider_id = auth.uid()
  );
$$;

-- Re-cria policy de leitura de negocios
drop policy if exists "scoped_read_negocios" on public.negocios;
create policy "scoped_read_negocios" on public.negocios for select using (
  public.current_user_role() = 'admin'
  or public.can_see_user(vendedor_id)
  or (equipe_id is not null and public.is_member_of_equipe(equipe_id))
);

-- Seed equipes operacionais (idempotente)
insert into public.equipes (nome)
select 'Cobrança' where not exists (select 1 from public.equipes where nome = 'Cobrança');
insert into public.equipes (nome)
select 'Sinistro' where not exists (select 1 from public.equipes where nome = 'Sinistro');

-- Admin pode editar/excluir equipes e equipe_membros
drop policy if exists "admin_escreve_equipes" on public.equipes;
create policy "admin_escreve_equipes" on public.equipes for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "admin_escreve_equipe_membros" on public.equipe_membros;
create policy "admin_escreve_equipe_membros" on public.equipe_membros for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
