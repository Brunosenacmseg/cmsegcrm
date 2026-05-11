-- ─────────────────────────────────────────────────────────────
-- 103_totais_funil_rpc.sql
-- RPC para agregar contagem e soma de prêmio por status para um
-- funil, respeitando o escopo de vendedores visíveis ao usuário.
--
-- Motivação: o kanban estava carregando TODOS os negócios do funil
-- no client (até 50.000), o que falha em funis grandes (ex.: META
-- com 14k+ leads importados). Agora a página carrega só os cards
-- filtrados por status no servidor e usa esta RPC para os totais
-- do header "Total do funil".
-- ─────────────────────────────────────────────────────────────

create or replace function public.totais_funil(
  p_funil_id     uuid,
  p_vendedor_ids uuid[] default null
)
returns table(
  status        text,
  total         bigint,
  premio_total  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(n.status, 'em_andamento')      as status,
    count(*)                                as total,
    coalesce(sum(n.premio), 0)              as premio_total
  from public.negocios n
  where n.funil_id = p_funil_id
    and (
      p_vendedor_ids is null
      or n.vendedor_id = any (p_vendedor_ids)
    )
  group by coalesce(n.status, 'em_andamento');
$$;

grant execute on function public.totais_funil(uuid, uuid[]) to authenticated, service_role;
