-- Distribuição sequencial (round-robin) de responsáveis no webhook de entrada.
-- Permite informar uma lista de responsaveis_ids e rotacionar entre eles a cada lead recebido.

alter table public.integracoes_webhooks_in
  add column if not exists responsaveis_ids uuid[] not null default array[]::uuid[],
  add column if not exists responsavel_modo text not null default 'fixo'
    check (responsavel_modo in ('fixo','sequencial')),
  add column if not exists responsavel_proximo_idx int not null default 0;

-- RPC atômico: retorna o próximo responsavel_id da fila e avança o índice.
-- SELECT ... FOR UPDATE serializa chamadas concorrentes para o mesmo webhook.
create or replace function public.integrador_next_responsavel(p_webhook_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_idx int;
  v_len int;
  v_chosen uuid;
begin
  select responsaveis_ids, responsavel_proximo_idx
    into v_ids, v_idx
    from public.integracoes_webhooks_in
   where id = p_webhook_id
   for update;

  v_len := coalesce(array_length(v_ids, 1), 0);
  if v_len = 0 then
    return null;
  end if;

  v_idx := v_idx % v_len;
  v_chosen := v_ids[v_idx + 1]; -- arrays em postgres são 1-based

  update public.integracoes_webhooks_in
     set responsavel_proximo_idx = (v_idx + 1) % v_len
   where id = p_webhook_id;

  return v_chosen;
end;
$$;
