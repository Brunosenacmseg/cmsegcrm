-- ─────────────────────────────────────────────────────────────
-- 010_cotacoes_resultado.sql
-- Adiciona colunas que o robô tenta gravar ao final de uma cotação
-- assíncrona. Sem elas, o robô loga:
--   "Could not find the 'resultado' column of 'cotacoes' in the schema cache"
-- ─────────────────────────────────────────────────────────────

alter table public.cotacoes
  add column if not exists resultado     jsonb,
  add column if not exists erro          text,
  add column if not exists screenshot    text,
  add column if not exists concluido_em  timestamptz,
  add column if not exists tentativas    int default 0;

create index if not exists idx_cotacoes_status on public.cotacoes(status);
