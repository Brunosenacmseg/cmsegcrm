-- Migration 055: cliente_id nullable em apolices + garante RLS admin
-- Permite importar apolices "soltas" (sem cliente) e vincular depois via
-- /dashboard/apolices > botao "Sincronizar clientes".

-- 1) Tira NOT NULL de cliente_id pra permitir apolices nao vinculadas
alter table public.apolices alter column cliente_id drop not null;

-- 2) Re-aplica fix de RLS (idempotente — sobrescreve se 054 nao rodou)
drop policy if exists "scoped_read_apolices" on public.apolices;
create policy "scoped_read_apolices" on public.apolices for select using (
  public.current_user_role() = 'admin'
  or public.can_see_user(vendedor_id)
);

-- 3) Indices uteis pra sincronizacao por CPF/nome
create index if not exists idx_apolices_cliente_null
  on public.apolices (id) where cliente_id is null;
create index if not exists idx_clientes_nome_lower
  on public.clientes (lower(nome));
