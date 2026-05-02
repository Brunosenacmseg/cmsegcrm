-- ─────────────────────────────────────────────────────────────
-- 035_seed_motivos_perda.sql
-- Seed dos motivos de perda padrão. Idempotente via índice unique
-- em lower(nome).
-- ─────────────────────────────────────────────────────────────

insert into public.motivos_perda (nome, ordem) values
  ('Ainda não comprou o veículo',              10),
  ('Apólice anterior cancelada',               20),
  ('Card duplicado',                           30),
  ('Cliente bloqueou',                         40),
  ('Cliente fechou com concorrente',           50),
  ('Cliente já tem seguro atualmente',         60),
  ('Dados incorretos',                         70),
  ('Falta de retorno',                         80),
  ('Fechou com proteção veicular',             90),
  ('Interesse Futuro',                        100),
  ('Não quis passar informações para cálculo',110),
  ('Não tem interesse',                       120),
  ('Preço',                                   130),
  ('Profissão sem aceitação',                 140),
  ('Sem aceitação',                           150),
  ('Sem retorno após envio de orçamento',     160),
  ('Vendeu o veículo e não renovou',          170)
on conflict (lower(nome)) do update set
  ordem = excluded.ordem,
  ativo = true;
