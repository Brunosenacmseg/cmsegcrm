-- ─────────────────────────────────────────────────────────────
-- 075_seg_stage_propostas_completar.sql
-- Estende a tabela `seg_stage_propostas` (criada na migration 072 do main com
-- campos básicos) com TODAS as colunas extraídas pelos parsers de PDF de
-- proposta das 16 seguradoras. Também cria a tabela `propostas` (produção).
--
-- Cada `add column` vai isolado num DO block c/ EXCEPTION pra não derrubar
-- a transação se algum conflito pontual ocorrer.
-- ─────────────────────────────────────────────────────────────

-- 1. Tabela de produção `propostas` (cria se não existir) ─────────
do $$
declare v_kind char;
begin
  select c.relkind into v_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'propostas';
  if v_kind = 'v' then
    execute 'alter view public.propostas rename to propostas_legacy_view';
  end if;
exception when others then null;
end $$;

create table if not exists public.propostas (
  id              uuid primary key default uuid_generate_v4(),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

do $$ begin alter table public.propostas add column if not exists numero            text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists proposta_endosso  text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists nome_segurado     text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists cpf_cnpj_segurado text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists seguradora        text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists ramo              text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists produto           text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists vigencia_ini      date; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists vigencia_fim      date; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists emissao           date; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists data_validade     date; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists premio            numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists premio_liquido    numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists iof               numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists premio_total      numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists qtd_parcelas      int; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists forma_pagamento   text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists status            text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists status_assinatura text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists proposta_assinada boolean default false; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists placa             text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists observacao        text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists fonte             text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists arquivo_url       text; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists cliente_id        uuid; exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists apolice_id        uuid; exception when others then null; end $$;

do $$ begin
  alter table public.propostas
    add constraint propostas_cliente_id_fkey
    foreign key (cliente_id) references public.clientes(id) on delete set null;
exception when others then null; end $$;
do $$ begin
  alter table public.propostas
    add constraint propostas_apolice_id_fkey
    foreign key (apolice_id) references public.apolices(id) on delete set null;
exception when others then null; end $$;

do $$ begin
  update public.propostas
     set status = 'em_analise'
   where status is null
      or status not in ('em_analise','aceita','recusada','expirada','convertida','cancelada');
exception when others then null; end $$;
do $$ begin alter table public.propostas alter column status set default 'em_analise'; exception when others then null; end $$;
do $$ begin
  alter table public.propostas drop constraint if exists propostas_status_check;
  alter table public.propostas add constraint propostas_status_check
    check (status in ('em_analise','aceita','recusada','expirada','convertida','cancelada'));
exception when others then null; end $$;

do $$ begin create index if not exists idx_propostas_cliente  on public.propostas(cliente_id); exception when others then null; end $$;
do $$ begin create index if not exists idx_propostas_numero   on public.propostas(numero);     exception when others then null; end $$;
do $$ begin create index if not exists idx_propostas_status   on public.propostas(status);     exception when others then null; end $$;
do $$ begin create index if not exists idx_propostas_seg      on public.propostas(seguradora); exception when others then null; end $$;
do $$ begin create index if not exists idx_propostas_validade on public.propostas(data_validade) where data_validade is not null; exception when others then null; end $$;

do $$ begin alter table public.propostas enable row level security; exception when others then null; end $$;
do $$ begin
  create policy propostas_select on public.propostas
    for select to authenticated using (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','financeiro','vendedor','sdr'))
    );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy propostas_admin_write on public.propostas
    for all to authenticated using (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','financeiro','vendedor'))
    ) with check (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','financeiro','vendedor'))
    );
exception when duplicate_object then null; end $$;

-- 2. Estende seg_stage_propostas (criada na migration 072 do main) ─────
-- Cada coluna isolada para conviver com qualquer schema pré-existente.
do $$ begin alter table public.seg_stage_propostas add column if not exists numero                    text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists data_validade             date; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists data_calculo              date; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists versao                    text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists rule_id                   text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists ramo_codigo               text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists ramo_descricao            text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists tipo_seguro               text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists classe_bonus              int; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists codigo_ci                 text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists status_proposta           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists numero_cotacao            text; exception when others then null; end $$;
-- Segurado
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_nome_social      text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_email            text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_telefone         text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_telefone2        text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_cep              text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_endereco         text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_numero           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_complemento      text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_bairro           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_cidade           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_uf               text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_estado_civil     text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists data_nascimento           date; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists sexo                      text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_doc_identidade   text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_doc_orgao_exp    text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_doc_data_exp     date; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_naturalidade     text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_nacionalidade    text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_profissao        text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_renda            numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists segurado_pais_nascimento  text; exception when others then null; end $$;
-- Condutor
do $$ begin alter table public.seg_stage_propostas add column if not exists condutor_nome             text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists condutor_cpf              text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists condutor_data_nasc        date; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists condutor_idade            int; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists condutor_sexo             text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists condutor_estado_civil     text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists condutor_vinculo          text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists condutor_cobertura_jovem  text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists tipo_residencia           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists residentes_18_24          text; exception when others then null; end $$;
-- Veículo
do $$ begin alter table public.seg_stage_propostas add column if not exists marca                     text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists modelo                    text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists ano_fabricacao            text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists ano_modelo                text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists chassi                    text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists chassi_remarcado          text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists cod_fipe                  text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists combustivel               text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists cor                       text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists renavam                   text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists zero_km                   text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists blindagem                 text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists kit_gas                   text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists cambio_automatico         text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists pcd                       text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists isento_fiscal             text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists nr_portas                 int; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists lotacao                   int; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists tipo_utilizacao           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists categoria_tarifaria       text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists cep_pernoite              text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists cep_circulacao            text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists pernoite_garagem          text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists utilizacao_veiculo        text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists dispositivo_antifurto     text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists rastreador                text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists acessorios                text; exception when others then null; end $$;
-- Coberturas (jsonb)
do $$ begin alter table public.seg_stage_propostas add column if not exists coberturas                jsonb; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists coberturas_adicionais     jsonb; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists franquias                 jsonb; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists servicos                  jsonb; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists assistencias              jsonb; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists clausulas                 jsonb; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists descontos_aplicados       jsonb; exception when others then null; end $$;
-- Prêmio
do $$ begin alter table public.seg_stage_propostas add column if not exists premio_liquido            numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists premio_auto               numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists premio_rcf                numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists premio_rcv                numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists premio_app                numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists premio_acessorios         numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists premio_blindagem          numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists premio_kit_gas            numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists encargos                  numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists custo_apolice             numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists adicional_fracionamento   numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists iof                       numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists juros                     numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists taxa_juros                numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists descontos                 numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists premio_total              numeric(14,2); exception when others then null; end $$;
-- Pagamento
do $$ begin alter table public.seg_stage_propostas add column if not exists forma_pagamento           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists qtd_parcelas              int; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists valor_parcela             numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists valor_primeira_parcela    numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists valor_demais_parcelas     numeric(14,2); exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists cartao_mascarado          text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists bandeira_cartao           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists validade_cartao           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists titular_cartao            text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists cpf_titular_pagto         text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists banco_pagto               text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists agencia_pagto             text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists conta_pagto               text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists dia_vencimento            int; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists parcelas                  jsonb; exception when others then null; end $$;
-- Histórico anterior
do $$ begin alter table public.seg_stage_propostas add column if not exists seguradora_anterior       text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists apolice_anterior          text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists fim_vigencia_anterior     date; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists sinistro_ult_vigencia     text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists bonus_unico               text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists renovacao_seguradora      text; exception when others then null; end $$;
-- Corretor
do $$ begin alter table public.seg_stage_propostas add column if not exists corretor_cnpj             text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists corretor_codigo           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists corretor_email            text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists corretor_telefone         text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists corretor_endereco         text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists corretor_filial           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists corretor_inspetoria       text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists corretor_participacao     numeric(8,4); exception when others then null; end $$;
-- Sucursal / seguradora
do $$ begin alter table public.seg_stage_propostas add column if not exists sucursal_codigo           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists sucursal_nome             text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists processo_susep            text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists congenere                 text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists tipo_operacao             text; exception when others then null; end $$;
-- Universais / debug
do $$ begin alter table public.seg_stage_propostas add column if not exists seguradora_origem         text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists layout_pdf                text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists pdf_texto_bruto           text; exception when others then null; end $$;
do $$ begin alter table public.seg_stage_propostas add column if not exists proposta_id               uuid; exception when others then null; end $$;
do $$ begin
  alter table public.seg_stage_propostas
    add constraint seg_stage_propostas_proposta_id_fkey
    foreign key (proposta_id) references public.propostas(id) on delete set null;
exception when others then null; end $$;

do $$ begin create index if not exists idx_seg_stage_prop_cpf on public.seg_stage_propostas(cpf_cnpj); exception when others then null; end $$;
