-- ─────────────────────────────────────────────────────────────
-- 048_hdi_integracao.sql
-- Integração HDI x CRM:
--   * Tabelas auxiliares para o layout de exportação de emissão
--     (registros 03 Item Auto, 04 Acessório, 05 Cobertura Básica,
--      06 Coberturas Adicionais, 07/08 Motorista, 13 Local,
--      14 Cláusulas).
--   * Colunas extras em public.apolices para os campos do
--     registro 01 (Apólice) e 12 (Corretor).
--   * Permitir vincular anexos diretamente a uma apólice
--     (categoria 'apolice'), inclusive o PDF importado.
-- ─────────────────────────────────────────────────────────────

-- 1. Colunas extras em public.apolices ──────────────────────────
alter table public.apolices
  add column if not exists cpf_cnpj_segurado            text,
  add column if not exists codigo_estipulante           text,
  add column if not exists codigo_unidade               text,
  add column if not exists codigo_acordo                text,
  add column if not exists data_pagamento_1a            date,
  add column if not exists importancia_segurada         numeric(14,2),
  add column if not exists valor_adicional_fracionamento numeric(14,2),
  add column if not exists valor_custo_documento        numeric(14,2),
  add column if not exists valor_iof                    numeric(14,2),
  add column if not exists valor_premio_total           numeric(14,2),
  add column if not exists apolice_anterior             text,
  add column if not exists codigo_cia_anterior          text,
  add column if not exists tipo_endosso                 text,
  add column if not exists descricao_endosso            text,
  add column if not exists ramo_codigo                  text,
  -- Corretor (registro 12)
  add column if not exists susep_corretor               text,
  add column if not exists tipo_corretor                text,
  add column if not exists susep_inspetor               text,
  add column if not exists tipo_inspetor                text,
  add column if not exists susep_interno                text,
  add column if not exists tipo_interno                 text,
  add column if not exists comissao_total_pct           numeric(6,2),
  -- Endereço/contato do segurado para registro 02
  add column if not exists segurado_endereco            text,
  add column if not exists segurado_numero              text,
  add column if not exists segurado_complemento         text,
  add column if not exists segurado_bairro              text,
  add column if not exists segurado_cep                 text,
  add column if not exists segurado_cidade              text,
  add column if not exists segurado_uf                  text,
  add column if not exists segurado_telefone            text,
  add column if not exists segurado_tipo_pessoa         text,
  add column if not exists segurado_email               text,
  add column if not exists segurado_rg                  text,
  add column if not exists segurado_rg_data             date,
  add column if not exists segurado_rg_orgao            text,
  -- Endosso/ controle
  add column if not exists numero_documento             text;

-- 2. Itens (registro 03 — auto) ─────────────────────────────────
create table if not exists public.apolice_itens_auto (
  id              uuid primary key default uuid_generate_v4(),
  apolice_id      uuid not null references public.apolices(id) on delete cascade,
  numero_item     int not null default 1,
  marca           text,
  modelo          text,
  ano_fabricacao  int,
  ano_modelo      int,
  placa           text,
  chassi          text,
  num_passageiros int,
  combustivel     text,    -- G/A/D/O
  bonus_pct       numeric(6,2),
  bonus_nivel     int,
  cobertura_codigo text,   -- conforme tabela
  renavam         text,
  cep_circulacao  text,
  cep_pernoite    text,
  regiao_circulacao text,
  codigo_operacao text,
  operacao_item   text,
  valor_fipe      numeric(12,2),
  descricao_cobertura text,
  desconto_item   numeric(7,2),
  qtd_sinistros   int,
  ci_anterior     text,
  ci_atual        text,
  created_at      timestamptz default now()
);
create index if not exists idx_aitens_apolice on public.apolice_itens_auto(apolice_id);

-- 3. Acessórios (registro 04) ───────────────────────────────────
create table if not exists public.apolice_acessorios (
  id           uuid primary key default uuid_generate_v4(),
  apolice_id   uuid not null references public.apolices(id) on delete cascade,
  numero_item  int not null default 1,
  descricao    text,
  is_segurada  numeric(14,2),
  premio_liquido numeric(14,2),
  premio_anual   numeric(14,2),
  created_at   timestamptz default now()
);
create index if not exists idx_aaces_apolice on public.apolice_acessorios(apolice_id);

