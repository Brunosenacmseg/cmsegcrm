-- ─────────────────────────────────────────────────────────────
-- 064_meta_form_campo_map.sql
-- Mapeamento de campos do formulário Meta → colunas do cliente.
-- Ex: { "full_name": "nome", "phone_number": "telefone",
--       "what_is_your_cpf?": "cpf_cnpj", "city": "cidade" }
-- ─────────────────────────────────────────────────────────────

alter table public.meta_form_mapeamento
  add column if not exists campo_map jsonb not null default '{}'::jsonb;
