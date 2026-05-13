-- ─────────────────────────────────────────────────────────────
-- 105_posvenda_acesso_total.sql
-- Estende o bypass da EQUIPE PÓS VENDA para TODOS os funis e
-- todas as negociações — análogo ao que GESTÃO já tem (093).
-- Antes desta migration, PÓS VENDA via apenas os funis EMISSÃO
-- E IMPLANTAÇÃO. Agora vê tudo.
--
-- Idempotente.
-- ─────────────────────────────────────────────────────────────

drop policy if exists "scoped_read_funis" on public.funis;
create policy "scoped_read_funis" on public.funis for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  or public.is_member_of_gestao()
  or public.is_member_of_posvenda()
  or not exists (select 1 from public.funis_equipes fe where fe.funil_id = funis.id)
  or exists (
    select 1
    from public.funis_equipes fe
    join public.equipe_membros em on em.equipe_id = fe.equipe_id
    where fe.funil_id = funis.id and em.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.funis_equipes fe
    join public.equipes e on e.id = fe.equipe_id
    where fe.funil_id = funis.id and e.lider_id = auth.uid()
  )
);

drop policy if exists "scoped_read_negocios" on public.negocios;
create policy "scoped_read_negocios" on public.negocios for select using (
  public.current_user_role() = 'admin'
  or public.is_member_of_gestao()
  or public.is_member_of_posvenda()
  or public.can_see_user(vendedor_id)
  or (equipe_id is not null and public.is_member_of_equipe(equipe_id))
);
