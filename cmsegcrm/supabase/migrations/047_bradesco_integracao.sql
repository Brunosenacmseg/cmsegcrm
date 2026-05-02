-- ─────────────────────────────────────────────────────────────
-- 047_bradesco_integracao.sql
-- Integração Bradesco Seguros (InfoSeguro) + Bradesco Vida e
-- Previdência (BVP) — via upload dos arquivos dos layouts:
-- 1  Parcelas Pagas       7  Seguros a Renovar
-- 2  Parcelas a Vencer    8  Apólices Auto
-- 3  Parcelas Pendentes   9  Propostas Auto
-- 4  Seguros Emitidos    10  Endossos Auto
-- 5  Seguros Cancelados  11  Extrato de Comissões
-- 6  Sinistros           BVP 01-21 (extratos de comissão)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.importacoes_bradesco (
  id              uuid primary key default uuid_generate_v4(),
  tipo_arquivo    text,                 -- PARCELAS_PAGAS|PARCELAS_VENCER|PARCELAS_PENDENTES|EMITIDOS|CANCELADOS|SINISTROS|RENOVAR|APOLICES_AUTO|PROPOSTAS_AUTO|ENDOSSOS_AUTO|COMISSOES|BVP_COMISSOES
  origem          text default 'Bradesco Seguros',  -- Bradesco Seguros | BVP
  nome_arquivo    text,
  data_geracao    text,
  qtd_registros   int,
  qtd_importados  int default 0,
  qtd_erros       int default 0,
  erros           jsonb,
  status          text default 'processando',
  criado_em       timestamptz default now(),
  concluido_em    timestamptz
);

alter table public.importacoes_bradesco enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='importacoes_bradesco' and policyname='autenticados leem importacoes_bradesco') then
    create policy "autenticados leem importacoes_bradesco" on public.importacoes_bradesco for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='importacoes_bradesco' and policyname='autenticados escrevem importacoes_bradesco') then
    create policy "autenticados escrevem importacoes_bradesco" on public.importacoes_bradesco for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- Sinistros (genérico — usado também por outras seguradoras)
create table if not exists public.sinistros (
  id                uuid primary key default uuid_generate_v4(),
  apolice_id        uuid references public.apolices(id) on delete set null,
  cliente_id        uuid references public.clientes(id) on delete set null,
  numero_sinistro   text,
  numero_apolice    text,
  numero_proposta   text,
  data_ocorrencia   date,
  data_abertura     date,
  data_encerramento date,
  natureza_codigo   text,
  natureza_descricao text,
  uf                text,
  placa             text,
  chassi            text,
  valor_indenizacao numeric(14,2),
  bonus_casco_pct   numeric(5,2),
  seguradora        text default 'Bradesco Seguros',
  fonte             text default 'Bradesco Seguros',
  dados_brutos      jsonb,
  criado_em         timestamptz default now()
);
create unique index if not exists ux_sinistros_seg_num on public.sinistros(seguradora, coalesce(numero_sinistro,''), coalesce(numero_apolice,''), coalesce(data_ocorrencia, '1900-01-01'));
create index if not exists idx_sinistros_apolice on public.sinistros(apolice_id);
create index if not exists idx_sinistros_cliente on public.sinistros(cliente_id);

alter table public.sinistros enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='sinistros' and policyname='autenticados leem sinistros') then
    create policy "autenticados leem sinistros" on public.sinistros for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='sinistros' and policyname='autenticados escrevem sinistros') then
    create policy "autenticados escrevem sinistros" on public.sinistros for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- Garantir tabela de endossos (criada também pela 046_tokio_marine)
create table if not exists public.endossos (
  id                uuid primary key default uuid_generate_v4(),
  apolice_id        uuid references public.apolices(id) on delete cascade,
  cliente_id        uuid references public.clientes(id) on delete set null,
  numero_endosso    text not null,
  numero_apolice    text,
  tipo              text,
  motivo            text,
  data_emissao      date,
  vigencia_ini      date,
  vigencia_fim      date,
  valor_premio      numeric(12,2),
  valor_iof         numeric(12,2),
  valor_diferenca   numeric(12,2),
  seguradora        text default 'Bradesco Seguros',
  fonte             text default 'Bradesco Seguros',
  dados_brutos      jsonb,
  criado_em         timestamptz default now()
);
create unique index if not exists ux_endossos_seg_num on public.endossos(seguradora, numero_endosso);

-- Campos auxiliares em apólices
alter table public.apolices
  add column if not exists nome_segurado     text,
  add column if not exists cpf_cnpj_segurado text,
  add column if not exists chassi            text,
  add column if not exists sucursal          text,
  add column if not exists numero_contrato   text,
  add column if not exists dados_bradesco    jsonb;
