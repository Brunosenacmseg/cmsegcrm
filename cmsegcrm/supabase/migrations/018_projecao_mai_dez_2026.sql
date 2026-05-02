-- ─────────────────────────────────────────────────────────────
-- 018_projecao_mai_dez_2026.sql
-- Projeta despesas FIXAs de abril/2026 pra mai..dez/2026.
-- - data_pgto = NULL (status projetado)
-- - mesmo valor de abril
-- - condicao "X/Y" avança 1 a cada mês (X+delta/Y); para quando X+delta > Y
-- ─────────────────────────────────────────────────────────────

-- Idempotente: apaga projeção anterior
delete from public.financeiro_despesas where origem_import = 'projecao_2026_mai_dez';

insert into public.financeiro_despesas (
  categoria_id, descricao, valor, valor_previsto,
  data, data_vencimento, data_pgto,
  competencia, tipo_despesa, forma_pagto, condicao,
  obs, origem_import
)
select
  d.categoria_id,
  d.descricao,
  d.valor,
  d.valor_previsto,
  -- "data" antiga = mesma data_vencimento projetada (compat)
  (d.data_vencimento + (m.delta || ' months')::interval)::date,
  (d.data_vencimento + (m.delta || ' months')::interval)::date,
  null,                                                     -- data_pgto NULL = projetado
  to_char((d.data_vencimento + (m.delta || ' months')::interval), 'YYYY-MM'),
  d.tipo_despesa,
  d.forma_pagto,
  case
    when d.condicao ~ '^\s*\d+\s*/\s*\d+\s*$' then
      case
        when (split_part(trim(d.condicao),'/',1)::int + m.delta) <= split_part(trim(d.condicao),'/',2)::int
          then lpad((split_part(trim(d.condicao),'/',1)::int + m.delta)::text, 2, '0')
               || '/' || split_part(trim(d.condicao),'/',2)
        else null
      end
    else d.condicao
  end as condicao,
  'Projetado de abril/2026',
  'projecao_2026_mai_dez'
from public.financeiro_despesas d
cross join generate_series(1,8) as m(delta)
where d.competencia = '2026-04'
  and d.tipo_despesa = 'FIXA'
  and d.origem_import = 'dre_2026_jan_abr'
  -- Pula parcelas que já terminariam antes do mês projetado
  and (
    d.condicao !~ '^\s*\d+\s*/\s*\d+\s*$'
    or (split_part(trim(d.condicao),'/',1)::int + m.delta) <= split_part(trim(d.condicao),'/',2)::int
  );
