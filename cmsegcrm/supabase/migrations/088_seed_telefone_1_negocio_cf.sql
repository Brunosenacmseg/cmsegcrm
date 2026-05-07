-- ─────────────────────────────────────────────────────────────
-- 088_seed_telefone_1_negocio_cf.sql
-- Adiciona o campo personalizado "Telefone 1" para negócios.
-- Faz o campo aparecer nos seletores de mapeamento (formulários
-- Meta) e nas importações de negociações.
-- Idempotente via ON CONFLICT (entidade, chave).
-- ─────────────────────────────────────────────────────────────

insert into public.campos_personalizados (entidade, nome, chave, tipo, opcoes, ordem) values
  ('negocio', 'Telefone 1', 'telefone_1', 'texto', null, 45)
on conflict (entidade, chave) do update set
  nome   = excluded.nome,
  tipo   = excluded.tipo,
  opcoes = excluded.opcoes,
  ordem  = excluded.ordem,
  ativo  = true;
