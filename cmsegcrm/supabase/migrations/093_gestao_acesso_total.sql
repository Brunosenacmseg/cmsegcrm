-- ─────────────────────────────────────────────────────────────
-- 093_gestao_acesso_total.sql
-- A equipe GESTÃO deve ter acesso a TODOS os funis e a TODAS as
-- negociações, independente do vendedor responsável.
--
-- Estende as policies já existentes:
--   • scoped_read_funis    (criada em 009_funis_equipes.sql)
--   • scoped_read_negocios (criada em 016_negocios_equipe.sql,
--                            atualizada em 080_negocios_acesso_emissao_posvenda.sql)
--
-- Não altera as regras existentes — apenas adiciona uma cláusula
-- OR para liberar leitura completa quando o usuário pertence (ou
-- lidera) uma equipe cujo nome (normalizado) seja "GESTÃO" /
-- "EQUIPE GESTÃO" / variações sem acento.
--
-- Idempotente.
-- ─────────────────────────────────────────────────────────────

-- Helper: o usuário atual pertence ou lidera a EQUIPE GESTÃO?
create or replace function public.is_member_of_gestao()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.equipe_membros em
    join public.equipes e on e.id = em.equipe_id
    where em.user_id = auth.uid()
      and public.pt_norm(e.nome) in (
        public.pt_norm('GESTÃO'),
        public.pt_norm('GESTAO'),
        public.pt_norm('EQUIPE GESTÃO'),
        public.pt_norm('EQUIPE GESTAO')
      )
  ) or exists (
    select 1
    from public.equipes e
    where e.lider_id = auth.uid()
      and public.pt_norm(e.nome) in (
        public.pt_norm('GESTÃO'),
        public.pt_norm('GESTAO'),
        public.pt_norm('EQUIPE GESTÃO'),
        public.pt_norm('EQUIPE GESTAO')
      )
  );
$$;

-- Recria scoped_read_funis incluindo bypass para GESTÃO.
drop policy if exists "scoped_read_funis" on public.funis;
create policy "scoped_read_funis" on public.funis for select using (
  -- Admin vê tudo
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  -- GESTÃO vê todos os funis, mesmo os com restrição de equipe
  or public.is_member_of_gestao()
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

-- Recria scoped_read_negocios incluindo bypass para GESTÃO.
drop policy if exists "scoped_read_negocios" on public.negocios;
create policy "scoped_read_negocios" on public.negocios for select using (
  public.current_user_role() = 'admin'
  or public.is_member_of_gestao()
  or public.can_see_user(vendedor_id)
  or (equipe_id is not null and public.is_member_of_equipe(equipe_id))
  or (
    public.is_funil_emissao_implantacao(funil_id)
    and public.is_member_of_posvenda()
  )
);
