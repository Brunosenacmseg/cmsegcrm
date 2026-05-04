-- ─────────────────────────────────────────────────────────────
-- 067_seg_stage_campos_porto.sql
-- Adiciona colunas ao staging para preservar TODOS os campos que os
-- arquivos da Porto (e similares) trazem, evitando perda de dados.
-- ─────────────────────────────────────────────────────────────

-- seg_stage_apolices: campos do .APP/.API tipo 50
alter table public.seg_stage_apolices
  add column if not exists codigo_interno   text,
  add column if not exists endosso          text,
  add column if not exists tipo_pessoa      text,
  add column if not exists data_nascimento  date,
  add column if not exists sexo             text;

-- seg_stage_comissoes: campos extras do .COM
alter table public.seg_stage_comissoes
  add column if not exists data_emissao        date,
  add column if not exists codigo_interno      text,
  add column if not exists tipo_documento      text,  -- APL, PRP, RCO, etc.
  add column if not exists numero_proposta     text,
  add column if not exists descricao_operacao  text,  -- "COMISSAO FRACIO", etc.
  add column if not exists pc_comissao         numeric(8,4); -- taxa em % com 3 decimais
