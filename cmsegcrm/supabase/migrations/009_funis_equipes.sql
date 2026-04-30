-- ─────────────────────────────────────────────────────────────
-- 009_funis_equipes.sql
-- Visibilidade de funis por equipe (M2M).
--
-- Regra:
--   - Funil SEM nenhuma linha em funis_equipes → visível a todos os
--     autenticados (compatível com o comportamento anterior).
--   - Funil COM linhas em funis_equipes → visível somente a:
--       • admin (sempre vê tudo)
--       • membros das equipes vinculadas
--       • líderes das equipes vinculadas
-- ─────────────────────────────────────────────────────────────

create table if not exists public.funis_equipes (
  funil_id  uuid not null references public.funis(id)   on delete cascade,
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  primary key (funil_id, equipe_id)
);

alter table public.funis_equipes enable row level security;

do $$
begin
  -- Leitura: qualquer autenticado (a UI precisa montar a lista por funil)
  if not exists (select 1 from pg_policies where tablename='funis_equipes' and policyname='auth_read_funis_equipes') then
    create policy "auth_read_funis_equipes" on public.funis_equipes
      for select using (auth.role() = 'authenticated');
  end if;

  -- Escrita: apenas admin
  if not exists (select 1 from pg_policies where tablename='funis_equipes' and policyname='admin_insert_funis_equipes') then
    create policy "admin_insert_funis_equipes" on public.funis_equipes
      for insert with check (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='funis_equipes' and policyname='admin_delete_funis_equipes') then
    create policy "admin_delete_funis_equipes" on public.funis_equipes
      for delete using (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;
end$$;

-- Substitui a policy de leitura genérica de funis pela versão com escopo de equipe
do $$
begin
  drop policy if exists "autenticados leem" on public.funis;
  drop policy if exists "scoped_read_funis" on public.funis;
end$$;

create policy "scoped_read_funis" on public.funis for select using (
  -- Admin vê tudo
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  -- ou funil sem restrição de equipe
  or not exists (select 1 from public.funis_equipes fe where fe.funil_id = funis.id)
  -- ou usuário é membro de alguma equipe permitida
  or exists (
    select 1
    from public.funis_equipes fe
    join public.equipe_membros em on em.equipe_id = fe.equipe_id
    where fe.funil_id = funis.id and em.user_id = auth.uid()
  )
  -- ou usuário é líder de alguma equipe permitida
  or exists (
    select 1
    from public.funis_equipes fe
    join public.equipes e on e.id = fe.equipe_id
    where fe.funil_id = funis.id and e.lider_id = auth.uid()
  )
);
