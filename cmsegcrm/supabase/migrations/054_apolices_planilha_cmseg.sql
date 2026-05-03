-- Migration 054: campos novos da planilha de apolices CMSEG + fix RLS admin
-- A planilha do escritorio tem 44 colunas; a maioria nova vai pra colunas
-- proprias e o restante cai em custom_fields (jsonb).

alter table public.apolices
  add column if not exists tipo_documento    text,                -- CPF/CNPJ
  add column if not exists tipo_pessoa       text,                -- PF/PJ
  add column if not exists ramo              text,                -- ramo do seguro
  add column if not exists premio_liquido    numeric(12,2),
  add column if not exists premio_total      numeric(12,2),
  add column if not exists comissao_valor    numeric(12,2),       -- COMISSAO GERADA em R$
  add column if not exists qtd_parcelas      int,
  add column if not exists tipo_pagamento    text,
  add column if not exists status_apolice    text,
  add column if not exists status_assinatura text,
  add column if not exists negocio_corretora text,
  add column if not exists item              text,
  add column if not exists vendedores_texto  text,                -- TODOS VENDEDORES (livre)
  add column if not exists tipo_vendedores   text,
  add column if not exists vendedor_nome     text,                -- coluna VENDEDOR (livre)
  add column if not exists proposta          text,
  add column if not exists proposta_endosso  text,
  add column if not exists agencia           text,
  add column if not exists banco             text,
  add column if not exists conta             text,
  add column if not exists apolice_conferida boolean,
  add column if not exists proposta_assinada boolean,
  add column if not exists data_controle     date,
  add column if not exists data_cadastro     date,
  add column if not exists emissao           date,
  add column if not exists transmissao       date,
  add column if not exists estipulante       text,
  add column if not exists filial            text,
  add column if not exists pasta             text,
  add column if not exists pasta_cliente     text,
  add column if not exists repasse_vendedor  numeric(12,2),
  add column if not exists emails            text,
  add column if not exists telefones         text,
  add column if not exists custom_fields     jsonb default '{}'::jsonb;

-- Indices uteis pra busca/filtros
create index if not exists idx_apolices_proposta      on public.apolices(proposta) where proposta is not null;
create index if not exists idx_apolices_ramo          on public.apolices(ramo)     where ramo is not null;
create index if not exists idx_apolices_tipo_pessoa   on public.apolices(tipo_pessoa);
create index if not exists idx_apolices_data_cadastro on public.apolices(data_cadastro desc nulls last);

-- Fix RLS: admin deve ler tudo. Ate agora a policy filtrava por vendedor_id
-- mesmo pra admin, escondendo apolices importadas sem vendedor.
drop policy if exists "scoped_read_apolices" on public.apolices;
create policy "scoped_read_apolices" on public.apolices for select using (
  public.current_user_role() = 'admin'
  or public.can_see_user(vendedor_id)
);
