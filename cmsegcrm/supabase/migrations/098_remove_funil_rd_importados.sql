-- ─────────────────────────────────────────────────────────────
-- 098_remove_funil_rd_importados.sql
-- Remove o funil "RD: Importados" e todos os cards dentro dele.
-- Esse funil era usado como fallback do RD Sync e foi descontinuado:
-- o sync agora descarta deals cujo pipeline não bate com nenhum funil
-- local (em vez de despejar tudo nesse "lixão").
-- ─────────────────────────────────────────────────────────────
do $$
declare
  v_funil_id uuid;
  v_count    int := 0;
begin
  select id into v_funil_id
    from public.funis where nome = 'RD: Importados' limit 1;

  if v_funil_id is null then
    raise notice 'Funil "RD: Importados" não existe — nada a fazer.';
    return;
  end if;

  delete from public.negocios where funil_id = v_funil_id;
  get diagnostics v_count = row_count;
  raise notice 'Apagados % negócios do funil RD: Importados.', v_count;

  delete from public.funis_equipes where funil_id = v_funil_id;
  delete from public.funis where id = v_funil_id;
  raise notice 'Funil "RD: Importados" excluído.';
end$$;
