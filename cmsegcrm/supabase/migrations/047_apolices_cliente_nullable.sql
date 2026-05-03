-- ─────────────────────────────────────────────────────────────
-- 047_apolices_cliente_nullable.sql
-- Permite cliente_id NULL em public.apolices.
--
-- Motivação: importações de seguradoras (Tokio, Porto) podem
-- trazer apólices/endossos onde o segurado não foi identificável
-- a partir do payload (sem CPF/nome legível). Bloquear o insert
-- inteiro só por causa disso causa perda de dados — preferimos
-- aceitar a apólice e tentar vincular o cliente depois.
-- ─────────────────────────────────────────────────────────────

alter table public.apolices alter column cliente_id drop not null;
