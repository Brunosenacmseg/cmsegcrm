-- ─────────────────────────────────────────────────────────────
-- 056_seg_apolices_relatorio.sql
-- Sinaliza apólices importadas onde o cliente foi criado
-- automaticamente (não existia no CRM), para conferência manual.
-- ─────────────────────────────────────────────────────────────

alter table public.seg_stage_apolices
  add column if not exists cliente_criado_auto boolean not null default false;

create index if not exists idx_seg_stage_apo_criado_auto
  on public.seg_stage_apolices(seguradora_id, cliente_criado_auto)
  where cliente_criado_auto = true;
