-- ─────────────────────────────────────────────────────────────
-- 057_automacao_ganho_posvenda.sql
-- Quando uma negociação for marcada como "ganho" em qualquer funil
-- (exceto Cobrança, Pós-venda/Sinistro e a própria Emissão e Implantação),
-- cria automaticamente uma nova negociação no funil EMISSÃO E IMPLANTAÇÃO,
-- atribuída ao líder da equipe Pós-venda, copiando os dados principais.
-- ─────────────────────────────────────────────────────────────

create or replace function public.fn_automacao_ganho_para_emissao()
returns trigger
language plpgsql
security definer
as $$
declare
  v_source_funil   record;
  v_target_funil   record;
  v_etapa_inicial  text;
  v_lider_id       uuid;
  v_novo_id        uuid;
begin
  -- Só age quando status virou 'ganho' (e antes não era)
  if new.status is distinct from 'ganho' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'ganho' then
    return new;
  end if;

  -- Carrega o funil de origem
  select id, nome, tipo into v_source_funil
    from public.funis
   where id = new.funil_id;
  if not found then
    return new;
  end if;

  -- Exclui funis que não devem disparar a automação
  if v_source_funil.tipo in ('cobranca','posVenda') then
    return new;
  end if;
  if public.pt_norm(v_source_funil.nome) = public.pt_norm('EMISSÃO E IMPLANTAÇÃO') then
    return new;
  end if;

  -- Localiza o funil de destino
  select id, etapas into v_target_funil
    from public.funis
   where public.pt_norm(nome) = public.pt_norm('EMISSÃO E IMPLANTAÇÃO')
   limit 1;
  if not found then
    return new;
  end if;

  v_etapa_inicial := coalesce(v_target_funil.etapas[1], 'AGUARDANDO EMISSÃO');

  -- Localiza líder da equipe Pós-venda
  select e.lider_id into v_lider_id
    from public.equipes e
   where public.pt_norm(e.nome) like '%' || public.pt_norm('pos venda') || '%'
      or public.pt_norm(e.nome) like '%' || public.pt_norm('posvenda') || '%'
   order by e.criado_em
   limit 1;

  -- Evita duplicar: se já existe negócio aberto desse cliente neste funil
  -- referenciando o negócio de origem, não cria de novo.
  if exists (
    select 1 from public.negocios
     where funil_id = v_target_funil.id
       and cliente_id = new.cliente_id
       and obs like '%origem_negocio:' || new.id::text || '%'
  ) then
    return new;
  end if;

  insert into public.negocios (
    cliente_id, funil_id, etapa, titulo,
    produto, seguradora, premio, comissao_pct,
    placa, cpf_cnpj, cep, fonte, vencimento,
    vendedor_id, obs, status
  ) values (
    new.cliente_id, v_target_funil.id, v_etapa_inicial,
    coalesce(new.titulo, 'Pós-venda'),
    new.produto, new.seguradora, new.premio, new.comissao_pct,
    new.placa, new.cpf_cnpj, new.cep,
    'automacao:ganho_para_emissao',
    new.vencimento,
    v_lider_id,
    'origem_negocio:' || new.id::text
      || ' | origem_funil:' || coalesce(v_source_funil.nome,'-')
      || ' | gerado por automação ao marcar ganho',
    'em_andamento'
  )
  returning id into v_novo_id;

  -- Histórico no cliente
  insert into public.historico (cliente_id, negocio_id, tipo, titulo, descricao)
  values (
    new.cliente_id, v_novo_id, 'teal',
    'Automação: novo card em Emissão e Implantação',
    'Negócio "' || coalesce(new.titulo,'(sem título)')
      || '" do funil ' || coalesce(v_source_funil.nome,'-')
      || ' foi marcado como GANHO. Card criado em EMISSÃO E IMPLANTAÇÃO'
      || coalesce(' atribuído ao líder da equipe Pós-venda.', '.')
  );

  return new;
exception when others then
  -- Em caso de erro na automação, NÃO bloqueia a atualização do negócio.
  raise warning 'fn_automacao_ganho_para_emissao falhou: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_automacao_ganho_para_emissao_ins on public.negocios;
drop trigger if exists trg_automacao_ganho_para_emissao_upd on public.negocios;

create trigger trg_automacao_ganho_para_emissao_upd
  after update of status on public.negocios
  for each row
  when (new.status = 'ganho' and (old.status is null or old.status <> 'ganho'))
  execute function public.fn_automacao_ganho_para_emissao();

create trigger trg_automacao_ganho_para_emissao_ins
  after insert on public.negocios
  for each row
  when (new.status = 'ganho')
  execute function public.fn_automacao_ganho_para_emissao();
