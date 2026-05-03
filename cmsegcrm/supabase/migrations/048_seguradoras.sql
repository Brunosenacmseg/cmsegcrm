-- ─────────────────────────────────────────────────────────────
-- 048_seguradoras.sql
-- Cadastro central de seguradoras para uso em apólices, cotações
-- e negociações. Substitui as listas hardcoded espalhadas pelo
-- frontend.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.seguradoras (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- Garante função de normalização (idempotente)
create or replace function public.pt_norm(t text)
returns text language sql immutable as $$
  select lower(translate(coalesce(t,''),
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÝÇÑáàâãäåéèêëíìîïóòôõöúùûüýÿçñ',
    'AAAAAAEEEEIIIIOOOOOUUUUYCNaaaaaaeeeeiiiiooooouuuuyycn'));
$$;

-- Índice único por nome normalizado para evitar duplicatas
create unique index if not exists seguradoras_nome_norm_uq
  on public.seguradoras (public.pt_norm(nome));

-- Seed da lista oficial
with novos(nome) as (values
  ('ACE SEGURADORA S.A.'),
  ('AGROBRASIL - CORRETORA DE SEGUROS'),
  ('AKAD SEGUROS S.A.'),
  ('ALFA SEGURADORA S.A.'),
  ('ALIRO SEGURO'),
  ('ALLIANZ SEGUROS S.A.'),
  ('ALLSEG'),
  ('AZOS SEGUROS'),
  ('AZUL COMPANHIA DE SEGUROS GERAIS'),
  ('BEM PROTEGE SEGUROS.'),
  ('BRADESCO SEGUROS S.A'),
  ('YOUSE - CAIXA SEGURADORA S/A'),
  ('CHUBB DO BRASIL CIA DE SEGUROS'),
  ('COMPANHIA EXCELSIOR DE SEGUROS'),
  ('DARWIN SEGUROS S.A'),
  ('ECCOUNT S/A'),
  ('ESSOR SEGUROS S.A.'),
  ('EZZE SEGUROS S.A.'),
  ('GENERALI BRASIL SEGUROS S.A.'),
  ('HDI SEGUROS S.A.'),
  ('INDIANA SEGUROS S/A'),
  ('INVESTPREV SEGURADORA S.A.'),
  ('ITAU SEGUROS S/A'),
  ('ITURAN SERVIÇOS LTDA.'),
  ('JUSTOS CONSULTORIA E SERVIÇOS EM S'),
  ('KIRTON SEGUROS S.A.'),
  ('KOVR SEGURADORA'),
  ('MAPFRE SEGUROS GERAIS S/A'),
  ('METLIFE PLANOS ODONTOLOGICOS LTD'),
  ('MITSUI SUMITOMO SEGUROS S/A'),
  ('NOBRE SEGURADORA DO BRASIL S/A'),
  ('NOTRE DAME INTERMÉDICA SAÚDE S/A'),
  ('ODONTOPREV S/A'),
  ('PIER SEGURADORA S.A.'),
  ('PORTO SEGURO CIA DE SEGUROS GERAL'),
  ('RSA SEGUROS'),
  ('SANCOR SEGUROS DO BRASIL S.A.'),
  ('SANTA HELENA'),
  ('SEGUROS SURA BRASIL'),
  ('SOMPO SEGUROS'),
  ('SUHAI SEGUROS S.A.'),
  ('SULAMÉRICA CIA NACIONAL DE SEGUR'),
  ('SURA SEGUROS S/A'),
  ('TOKIO MARINE SEGURADORA S.A.'),
  ('UNIBANCO AIG SEGUROS S/A'),
  ('UNIMED DE GUARULHOS COOPERATIVA'),
  ('UNIMED SEGUROS PATRIMONIAIS S/A'),
  ('UNISAUDE MASTER'),
  ('VR BENEFICIOS E SERVICOS DE PROCESS'),
  ('YASUDA MARITIMA SEGUROS S.A.'),
  ('YASUDA SEGUROS S.A'),
  ('YELUM SEGUROS'),
  ('ZURICH MINAS BRASIL SEGUROS S/A')
)
insert into public.seguradoras (nome, ativo)
select n.nome, true
  from novos n
 where not exists (
   select 1 from public.seguradoras s
    where public.pt_norm(s.nome) = public.pt_norm(n.nome)
 );

-- ─── RLS ─────────────────────────────────────────────────────
alter table public.seguradoras enable row level security;

drop policy if exists "auth_le_seguradoras" on public.seguradoras;
create policy "auth_le_seguradoras" on public.seguradoras
  for select using (auth.role() = 'authenticated');

drop policy if exists "admin_escreve_seguradoras" on public.seguradoras;
create policy "admin_escreve_seguradoras" on public.seguradoras
  for all using (
    exists(select 1 from public.users u
            where u.id = auth.uid() and u.role = 'admin')
  );
