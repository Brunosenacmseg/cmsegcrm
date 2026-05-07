-- ─────────────────────────────────────────────────────────────
-- 090_meta_form_negocio_map.sql
-- Generaliza o mapeamento Meta → negociação. Cada coluna da
-- negociação (ou campo personalizado) recebe uma lista ordenada
-- de origens (chaves do formulário Meta ou metadados como
-- __meta__:campaign_name). O webhook concatena os valores com
-- " - " ao popular a coluna.
--
-- Substitui semanticamente titulo_campos e campo_map (mantidos
-- por compatibilidade — o webhook usa o novo mapa quando há
-- entrada para a coluna; caso contrário, cai no legado).
-- ─────────────────────────────────────────────────────────────

alter table public.meta_form_mapeamento
  add column if not exists campo_negocio_map jsonb not null default '{}'::jsonb;

comment on column public.meta_form_mapeamento.campo_negocio_map is
  'Mapeamento por coluna da negociação. Formato: { "negocio:titulo": ["__meta__:campaign_name", "first_name"], "negocio_cf:placa": ["qual_a_placa?"] }. Os valores resolvidos são concatenados com " - " ao criar a negociação.';
