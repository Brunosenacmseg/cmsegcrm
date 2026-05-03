-- ─────────────────────────────────────────────────────────────
-- 058_backfill_ganho_e_limpeza_rd.sql
-- (1) Backfill: para todo negócio já marcado como ganho em qualquer
--     funil exceto cobrança / pósVenda / EMISSÃO E IMPLANTAÇÃO,
--     cria um card no funil EMISSÃO E IMPLANTAÇÃO (idempotente).
-- (2) Limpeza: remove negócios em "RD: Importados" cujo cliente foi
--     criado por importação de seguradora (fonte 'import:%') e que
--     não têm apólice nem prêmio — esses são duplicatas indevidas
--     geradas pelo RD Sync ao bater clientes recém-criados.
-- ─────────────────────────────────────────────────────────────

-- ── (1) BACKFILL ─────────────────────────────────────────────
do $$
declare
  v_funil_emissao_id uuid;
  v_etapa_inicial    text;
  v_lider_id         uuid;
  v_equipe_id        uuid;
  v_count            int := 0;
begin
  -- Funil destino
  select id, coalesce(etapas[1], 'AGUARDANDO EMISSÃO')
    into v_funil_emissao_id, v_etapa_inicial
    from public.funis
   where public.pt_norm(nome) = public.pt_norm('EMISSÃO E IMPLANTAÇÃO')
   limit 1;

  if v_funil_emissao_id is null then
    raise notice 'Funil EMISSÃO E IMPLANTAÇÃO não encontrado — backfill abortado.';
    return;
  end if;

  -- Equipe Pós-venda (líder vira vendedor)
  select id, lider_id into v_equipe_id, v_lider_id
    from public.equipes
   where public.pt_norm(nome) like '%' || public.pt_norm('pos venda') || '%'
      or public.pt_norm(nome) like '%' || public.pt_norm('posvenda') || '%'
   order by criado_em
   limit 1;

  insert into public.negocios (
    cliente_id, funil_id, etapa, titulo,
    produto, seguradora, premio, comissao_pct,
    placa, cpf_cnpj, cep, fonte, vencimento,
    vendedor_id, equipe_id, obs, status
  )
  select
    n.cliente_id, v_funil_emissao_id, v_etapa_inicial,
    coalesce(n.titulo, 'Pós-venda'),
    n.produto, n.seguradora, n.premio, n.comissao_pct,
    n.placa, n.cpf_cnpj, n.cep,
    'automacao:backfill_ganho_para_emissao',
    n.vencimento,
    v_lider_id, v_equipe_id,
    'origem_negocio:' || n.id::text
      || ' | origem_funil:' || coalesce(f.nome,'-')
      || ' | gerado por backfill (negócio já estava como ganho)',
    'em_andamento'
  from public.negocios n
  join public.funis f on f.id = n.funil_id
  where n.status = 'ganho'
    and f.tipo not in ('cobranca','posVenda')
    and f.id <> v_funil_emissao_id
    -- Não duplica: se já existe um negócio em EMISSÃO marcado como
    -- vindo deste negócio, pula
    and not exists (
      select 1 from public.negocios e
       where e.funil_id = v_funil_emissao_id
         and e.cliente_id = n.cliente_id
         and e.obs like '%origem_negocio:' || n.id::text || '%'
    );

  get diagnostics v_count = row_count;
  raise notice 'Backfill criou % cards em EMISSÃO E IMPLANTAÇÃO.', v_count;
end$$;

-- ── (2) LIMPEZA RD: Importados ───────────────────────────────
-- Remove negócios fantasmas criados pelo RD Sync para clientes que vieram
-- de importação de seguradora (fonte 'import:<seguradora>') e que ficaram
-- sem apólice e sem prêmio (sinal claro de duplicata gerada por bater
-- contato no RD com cliente recém-criado pela importação).
do $$
declare
  v_funil_rd_id uuid;
  v_count       int := 0;
begin
  select id into v_funil_rd_id
    from public.funis where nome = 'RD: Importados' limit 1;

  if v_funil_rd_id is null then
    raise notice 'Funil "RD: Importados" não existe — nada a limpar.';
    return;
  end if;

  delete from public.negocios n
   using public.clientes c
   where n.funil_id = v_funil_rd_id
     and n.cliente_id = c.id
     and c.fonte like 'import:%'
     and (n.apolice_id is null)
     and coalesce(n.premio, 0) = 0;

  get diagnostics v_count = row_count;
  raise notice 'Removidos % negócios fantasmas de RD: Importados.', v_count;
end$$;
