-- ─────────────────────────────────────────────────────────────
-- 040_seed_produtos.sql  (v3, autocurativa)
-- 1) Garante a função pt_norm
-- 2) Limpa qualquer duplicata existente em produtos por pt_norm
-- 3) Insere apenas o que falta (deduplicando a lista pelo mesmo
--    critério de pt_norm). Tudo em uma transação implícita.
-- ─────────────────────────────────────────────────────────────

create or replace function public.pt_norm(t text)
returns text language sql immutable as $$
  select lower(translate(coalesce(t,''),
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÝÇÑáàâãäåéèêëíìîïóòôõöúùûüýÿçñ',
    'AAAAAAEEEEIIIIOOOOOUUUUYCNaaaaaaeeeeiiiiooooouuuuyycn'));
$$;

-- (a) Limpa duplicatas pré-existentes na tabela produtos
with ranqueado as (
  select id, nome,
    row_number() over (
      partition by public.pt_norm(nome)
      order by
        ( case when nome ~ '[áàâãäåéèêëíìîïóòôõöúùûüýÿçñ]' then 10 else 0 end
        + case when nome ~ '[a-z]' and nome ~ '[A-Z]' then 5 else 0 end
        + case when nome ~ '[a-z]' then 1 else 0 end
        ) desc, criado_em asc
    ) as rn
  from public.produtos
)
delete from public.produtos
 where id in (select id from ranqueado where rn > 1);

-- (b) Insere o seed, deduplicando a lista pela mesma chave normalizada
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

-- (c) Reativa quem ficou inativo
update public.produtos set ativo = true where ativo = false;
