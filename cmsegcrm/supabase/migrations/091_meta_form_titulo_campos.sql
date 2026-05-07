-- ─────────────────────────────────────────────────────────────
-- 089_meta_form_titulo_campos.sql
-- Permite compor o título da negociação criada via Meta Lead Ads
-- a partir de um ou mais campos do formulário. Quando há mais de
-- um campo selecionado, os valores são concatenados com " - ".
-- ─────────────────────────────────────────────────────────────

alter table public.meta_form_mapeamento
  add column if not exists titulo_campos text[] not null default '{}';

comment on column public.meta_form_mapeamento.titulo_campos is
  'Lista ordenada de chaves (question.key) do formulário Meta cujos valores compõem o título da negociação. Quando vazia, usa fallback heurístico.';
