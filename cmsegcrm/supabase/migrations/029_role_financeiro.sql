-- ═══════════════════════════════════════════════════════════════════
-- 029 — Novo papel: financeiro
-- Permite role 'financeiro' (acesso a todos os módulos, sem privilégios
-- administrativos de gerência de usuários/integrações).
-- ═══════════════════════════════════════════════════════════════════

alter table public.users drop constraint if exists users_role_check;
alter table public.users add  constraint users_role_check
  check (role in ('admin','corretor','lider','financeiro'));
