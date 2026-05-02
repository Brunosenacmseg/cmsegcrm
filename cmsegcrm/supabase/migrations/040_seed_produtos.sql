-- ─────────────────────────────────────────────────────────────
-- 040_seed_produtos.sql
-- Seed de produtos. Idempotente via anti-join (não depende de qual
-- índice unique está vigente).
-- ─────────────────────────────────────────────────────────────

with novos(nome) as (values
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
)
insert into public.produtos (nome)
select n.nome
  from novos n
 where not exists (
   select 1 from public.produtos p
    where lower(p.nome) = lower(n.nome)
 );

-- Reativa quem já existia mas estava inativo
update public.produtos set ativo = true
 where lower(nome) in (
   'automovel','automóvel','bike','capitalização','cartão - 1ª bandeira','celular',
   'consórcio','consórcio auto','consórcio imóvel','consórcio moto','consórcio pesados','consórcio van',
   'conta digital porto bank','conta digital visa','empresarial','equipamentos portateis','equipamentos portáteis',
   'eventos','fiança','financiamento','plano de saúde','rc profissional','rco','residencial',
   'residencial essencial','transportes','viagem','vida','vida individual'
 ) and ativo = false;
