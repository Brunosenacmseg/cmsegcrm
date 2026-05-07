-- Adiciona effective_status (status efetivo considerando pais pausados/arquivados)
-- e lifetime_budget para o módulo de campanhas Meta.
alter table public.meta_campanhas
  add column if not exists effective_status text,
  add column if not exists lifetime_budget  numeric(12,2);

create index if not exists idx_meta_campanhas_effective_status
  on public.meta_campanhas(effective_status);
