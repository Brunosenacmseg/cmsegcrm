-- ─────────────────────────────────────────────────────────────
-- 059_backfill_processo_finalizado_e_emitido.sql
-- Refina o backfill da migração 058:
--
--   (a) Adiciona a etapa "PROCESSO FINALIZADO" ao funil
--       EMISSÃO E IMPLANTAÇÃO (mantendo as etapas atuais).
--
--   (b) Negociações no etapa "PROCESSO FINALIZADO" (de qualquer
--       funil de venda/renovação) são TRANSFERIDAS (UPDATE) para
--       o funil EMISSÃO E IMPLANTAÇÃO, mantendo etapa
--       "PROCESSO FINALIZADO" e status atual (geralmente 'ganho').
--
--   (c) Negociações com status='ganho' que NÃO estão em
--       "PROCESSO FINALIZADO" recebem um NOVO card no funil
--       EMISSÃO E IMPLANTAÇÃO na etapa "EMITIDO" (a original
--       permanece no funil de origem). Idempotente.
--
-- Funis ignorados em ambos os fluxos: tipo IN ('cobranca','posVenda')
-- e o próprio EMISSÃO E IMPLANTAÇÃO.
--
-- Antes de aplicar (b)/(c), apaga quaisquer cards criados pela
-- migração 058 (fonte='automacao:backfill_ganho_para_emissao')
-- que ainda estejam pendentes em EMISSÃO E IMPLANTAÇÃO — assim
-- evitamos duplicatas e essa migração é a fonte de verdade do
-- backfill.
-- ─────────────────────────────────────────────────────────────

-- ── (a) Garante a etapa "PROCESSO FINALIZADO" no funil destino ──
do $$
declare
  v_funil_id uuid;
  v_etapas   text[];
begin
  select id, etapas into v_funil_id, v_etapas
    from public.funis
   where public.pt_norm(nome) = public.pt_norm('EMISSÃO E IMPLANTAÇÃO')
   limit 1;

  if v_funil_id is null then
    raise notice 'Funil EMISSÃO E IMPLANTAÇÃO não encontrado.';
    return;
  end if;

  if not (
    select bool_or(public.pt_norm(e) = public.pt_norm('PROCESSO FINALIZADO'))
      from unnest(coalesce(v_etapas, '{}'::text[])) e
  ) then
    update public.funis
       set etapas = coalesce(etapas, '{}'::text[]) || array['PROCESSO FINALIZADO']
     where id = v_funil_id;
    raise notice 'Etapa PROCESSO FINALIZADO adicionada ao funil EMISSÃO E IMPLANTAÇÃO.';
  end if;
end$$;

-- ── Limpa eventuais backfill cards anteriores (058) ─────────────
delete from public.negocios
 where fonte = 'automacao:backfill_ganho_para_emissao'
   and obs like 'origem_negocio:%backfill%';

-- ── (b) MOVE negócios em PROCESSO FINALIZADO ────────────────────
do $$
declare
  v_funil_emissao_id uuid;
  v_count_move       int := 0;
  v_count_new        int := 0;
  v_lider_id         uuid;
  v_equipe_id        uuid;
begin
  select id into v_funil_emissao_id
    from public.funis
   where public.pt_norm(nome) = public.pt_norm('EMISSÃO E IMPLANTAÇÃO')
   limit 1;
  if v_funil_emissao_id is null then return; end if;

  -- Líder e equipe Pós-venda
  select id, lider_id into v_equipe_id, v_lider_id
    from public.equipes
   where public.pt_norm(nome) like '%' || public.pt_norm('pos venda') || '%'
      or public.pt_norm(nome) like '%' || public.pt_norm('posvenda') || '%'
   order by criado_em
   limit 1;

  -- (b) MOVE — UPDATE funil_id pra EMISSÃO mantendo etapa PROCESSO FINALIZADO
  update public.negocios n
     set funil_id = v_funil_emissao_id,
         etapa    = 'PROCESSO FINALIZADO',
         obs      = coalesce(obs,'')
                    || case when length(coalesce(obs,'')) > 0 then ' | ' else '' end
                    || 'movido_de_funil:' || (select nome from public.funis where id = n.funil_id)
                    || ' (backfill: PROCESSO FINALIZADO → EMISSÃO E IMPLANTAÇÃO)',
         updated_at = now()
    from public.funis f
   where f.id = n.funil_id
     and f.tipo not in ('cobranca','posVenda')
     and f.id <> v_funil_emissao_id
     and public.pt_norm(n.etapa) = public.pt_norm('PROCESSO FINALIZADO');
  get diagnostics v_count_move = row_count;
  raise notice 'MOVE: % negócios em PROCESSO FINALIZADO transferidos para EMISSÃO E IMPLANTAÇÃO.', v_count_move;

  -- (c) NOVO CARD em "EMITIDO" para ganhos fora de PROCESSO FINALIZADO
  insert into public.negocios (
    cliente_id, funil_id, etapa, titulo,
    produto, seguradora, premio, comissao_pct,
    placa, cpf_cnpj, cep, fonte, vencimento,
    vendedor_id, equipe_id, obs, status
  )
  select
    n.cliente_id, v_funil_emissao_id, 'EMITIDO',
    coalesce(n.titulo, 'Pós-venda'),
    n.produto, n.seguradora, n.premio, n.comissao_pct,
    n.placa, n.cpf_cnpj, n.cep,
    'automacao:backfill_ganho_para_emissao',
    n.vencimento,
    v_lider_id, v_equipe_id,
    'origem_negocio:' || n.id::text
      || ' | origem_funil:' || coalesce(f.nome,'-')
      || ' | gerado por backfill (ganho fora de PROCESSO FINALIZADO)',
    'em_andamento'
  from public.negocios n
  join public.funis f on f.id = n.funil_id
  where n.status = 'ganho'
    and f.tipo not in ('cobranca','posVenda')
    and f.id <> v_funil_emissao_id
    and public.pt_norm(coalesce(n.etapa,'')) <> public.pt_norm('PROCESSO FINALIZADO')
    and not exists (
      select 1 from public.negocios e
       where e.funil_id = v_funil_emissao_id
         and e.cliente_id = n.cliente_id
         and e.obs like '%origem_negocio:' || n.id::text || '%'
    );
  get diagnostics v_count_new = row_count;
  raise notice 'NEW: % cards criados em EMISSÃO E IMPLANTAÇÃO / EMITIDO.', v_count_new;
end$$;
