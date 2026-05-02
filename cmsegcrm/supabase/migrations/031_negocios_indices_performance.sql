-- Indices essenciais pra que com 76k+ negocios as queries do funil/dashboard
-- nao quebrem com timeout (HTTP 500 do PostgREST). Sem isso, o select-by-funil
-- caia em sequential scan rodando RLS em cada linha.

create index if not exists idx_negocios_funil_id     on public.negocios(funil_id);
create index if not exists idx_negocios_vendedor_id  on public.negocios(vendedor_id);
create index if not exists idx_negocios_cliente_id   on public.negocios(cliente_id);
create index if not exists idx_negocios_created_at   on public.negocios(created_at desc);
create index if not exists idx_negocios_funil_etapa  on public.negocios(funil_id, etapa);

analyze public.negocios;
