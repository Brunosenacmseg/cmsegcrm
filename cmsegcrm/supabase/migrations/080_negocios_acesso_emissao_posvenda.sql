-- ─────────────────────────────────────────────────────────────
-- 080_negocios_acesso_emissao_posvenda.sql
-- No funil "EMISSÃO E IMPLANTAÇÃO", qualquer membro/líder da
-- "EQUIPE PÓS VENDA" enxerga TODAS as negociações do funil,
-- independente de quem é o vendedor responsável.
--
-- Estende a policy `scoped_read_negocios` (migration 016) com
-- mais uma cláusula. As regras anteriores continuam valendo:
--   - admin vê tudo
--   - can_see_user(vendedor_id) — próprio + membros da equipe (líder)
--   - is_member_of_equipe(equipe_id) — quando o card foi atribuído
--     diretamente a uma equipe
--   - NOVO: card está no funil EMISSÃO E IMPLANTAÇÃO e o usuário
--     pertence à EQUIPE PÓS VENDA.
--
-- Idempotente.
-- ─────────────────────────────────────────────────────────────

-- Helper: o usuário atual está na EQUIPE PÓS VENDA?
create or replace function public.is_member_of_posvenda()
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
        public.pt_norm('EQUIPE PÓS VENDA'),
        public.pt_norm('EQUIPE POS VENDA'),
        public.pt_norm('PÓS VENDA'),
        public.pt_norm('POS VENDA'),
        public.pt_norm('PÓS-VENDA'),
        public.pt_norm('POS-VENDA')
      )
  ) or exists (
    select 1
    from public.equipes e
    where e.lider_id = auth.uid()
      and public.pt_norm(e.nome) in (
        public.pt_norm('EQUIPE PÓS VENDA'),
        public.pt_norm('EQUIPE POS VENDA'),
        public.pt_norm('PÓS VENDA'),
        public.pt_norm('POS VENDA'),
        public.pt_norm('PÓS-VENDA'),
        public.pt_norm('POS-VENDA')
      )
  );
$$;

-- Helper: o funil_id corresponde ao funil EMISSÃO E IMPLANTAÇÃO?
create or replace function public.is_funil_emissao_implantacao(target_funil uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.funis f
    where f.id = target_funil
      and public.pt_norm(f.nome) = public.pt_norm('EMISSÃO E IMPLANTAÇÃO')
  );
$$;

-- Recria a policy de leitura de negocios incluindo o novo critério.
drop policy if exists "scoped_read_negocios" on public.negocios;
create policy "scoped_read_negocios" on public.negocios for select using (
  public.current_user_role() = 'admin'
  or public.can_see_user(vendedor_id)
  or (equipe_id is not null and public.is_member_of_equipe(equipe_id))
  or (
    public.is_funil_emissao_implantacao(funil_id)
    and public.is_member_of_posvenda()
  )
);
