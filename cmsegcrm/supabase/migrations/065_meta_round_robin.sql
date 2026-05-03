-- ─────────────────────────────────────────────────────────────
-- 065_meta_round_robin.sql
-- Distribuição sequencial (round-robin) de leads do Meta entre
-- múltiplos vendedores. Cada formulário pode ter uma lista
-- vendedor_ids; o webhook chama meta_proximo_vendedor() que
-- atomicamente avança o ponteiro e devolve o próximo vendedor.
-- ─────────────────────────────────────────────────────────────

alter table public.meta_form_mapeamento
  add column if not exists vendedor_ids uuid[] not null default '{}'::uuid[],
  add column if not exists proximo_vendedor_idx int not null default 0;

-- Função: avança o ponteiro e retorna o próximo vendedor.
-- Atômica via UPDATE..RETURNING (nenhum lock manual necessário).
create or replace function public.meta_proximo_vendedor(p_form_id text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_ids uuid[];
  v_idx int;
  v_chosen uuid;
begin
  update public.meta_form_mapeamento
     set proximo_vendedor_idx = proximo_vendedor_idx + 1
   where form_id = p_form_id
   returning vendedor_ids,
            (case when cardinality(vendedor_ids) > 0
                  then (proximo_vendedor_idx - 1) % cardinality(vendedor_ids)
                  else 0 end)
     into v_ids, v_idx;

  if v_ids is null or cardinality(v_ids) = 0 then
    return null;
  end if;
  v_chosen := v_ids[v_idx + 1]; -- arrays no Postgres são 1-indexed
  return v_chosen;
end;
$$;
