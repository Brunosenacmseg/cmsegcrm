-- ─────────────────────────────────────────────────────────────
-- 040_seed_produtos.sql
-- Seed de produtos. Idempotente via índice unique em lower(nome).
-- ─────────────────────────────────────────────────────────────

insert into public.produtos (nome) values
  ('AUTOMOVEL'),
  ('Automóvel'),
  ('BIKE'),
  ('CAPITALIZAÇÃO'),
  ('Cartão - 1ª bandeira'),
  ('Celular'),
  ('CONSÓRCIO'),
  ('CONSÓRCIO AUTO'),
  ('Consórcio Auto'),
  ('CONSÓRCIO IMÓVEL'),
  ('CONSÓRCIO MOTO'),
  ('CONSÓRCIO PESADOS'),
  ('CONSÓRCIO VAN'),
  ('Conta Digital Porto Bank'),
  ('Conta Digital Visa'),
  ('EMPRESARIAL'),
  ('EQUIPAMENTOS PORTATEIS'),
  ('Equipamentos Portáteis'),
  ('EVENTOS'),
  ('FIANÇA'),
  ('FINANCIAMENTO'),
  ('PLANO DE SAÚDE'),
  ('RC PROFISSIONAL'),
  ('RCO'),
  ('RESIDENCIAL'),
  ('Residencial Essencial'),
  ('TRANSPORTES'),
  ('Viagem'),
  ('VIDA'),
  ('Vida Individual')
on conflict (lower(nome)) do update set ativo = true;
