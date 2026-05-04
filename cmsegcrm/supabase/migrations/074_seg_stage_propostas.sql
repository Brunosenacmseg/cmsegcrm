-- ─────────────────────────────────────────────────────────────
-- 074_seg_stage_propostas.sql
-- Cria a tabela `seg_stage_propostas` para receber importações de propostas
-- (PDF, XLSX, etc.) das seguradoras. Estrutura espelha `seg_stage_apolices`,
-- mas com campos exclusivos de proposta (status_proposta, data_validade,
-- aceite, recusa, etc.).
--
-- Também:
--   1. Estende `seg_importacoes.tipo` p/ aceitar 'propostas'.
--   2. Cria a tabela `propostas` "produção" (mirror reduzido de `apolices`)
--      para que o CRM tenha um módulo permanente de propostas vinculado ao
--      cliente / negócio.
-- ─────────────────────────────────────────────────────────────

-- 1. Estende o check de tipo em seg_importacoes ───────────────────
do $$
begin
  alter table public.seg_importacoes drop constraint if exists seg_importacoes_tipo_check;
  alter table public.seg_importacoes add constraint seg_importacoes_tipo_check
    check (tipo in ('apolices','sinistros','inadimplencia','comissoes','propostas'));
exception when others then null;
end $$;

-- 2. Tabela de produção `propostas` (similar a apolices) ──────────
create table if not exists public.propostas (
  id              uuid primary key default uuid_generate_v4(),
  numero          text,                 -- Nº da proposta
  proposta_endosso text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  nome_segurado   text,
  cpf_cnpj_segurado text,
  seguradora      text,                  -- Nome livre (cadastrado pelo usuário)
  ramo            text,
  produto         text,
  vigencia_ini    date,
  vigencia_fim    date,
  emissao         date,                  -- Data de emissão da proposta
  data_validade   date,                  -- Validade da proposta (até quando o cliente pode aceitar)
  premio          numeric(14,2),
  premio_liquido  numeric(14,2),
  iof             numeric(14,2),
  premio_total    numeric(14,2),
  qtd_parcelas    int,
  forma_pagamento text,
  status          text not null default 'em_analise'
                  check (status in ('em_analise','aceita','recusada','expirada','convertida','cancelada')),
  apolice_id      uuid references public.apolices(id) on delete set null, -- preenche quando convertida
  status_assinatura text,
  proposta_assinada boolean default false,
  placa           text,
  observacao      text,
  fonte           text,                   -- 'PDF', 'XLSX', 'Manual', 'API'
  arquivo_url     text,                   -- Bucket Supabase com PDF original
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_propostas_cliente on public.propostas(cliente_id);
create index if not exists idx_propostas_numero  on public.propostas(numero);
create index if not exists idx_propostas_status  on public.propostas(status);
create index if not exists idx_propostas_seg     on public.propostas(seguradora);
create index if not exists idx_propostas_validade on public.propostas(data_validade) where data_validade is not null;

-- 3. Tabela de staging (recebe linhas brutas das importações) ──────
create table if not exists public.seg_stage_propostas (
  id              uuid primary key default uuid_generate_v4(),
  seguradora_id   uuid not null references public.seguradoras(id) on delete cascade,
  importacao_id   uuid references public.seg_importacoes(id) on delete set null,

  -- ── Identificação principal ──────────────────────────────────
  numero                    text,
  data_emissao              date,
  vigencia_ini              date,
  vigencia_fim              date,
  data_validade             date,                 -- até quando a proposta é válida
  data_calculo              date,
  versao                    text,
  rule_id                   text,
  produto                   text,
  ramo_codigo               text,
  ramo_descricao            text,
  tipo_seguro               text,
  classe_bonus              int,
  codigo_ci                 text,
  status_proposta           text,                  -- "Em análise", "Aceita", etc.
  numero_cotacao            text,                  -- Bradesco, Mapfre

  -- ── Segurado / proponente ────────────────────────────────────
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

  -- ── Condutor principal ───────────────────────────────────────
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

  -- ── Veículo ──────────────────────────────────────────────────
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

  -- ── Coberturas (jsonb) ───────────────────────────────────────
  coberturas                jsonb,
  coberturas_adicionais     jsonb,
  franquias                 jsonb,
  servicos                  jsonb,
  assistencias              jsonb,
  clausulas                 jsonb,
  descontos_aplicados       jsonb,

  -- ── Prêmio detalhado ─────────────────────────────────────────
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
  premio                    numeric(14,2),  -- legado / shortcut p/ premio_total

  -- ── Pagamento ────────────────────────────────────────────────
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

  -- ── Histórico do seguro anterior ─────────────────────────────
  seguradora_anterior       text,
  apolice_anterior          text,
  fim_vigencia_anterior     date,
  sinistro_ult_vigencia     text,
  bonus_unico               text,
  renovacao_seguradora      text,

  -- ── Corretor ─────────────────────────────────────────────────
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

  -- ── Sucursal / seguradora ────────────────────────────────────
  sucursal_codigo           text,
  sucursal_nome             text,
  processo_susep            text,
  congenere                 text,
  tipo_operacao             text,

  -- ── Universais / debug ───────────────────────────────────────
  seguradora_origem         text,             -- 'allianz', 'tokio', etc.
  layout_pdf                text,
  pdf_texto_bruto           text,
  dados                     jsonb,            -- linha bruta da importação
  status                    text not null default 'pendente'
                            check (status in ('pendente','sincronizado','erro')),
  erro_msg                  text,
  cliente_id                uuid references public.clientes(id) on delete set null,
  proposta_id               uuid references public.propostas(id) on delete set null,
  created_at                timestamptz default now(),
  sincronizado_em           timestamptz
);

create index if not exists idx_seg_stage_prop_seg on public.seg_stage_propostas(seguradora_id);
create index if not exists idx_seg_stage_prop_st  on public.seg_stage_propostas(status);
create index if not exists idx_seg_stage_prop_num on public.seg_stage_propostas(numero);
create index if not exists idx_seg_stage_prop_cpf on public.seg_stage_propostas(cpf_cnpj);

-- 4. RLS (mesmas policies de seg_stage_apolices) ───────────────────
alter table public.seg_stage_propostas enable row level security;
alter table public.propostas           enable row level security;

do $$
begin
  -- Staging: admin vê tudo
  create policy seg_stage_propostas_admin on public.seg_stage_propostas
    for all to authenticated using (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
    ) with check (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  -- Propostas: admin / vendedor vinculado vêem
  create policy propostas_select on public.propostas
    for select to authenticated using (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','financeiro','vendedor','sdr'))
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy propostas_admin_write on public.propostas
    for all to authenticated using (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','financeiro','vendedor'))
    ) with check (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','financeiro','vendedor'))
    );
exception when duplicate_object then null;
end $$;

comment on table  public.propostas is
  'Propostas de seguro (estado pré-apólice). Quando aceita pelo cliente e emitida, vira uma apólice — `apolice_id` referencia o registro emitido.';
comment on table  public.seg_stage_propostas is
  'Staging para importação de propostas (PDF/XLSX) — mesma mecânica de seg_stage_apolices.';
comment on column public.propostas.data_validade is
  'Data limite até a qual a proposta é válida para aceite. Após esta data, status muda para `expirada`.';
comment on column public.seg_stage_propostas.seguradora_origem is
  'ID curto da seguradora detectada pelo parser (allianz, bradesco, hdi, etc.).';
