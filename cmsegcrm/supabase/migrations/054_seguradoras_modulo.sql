-- ─────────────────────────────────────────────────────────────
-- 054_seguradoras_modulo.sql
-- Garante que as seguradoras informadas pelo módulo "Seguradoras"
-- existam e estejam ativas. Idempotente: usa pt_norm() para evitar
-- duplicidade por acento/caixa.
-- ─────────────────────────────────────────────────────────────

with novos(nome) as (values
  ('AKAD SEGUROS S.A.'),
  ('ALIRO SEGURO'),
  ('ALLIANZ SEGUROS S.A.'),
  ('ALLSEG'),
  ('AZOS SEGUROS'),
  ('BEM PROTEGE SEGUROS.'),
  ('BRADESCO SEGUROS S.A'),
  ('CAIXA SEGURADORA S/A'),
  ('COMPANHIA EXCELSIOR DE SEGUROS'),
  ('DARWIN SEGUROS S.A'),
  ('ECCOUNT S/A'),
  ('ESSOR SEGUROS S.A.'),
  ('EZZE SEGUROS S.A.'),
  ('HDI SEGUROS S.A.'),
  ('JUSTOS CONSULTORIA E SERVIÇOS EM S'),
  ('KOVR SEGURADORA'),
  ('MAPFRE SEGUROS GERAIS S/A'),
  ('METLIFE PLANOS ODONTOLOGICOS LTD'),
  ('PIER SEGURADORA S.A.'),
  ('PORTO SEGURO CIA DE SEGUROS GERAL'),
  ('SANCOR SEGUROS DO BRASIL S.A.'),
  ('SEGUROS SURA BRASIL'),
  ('SOMBRERO SEGURADORA'),
  ('SUHAI SEGUROS S.A.'),
  ('SULAMÉRICA CIA NACIONAL DE SEGUR'),
  ('SURA SEGUROS S/A'),
  ('TOKIO MARINE SEGURADORA S.A.'),
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
