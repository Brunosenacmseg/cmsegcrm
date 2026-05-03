-- ─────────────────────────────────────────────────────────────
-- 062_vw_comissoes_security_invoker.sql
-- Garante que a view vw_comissoes_vendedor herde a RLS de
-- comissoes_recebidas para o usuário logado (Postgres 15+).
-- Sem isto, a view roda como o owner e o vendedor vê comissões
-- de outros usuários (a RLS da tabela base não é aplicada).
-- ─────────────────────────────────────────────────────────────

alter view public.vw_comissoes_vendedor set (security_invoker = true);
