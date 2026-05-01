-- ─────────────────────────────────────────────────────────────
-- 023_negocios_qualificacao.sql
-- Adiciona qualificação 1-5 estrelas em cada negociação.
-- 0 = sem qualificação ainda.
-- ─────────────────────────────────────────────────────────────

alter table public.negocios
  add column if not exists qualificacao smallint default 0
    check (qualificacao between 0 and 5);

create index if not exists idx_negocios_qualificacao on public.negocios(qualificacao)
  where qualificacao > 0;
