-- ─────────────────────────────────────────────────────────────
-- 078_contas_pagar_multiplos_anexos.sql
-- Permite vincular múltiplos PDFs/anexos a uma conta a pagar.
-- Mantém a coluna legada contas_pagar.anexo_id (1:1) para
-- compatibilidade; novos uploads usam anexos.conta_pagar_id (1:N).
-- ─────────────────────────────────────────────────────────────

alter table public.anexos
  add column if not exists conta_pagar_id uuid
  references public.contas_pagar(id) on delete cascade;

create index if not exists idx_anexos_conta_pagar
  on public.anexos(conta_pagar_id);
