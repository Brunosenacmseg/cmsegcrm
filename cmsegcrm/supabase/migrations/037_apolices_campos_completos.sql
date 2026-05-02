-- ─────────────────────────────────────────────────────────────
-- 037_apolices_campos_completos.sql
-- Adiciona as colunas que faltavam em public.apolices para
-- equiparar ao layout completo (planilha do CRM antigo).
-- ─────────────────────────────────────────────────────────────

alter table public.apolices
  add column if not exists tipo_documento       text,             -- CPF / CNPJ / RG
  add column if not exists premio_liquido       numeric(12,2),
  add column if not exists qtd_parcelas         int,
  add column if not exists tipo_pagamento       text,             -- Boleto, Débito, Cartão...
  add column if not exists ramo                 text,             -- Auto, Vida, Residencial...
  add column if not exists negocio_corretora    text,
  add column if not exists item                 text,
  add column if not exists proposta             text,
  add column if not exists proposta_endosso     text,
  add column if not exists agencia              text,
  add column if not exists apolice_conferida    boolean default false,
  add column if not exists banco                text,
  add column if not exists data_controle        date,
  add column if not exists conta                text,
  add column if not exists emissao              date,
  add column if not exists estipulante          text,
  add column if not exists filial               text,
  add column if not exists pasta                text,
  add column if not exists pasta_cliente        text,
  add column if not exists proposta_assinada    boolean default false,
  add column if not exists repasse_vendedor_pct numeric(5,2),     -- % de repasse
  add column if not exists status_assinatura    text,             -- pendente, assinada, recusada...
  add column if not exists tipo_vendedores      text,             -- produção, renovação, particular...
  add column if not exists transmissao          text,
  -- TODOS VENDEDORES: lista mista de vendedores que tocaram a apólice
  -- formato: [{ "tipo":"user"|"legado", "id":"<uuid>", "papel":"principal|coadjuvante" }]
  add column if not exists vendedores_envolvidos jsonb default '[]'::jsonb;

create index if not exists idx_apolices_emissao        on public.apolices(emissao);
create index if not exists idx_apolices_ramo           on public.apolices(ramo);
create index if not exists idx_apolices_data_controle  on public.apolices(data_controle);
create index if not exists idx_apolices_vendedores_env on public.apolices using gin (vendedores_envolvidos);
