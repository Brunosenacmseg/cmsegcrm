-- Expande a tabela de apólices pra cobrir todos os campos da planilha de
-- importação vinda do sistema legado (CMSeg). Mantém compatibilidade: as
-- colunas novas são todas nullable e não removem nada do schema antigo.

-- Remove o check rígido pra aceitar qualquer status do sistema de origem
-- (ex: "vigente", "cancelada", "não ativa", "endossada", etc.).
alter table public.apolices drop constraint if exists apolices_status_check;

alter table public.apolices
  add column if not exists tipo_documento     text,
  add column if not exists ramo               text,
  add column if not exists premio_liquido     numeric(14,2),
  add column if not exists premio_total       numeric(14,2),
  add column if not exists comissao_valor     numeric(14,2),
  add column if not exists comissao_gerada    numeric(14,2),
  add column if not exists quantidade_parcelas integer,
  add column if not exists tipo_pagamento     text,
  add column if not exists negocio_corretora  text,
  add column if not exists item               text,
  add column if not exists todos_vendedores   text,
  add column if not exists vendedor           text,
  add column if not exists tipo_vendedores    text,
  add column if not exists repasse_vendedor   numeric(14,2),
  add column if not exists proposta           text,
  add column if not exists proposta_endosso   text,
  add column if not exists proposta_assinada  text,
  add column if not exists endosso            text,
  add column if not exists agencia            text,
  add column if not exists conta              text,
  add column if not exists banco              text,
  add column if not exists apolice_conferida  text,
  add column if not exists status_apolice     text,
  add column if not exists status_assinatura  text,
  add column if not exists transmissao        text,
  add column if not exists data_controle      date,
  add column if not exists data_cadastro      date,
  add column if not exists emissao            date,
  add column if not exists estipulante        text,
  add column if not exists filial             text,
  add column if not exists pasta              text,
  add column if not exists pasta_cliente      text,
  add column if not exists tipo_pessoa        text,
  add column if not exists emails             text,
  add column if not exists telefones          text,
  add column if not exists documento_cliente  text;

create index if not exists idx_apolices_documento_cliente on public.apolices (documento_cliente);
create index if not exists idx_apolices_proposta on public.apolices (proposta);
