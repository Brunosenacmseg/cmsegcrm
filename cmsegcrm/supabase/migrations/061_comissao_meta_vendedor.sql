-- ─────────────────────────────────────────────────────────────
-- 061_comissao_meta_vendedor.sql
-- Percentuais de comissão por vendedor (cadastrados no funcionário)
-- + cálculo dinâmico no relatório de comissões considerando se a meta
-- mensal foi batida.
-- ─────────────────────────────────────────────────────────────

-- 1) Campos no funcionário
alter table public.rh_funcionarios
  add column if not exists comissao_pct_padrao      numeric(5,2),
  add column if not exists comissao_pct_meta_batida numeric(5,2);

-- 2) Função: vendedor bateu alguma meta no mês?
create or replace function public.meta_batida(p_user_id uuid, p_ano int, p_mes int)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.metas m
    where m.user_id = p_user_id
      and m.status = 'ativa'
      and m.valor_meta > 0
      and m.valor_atual >= m.valor_meta
      and make_date(p_ano, p_mes, 1) between
            date_trunc('month', m.periodo_inicio)::date
        and (date_trunc('month', m.periodo_fim)::date + interval '1 month - 1 day')::date
  );
$$;

-- 3) View do relatório com pct aplicado e valor do vendedor
create or replace view public.vw_comissoes_vendedor as
with base as (
  select
    cr.*,
    case when cr.competencia ~ '^[0-9]{4}-[0-9]{1,2}'
         then split_part(cr.competencia, '-', 1)::int
         else extract(year from coalesce(cr.data_recebimento, cr.created_at))::int
    end as ano_comp,
    case when cr.competencia ~ '^[0-9]{4}-[0-9]{1,2}'
         then split_part(cr.competencia, '-', 2)::int
         else extract(month from coalesce(cr.data_recebimento, cr.created_at))::int
    end as mes_comp
  from public.comissoes_recebidas cr
)
select
  b.id,
  b.cliente_id,
  b.apolice_id,
  b.vendedor_id,
  b.competencia,
  b.valor            as valor_seguradora,
  b.data_recebimento,
  b.parcela,
  b.total_parcelas,
  b.seguradora,
  b.produto,
  b.status,
  b.obs,
  c.nome             as cliente_nome,
  a.numero           as apolice_numero,
  u.nome             as vendedor_nome,
  f.comissao_pct_padrao,
  f.comissao_pct_meta_batida,
  b.ano_comp         as ano_competencia,
  b.mes_comp         as mes_competencia,
  public.meta_batida(b.vendedor_id, b.ano_comp, b.mes_comp) as meta_batida,
  case when public.meta_batida(b.vendedor_id, b.ano_comp, b.mes_comp)
       then coalesce(f.comissao_pct_meta_batida, 0)
       else coalesce(f.comissao_pct_padrao,      0)
  end as pct_aplicado,
  round(
    coalesce(b.valor, 0) *
    case when public.meta_batida(b.vendedor_id, b.ano_comp, b.mes_comp)
         then coalesce(f.comissao_pct_meta_batida, 0)
         else coalesce(f.comissao_pct_padrao,      0)
    end / 100.0,
    2
  ) as valor_vendedor
from base b
left join public.clientes        c on c.id = b.cliente_id
left join public.apolices        a on a.id = b.apolice_id
left join public.users           u on u.id = b.vendedor_id
left join public.rh_funcionarios f on f.user_id = b.vendedor_id;

-- A view herda o RLS da tabela comissoes_recebidas (vendedor vê só o
-- próprio; admin vê todos), então não precisa policy adicional.
