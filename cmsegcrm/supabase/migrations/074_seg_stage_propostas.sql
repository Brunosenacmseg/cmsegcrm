-- ─────────────────────────────────────────────────────────────
-- 074_seg_stage_propostas.sql  (v3 — ultra-defensiva)
-- Cria seg_stage_propostas + completa/cria a tabela propostas (produção).
-- Cada ALTER vai isolado num DO block c/ EXCEPTION pra não derrubar
-- toda a transação se uma coluna específica conflitar (ex: tabela ou view
-- pré-existente com schema incompatível).
-- ─────────────────────────────────────────────────────────────

-- 1. Estende o check de tipo em seg_importacoes ───────────────────
do $$
begin
  alter table public.seg_importacoes drop constraint if exists seg_importacoes_tipo_check;
  alter table public.seg_importacoes add constraint seg_importacoes_tipo_check
    check (tipo in ('apolices','sinistros','inadimplencia','comissoes','propostas'));
exception when others then null;
end $$;

-- 2. Tabela de produção `propostas` ──────────────────────────────
-- Se já existir como VIEW (não tabela), renomeia ela como `propostas_legacy`
-- pra liberar o nome.
do $$
declare
  v_kind char;
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

-- Cria tabela mínima (se não existir)
create table if not exists public.propostas (
  id              uuid primary key default uuid_generate_v4(),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 3. Adiciona cada coluna isoladamente (DO block por coluna) ──────
-- Assim se uma falhar, as outras continuam.
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
do $$ begin alter table public.propostas add column if not exists created_at        timestamptz default now(); exception when others then null; end $$;
do $$ begin alter table public.propostas add column if not exists updated_at        timestamptz default now(); exception when others then null; end $$;

-- FKs separadas (podem falhar se cliente/apolice já estiver referenciada)
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

-- 4. Backfill + check em status ──────────────────────────────────
do $$
begin
  update public.propostas
     set status = 'em_analise'
   where status is null
      or status not in ('em_analise','aceita','recusada','expirada','convertida','cancelada');
exception when others then null;
end $$;
do $$ begin
  alter table public.propostas alter column status set default 'em_analise';
exception when others then null; end $$;
do $$ begin
  alter table public.propostas drop constraint if exists propostas_status_check;
  alter table public.propostas add constraint propostas_status_check
    check (status in ('em_analise','aceita','recusada','expirada','convertida','cancelada'));
exception when others then null; end $$;

-- 5. Índices ─────────────────────────────────────────────────────
do $$ begin create index if not exists idx_propostas_cliente  on public.propostas(cliente_id); exception when others then null; end $$;
do $$ begin create index if not exists idx_propostas_numero   on public.propostas(numero);     exception when others then null; end $$;
do $$ begin create index if not exists idx_propostas_status   on public.propostas(status);     exception when others then null; end $$;
do $$ begin create index if not exists idx_propostas_seg      on public.propostas(seguradora); exception when others then null; end $$;
do $$ begin create index if not exists idx_propostas_validade on public.propostas(data_validade) where data_validade is not null; exception when others then null; end $$;

-- 6. Tabela de staging ────────────────────────────────────────────
create table if not exists public.seg_stage_propostas (
  id              uuid primary key default uuid_generate_v4(),
  seguradora_id   uuid not null references public.seguradoras(id) on delete cascade,
  importacao_id   uuid references public.seg_importacoes(id) on delete set null,
  numero                    text,
  data_emissao              date,
  vigencia_ini              date,
  vigencia_fim              date,
  data_validade             date,
  data_calculo              date,
  versao                    text,
  rule_id                   text,
  produto                   text,
  ramo_codigo               text,
  ramo_descricao            text,
  tipo_seguro               text,
  classe_bonus              int,
  codigo_ci                 text,
  status_proposta           text,
  numero_cotacao            text,
  cliente_nome              text,
  cpf_cnpj                  text,
  segurado_nome_social      text,
  segurado_email            text,
  segurado_telefone         text,
  segurado_telefone2        text,
  segurado_cep              text,
  segurado_endereco         text,
  segurado_numero           text,
  segurado_complemento      text,
  segurado_bairro           text,
  segurado_cidade           text,
  segurado_uf               text,
  segurado_estado_civil     text,
  data_nascimento           date,
  sexo                      text,
  segurado_doc_identidade   text,
  segurado_doc_orgao_exp    text,
  segurado_doc_data_exp     date,
  segurado_naturalidade     text,
  segurado_nacionalidade    text,
  segurado_profissao        text,
  segurado_renda            numeric(14,2),
  segurado_pais_nascimento  text,
  condutor_nome             text,
  condutor_cpf              text,
  condutor_data_nasc        date,
  condutor_idade            int,
  condutor_sexo             text,
  condutor_estado_civil     text,
  condutor_vinculo          text,
  condutor_cobertura_jovem  text,
  tipo_residencia           text,
  residentes_18_24          text,
  marca                     text,
  modelo                    text,
  ano_fabricacao            text,
  ano_modelo                text,
  placa                     text,
  chassi                    text,
  chassi_remarcado          text,
  cod_fipe                  text,
  combustivel               text,
  cor                       text,
  renavam                   text,
  zero_km                   text,
  blindagem                 text,
  kit_gas                   text,
  cambio_automatico         text,
  pcd                       text,
  isento_fiscal             text,
  nr_portas                 int,
  lotacao                   int,
  tipo_utilizacao           text,
  categoria_tarifaria       text,
  cep_pernoite              text,
  cep_circulacao            text,
  pernoite_garagem          text,
  utilizacao_veiculo        text,
  dispositivo_antifurto     text,
  rastreador                text,
  acessorios                text,
  coberturas                jsonb,
  coberturas_adicionais     jsonb,
  franquias                 jsonb,
  servicos                  jsonb,
  assistencias              jsonb,
  clausulas                 jsonb,
  descontos_aplicados       jsonb,
  premio_liquido            numeric(14,2),
  premio_auto               numeric(14,2),
  premio_rcf                numeric(14,2),
  premio_rcv                numeric(14,2),
  premio_app                numeric(14,2),
  premio_acessorios         numeric(14,2),
  premio_blindagem          numeric(14,2),
  premio_kit_gas            numeric(14,2),
  encargos                  numeric(14,2),
  custo_apolice             numeric(14,2),
  adicional_fracionamento   numeric(14,2),
  iof                       numeric(14,2),
  juros                     numeric(14,2),
  taxa_juros                numeric(14,2),
  descontos                 numeric(14,2),
  premio_total              numeric(14,2),
  premio                    numeric(14,2),
  forma_pagamento           text,
  qtd_parcelas              int,
  valor_parcela             numeric(14,2),
  valor_primeira_parcela    numeric(14,2),
  valor_demais_parcelas     numeric(14,2),
  cartao_mascarado          text,
  bandeira_cartao           text,
  validade_cartao           text,
  titular_cartao            text,
  cpf_titular_pagto         text,
  banco_pagto               text,
  agencia_pagto             text,
  conta_pagto               text,
  dia_vencimento            int,
  parcelas                  jsonb,
  seguradora_anterior       text,
  apolice_anterior          text,
  fim_vigencia_anterior     date,
  sinistro_ult_vigencia     text,
  bonus_unico               text,
  renovacao_seguradora      text,
  corretor_nome             text,
  corretor_cnpj             text,
  corretor_susep            text,
  corretor_codigo           text,
  corretor_email            text,
  corretor_telefone         text,
  corretor_endereco         text,
  corretor_filial           text,
  corretor_inspetoria       text,
  corretor_participacao     numeric(8,4),
  sucursal_codigo           text,
  sucursal_nome             text,
  processo_susep            text,
  congenere                 text,
  tipo_operacao             text,
  seguradora_origem         text,
  layout_pdf                text,
  pdf_texto_bruto           text,
  dados                     jsonb,
  status                    text not null default 'pendente'
                            check (status in ('pendente','sincronizado','erro')),
  erro_msg                  text,
  cliente_id                uuid references public.clientes(id) on delete set null,
  proposta_id               uuid references public.propostas(id) on delete set null,
  created_at                timestamptz default now(),
  sincronizado_em           timestamptz
);

do $$ begin create index if not exists idx_seg_stage_prop_seg on public.seg_stage_propostas(seguradora_id); exception when others then null; end $$;
do $$ begin create index if not exists idx_seg_stage_prop_st  on public.seg_stage_propostas(status);        exception when others then null; end $$;
do $$ begin create index if not exists idx_seg_stage_prop_num on public.seg_stage_propostas(numero);        exception when others then null; end $$;
do $$ begin create index if not exists idx_seg_stage_prop_cpf on public.seg_stage_propostas(cpf_cnpj);      exception when others then null; end $$;

-- 7. RLS ──────────────────────────────────────────────────────────
do $$ begin alter table public.seg_stage_propostas enable row level security; exception when others then null; end $$;
do $$ begin alter table public.propostas           enable row level security; exception when others then null; end $$;

do $$ begin
  create policy seg_stage_propostas_admin on public.seg_stage_propostas
    for all to authenticated using (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
    ) with check (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
    );
exception when duplicate_object then null; end $$;

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
