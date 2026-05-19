-- ═══════════════════════════════════════════════════════════════════════════
-- 107_data_api_grants.sql
--
-- A partir de 30/10/2026 o Supabase deixa de expor automaticamente tabelas
-- do schema "public" para a Data API (supabase-js, PostgREST, GraphQL).
-- Toda tabela criada em "public" precisa de GRANT explícito para os papéis
-- "anon", "authenticated" e "service_role" — caso contrário a Data API
-- devolve erro 42501.
--
-- Esta migration:
--   1) Concede explicitamente os privilégios usuais em TODAS as tabelas e
--      sequências existentes em "public" (idempotente).
--   2) Define `ALTER DEFAULT PRIVILEGES` para que tabelas/sequências futuras
--      criadas no schema "public" pelo papel "postgres" (usado pelas
--      migrations) já nasçam acessíveis à Data API.
--
-- Idempotente: pode ser reaplicada sem efeitos colaterais.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── USAGE no schema ──────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated, service_role;

-- ─── Tabelas existentes ───────────────────────────────────────────────────
grant select
  on all tables in schema public
  to anon;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant all
  on all tables in schema public
  to service_role;

-- ─── Sequências existentes (para PKs gerados em insert) ───────────────────
grant usage, select
  on all sequences in schema public
  to anon, authenticated;

grant all
  on all sequences in schema public
  to service_role;

-- ─── Funções existentes ───────────────────────────────────────────────────
grant execute
  on all functions in schema public
  to anon, authenticated, service_role;

-- ─── Default privileges para objetos futuros ──────────────────────────────
-- Os objetos criados pelo papel `postgres` (papel usado pelo Supabase ao
-- aplicar migrations via Studio/CLI/MCP) passam a nascer com os grants
-- necessários para a Data API.

alter default privileges in schema public
  grant select
  on tables
  to anon;

alter default privileges in schema public
  grant select, insert, update, delete
  on tables
  to authenticated;

alter default privileges in schema public
  grant all
  on tables
  to service_role;

alter default privileges in schema public
  grant usage, select
  on sequences
  to anon, authenticated;

alter default privileges in schema public
  grant all
  on sequences
  to service_role;

alter default privileges in schema public
  grant execute
  on functions
  to anon, authenticated, service_role;
