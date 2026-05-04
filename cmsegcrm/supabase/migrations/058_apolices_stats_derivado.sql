-- Migration 058: status derivado por data em apolices_stats
-- Cancelado vem do campo status; ativo/renovar/vencido sao calculados
-- a partir de vigencia_fim:
--  - cancelado: status = 'cancelado'
--  - vencido:   vigencia_fim < hoje
--  - renovar:   vigencia_fim entre hoje e hoje+30d
--  - ativo:     vigencia_fim > hoje+30d

create or replace function public.apolices_stats(
  p_status      text default null,
  p_seguradora  text default null,
  p_ramo        text default null,
  p_vendedor_id uuid default null,
  p_busca       text default null
) returns table (
  total          bigint,
  premio_total   numeric,
  comissao_total numeric,
  vencendo_30d   bigint
) language sql stable security definer as $$
  with base as (
    select a.id, a.premio, a.comissao_pct, a.vigencia_fim, a.status
    from public.apolices a
    left join public.clientes c on c.id = a.cliente_id
    where (
        p_status is null
        or (p_status = 'cancelado' and a.status = 'cancelado')
        or (p_status = 'vencido'   and coalesce(a.status,'') <> 'cancelado' and a.vigencia_fim <  current_date)
        or (p_status = 'renovar'   and coalesce(a.status,'') <> 'cancelado' and a.vigencia_fim >= current_date and a.vigencia_fim <= current_date + 30)
        or (p_status = 'ativo'     and coalesce(a.status,'') <> 'cancelado' and a.vigencia_fim >  current_date + 30)
      )
      and (p_seguradora is null or a.seguradora = p_seguradora)
      and (p_ramo       is null or a.produto    ilike p_ramo || '%')
      and (
        p_vendedor_id is null
        or a.vendedor_id = p_vendedor_id
        or (p_vendedor_id = '00000000-0000-0000-0000-000000000000'::uuid and a.vendedor_id is null)
      )
      and (
        p_busca is null
        or coalesce(c.nome,'')      ilike '%' || p_busca || '%'
        or coalesce(a.produto,'')   ilike '%' || p_busca || '%'
        or coalesce(a.seguradora,'')ilike '%' || p_busca || '%'
      )
  )
  select
    count(*)                               as total,
    coalesce(sum(premio), 0)               as premio_total,
    coalesce(sum(premio * comissao_pct / 100.0), 0) as comissao_total,
    count(*) filter (
      where vigencia_fim >= current_date and vigencia_fim <= current_date + 30
        and coalesce(status,'') <> 'cancelado'
    )                                      as vencendo_30d
  from base;
$$;

grant execute on function public.apolices_stats(text, text, text, uuid, text) to authenticated;
