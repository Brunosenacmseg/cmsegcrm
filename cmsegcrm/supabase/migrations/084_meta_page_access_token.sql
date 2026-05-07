-- ─────────────────────────────────────────────────────────────
-- 084_meta_page_access_token.sql
-- Adiciona coluna `page_access_token` em meta_config.
--
-- Por quê: a Graph API exige um Page Access Token (com leads_retrieval)
-- para chamar /{page_id}/leadgen_forms e /{leadgen_id}. Usar o User /
-- System Access Token costuma retornar "API access blocked" mesmo
-- quando o token tem ads_management. Persistir o page token evita ter
-- que resolver via /me/accounts a cada request — e permite ao admin
-- colar manualmente o token no UI quando o System User não administra
-- a Page.
-- ─────────────────────────────────────────────────────────────

alter table public.meta_config
  add column if not exists page_access_token text;

comment on column public.meta_config.page_access_token is
  'Page Access Token (escopo leads_retrieval) usado em leadgen_forms e fetch de leads. Pode ser informado manualmente no UI ou capturado via /me/accounts no OAuth.';
