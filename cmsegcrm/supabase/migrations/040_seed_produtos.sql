-- ─────────────────────────────────────────────────────────────
-- 040_seed_produtos.sql
-- Seed de produtos. Usa pt_norm() (criado em 041) se existir,
-- senão lower(). Deduplica a lista interna pela mesma chave para
-- evitar violar o índice unique.
-- ─────────────────────────────────────────────────────────────

-- Garante a função pt_norm (caso 041 ainda não tenha rodado)
create or replace function public.pt_norm(t text)
returns text
language sql
immutable
as $$
  select lower(translate(coalesce(t,''),
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÝÇÑáàâãäåéèêëíìîïóòôõöúùûüýÿçñ',
    'AAAAAAEEEEIIIIOOOOOUUUUYCNaaaaaaeeeeiiiiooooouuuuyycn'));
$$;

with novos_raw(nome) as (values
  ('AUTOMOVEL'),('Automóvel'),('BIKE'),('CAPITALIZAÇÃO'),
  ('Cartão - 1ª bandeira'),('Celular'),('CONSÓRCIO'),
  ('CONSÓRCIO AUTO'),('Consórcio Auto'),('CONSÓRCIO IMÓVEL'),
  ('CONSÓRCIO MOTO'),('CONSÓRCIO PESADOS'),('CONSÓRCIO VAN'),
  ('Conta Digital Porto Bank'),('Conta Digital Visa'),
  ('EMPRESARIAL'),('EQUIPAMENTOS PORTATEIS'),('Equipamentos Portáteis'),
  ('EVENTOS'),('FIANÇA'),('FINANCIAMENTO'),('PLANO DE SAÚDE'),
  ('RC PROFISSIONAL'),('RCO'),('RESIDENCIAL'),('Residencial Essencial'),
  ('TRANSPORTES'),('Viagem'),('VIDA'),('Vida Individual')
),
-- Dedupe interno pela chave normalizada — mantém a "mais bonita"
ranqueado as (
  select nome, public.pt_norm(nome) as chave,
    row_number() over (
      partition by public.pt_norm(nome)
      order by
        ( case when nome ~ '[áàâãäåéèêëíìîïóòôõöúùûüýÿçñ]' then 10 else 0 end
        + case when nome ~ '[a-z]' and nome ~ '[A-Z]' then 5 else 0 end
        + case when nome ~ '[a-z]' then 1 else 0 end
        ) desc
    ) as rn
  from novos_raw
),
novos as (select nome, chave from ranqueado where rn = 1)
insert into public.produtos (nome)
select n.nome
  from novos n
 where not exists (
   select 1 from public.produtos p where public.pt_norm(p.nome) = n.chave
 );

-- Reativa quem ficou inativo
update public.produtos set ativo = true
 where public.pt_norm(nome) in (
   'automovel','bike','capitalizacao','cartao - 1a bandeira','celular',
   'consorcio','consorcio auto','consorcio imovel','consorcio moto',
   'consorcio pesados','consorcio van','conta digital porto bank',
   'conta digital visa','empresarial','equipamentos portateis','eventos',
   'fianca','financiamento','plano de saude','rc profissional','rco',
   'residencial','residencial essencial','transportes','viagem','vida',
   'vida individual'
 ) and ativo = false;
