-- ─────────────────────────────────────────────────────────────
-- 049_apolices_indices_performance.sql
-- Índices pra evitar timeout em listagens com 30k+ apólices.
-- O módulo Apólices ordena/filtra por essas colunas frequentemente.
-- ─────────────────────────────────────────────────────────────

create index if not exists idx_apolices_vigencia_fim   on public.apolices (vigencia_fim desc nulls last);
create index if not exists idx_apolices_vendedor_id    on public.apolices (vendedor_id);
create index if not exists idx_apolices_cliente_id     on public.apolices (cliente_id);
create index if not exists idx_apolices_seguradora     on public.apolices (seguradora);
create index if not exists idx_apolices_numero         on public.apolices (numero);
create index if not exists idx_apolices_status         on public.apolices (status);

-- Atualiza estatísticas pro planner usar os índices novos
analyze public.apolices;