-- 4. Coberturas básicas (05) e adicionais (06) ─────────────────
create table if not exists public.apolice_coberturas (
  id              uuid primary key default uuid_generate_v4(),
  apolice_id      uuid not null references public.apolices(id) on delete cascade,
  tipo_registro   text not null check (tipo_registro in ('05','06')),
  numero_item     int not null default 1,
  codigo_cobertura text,
  codigo_cobertura_tabela text,   -- somente registro 06
  is_segurada     numeric(14,2),
  valor_franquia  numeric(14,2),
  tipo_franquia   text,           -- O / F / E
  descricao       text,
  premio_liquido  numeric(14,2),
  premio_anual    numeric(14,2),
  created_at      timestamptz default now()
);
create index if not exists idx_acob_apolice on public.apolice_coberturas(apolice_id);

-- 5. Motoristas (07) e perfil (08) ─────────────────────────────
create table if not exists public.apolice_motoristas (
  id              uuid primary key default uuid_generate_v4(),
  apolice_id      uuid not null references public.apolices(id) on delete cascade,
  tipo_registro   text not null check (tipo_registro in ('07','08')),
  numero_item     int not null default 1,
  codigo_perfil   text,
  codigo_motorista text,
  nome            text,
  data_nascimento date,
  codigo_fator    text,
  codigo_subfator text,
  descricao_fator text,
  descricao_subfator text,
  created_at      timestamptz default now()
);
create index if not exists idx_amot_apolice on public.apolice_motoristas(apolice_id);

-- 6. Locais (registro 13) ──────────────────────────────────────
create table if not exists public.apolice_locais (
  id              uuid primary key default uuid_generate_v4(),
  apolice_id      uuid not null references public.apolices(id) on delete cascade,
  numero_documento_conjugado text,
  codigo_modalidade text,
  local_codigo    text,
  premio_local    numeric(14,2),
  endereco        text,
  complemento     text,
  cidade          text,
  uf              text,
  cep             text,
  codigo_municipio text,
  codigo_atividade text,
  descricao_atividade text,
  codigo_construcao text,
  descricao_construcao text,
  codigo_bem_segurado text,
  descricao_bem_segurado text,
  codigo_plano    text,
  descricao_plano text,
  codigo_cliente  int,
  agravacao_desconto text,
  pro_rata        text,            -- S/N
  tipo_risco      text,
  codigo_identificacao_doc text,
  pct_agravo_desconto text,
  created_at      timestamptz default now()
);
create index if not exists idx_aloc_apolice on public.apolice_locais(apolice_id);

-- 7. Cláusulas (registro 14) ───────────────────────────────────
create table if not exists public.apolice_clausulas (
  id              uuid primary key default uuid_generate_v4(),
  apolice_id      uuid not null references public.apolices(id) on delete cascade,
  numero_documento_conjugado text,
  codigo_ramo     text,
  codigo_modalidade text,
  local_codigo    text,
  item            text,
  descricao_item_pre text,
  codigo_clausula text,
  descricao_clausula text,
  is_segurada     numeric(14,2),
  codigo_franquia text,
  descricao_franquia text,
  valor_franquia  numeric(14,2),
  premio_liquido  numeric(14,2),
  premio_anual    numeric(14,2),
  valor_risco     numeric(14,2),
  cobertura_basica text,        -- S/N
  created_at      timestamptz default now()
);
create index if not exists idx_aclau_apolice on public.apolice_clausulas(apolice_id);

-- 8. Anexos: aceitar categoria 'apolice' e relacionar com apólice
do $$ begin
  alter table public.anexos drop constraint if exists anexos_categoria_check;
exception when others then null;
end $$;
alter table public.anexos
  add constraint anexos_categoria_check
  check (categoria in ('negocio','cliente','comissao','apolice','outro'));
alter table public.anexos
  add column if not exists apolice_id uuid references public.apolices(id) on delete cascade;
create index if not exists idx_anexos_apolice on public.anexos(apolice_id);

-- 9. RLS para as novas tabelas (autenticados leem/escrevem) ────
do $$
declare t text;
begin
  for t in select unnest(array[
    'apolice_itens_auto','apolice_acessorios','apolice_coberturas',
    'apolice_motoristas','apolice_locais','apolice_clausulas'
  ]) loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname='autenticados leem') then
      execute format('create policy "autenticados leem" on public.%I for select using (auth.role() = ''authenticated'')', t);
    end if;
    if not exists (select 1 from pg_policies where tablename=t and policyname='autenticados escrevem') then
      execute format('create policy "autenticados escrevem" on public.%I for all using (auth.role() = ''authenticated'')', t);
    end if;
  end loop;
end $$;
