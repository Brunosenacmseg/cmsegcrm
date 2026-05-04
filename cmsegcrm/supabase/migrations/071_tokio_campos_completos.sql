-- ─────────────────────────────────────────────────────────────
-- 071_tokio_campos_completos.sql
-- Garante que CADA campo retornado pelos 7 serviços do webservice
-- da Tokio Marine tenha uma coluna dedicada.
--
-- Estratégia:
--  - Apólice/Parcela/Extrato continuam alimentando as tabelas
--    "normalizadas" do CRM (apolices / contas_pagar /
--    comissoes_recebidas), mas além disso passamos a salvar uma
--    cópia "raw" em tabelas tokio_* com TODAS as colunas.
--  - Para Sinistro/Renovação/Pendência/Recusa, expandimos as
--    tabelas criadas em 070_ com os campos extras.
-- ─────────────────────────────────────────────────────────────

-- ─── Apólices: campos dedicados extras ──────────────────────
alter table public.apolices
  add column if not exists tipo_seguro          text,
  add column if not exists status_apolice_tokio text,
  add column if not exists motivo_recusa        text,
  add column if not exists data_cancelamento    date,
  add column if not exists data_recusa          date,
  add column if not exists vigencia_ini_endosso date,
  add column if not exists vigencia_fim_endosso date,
  add column if not exists emissao_endosso      date,
  add column if not exists chassi               text,
  add column if not exists fabricante           text,
  add column if not exists ano_fabricacao       text,
  add column if not exists email_segurado       text,
  add column if not exists ddd_segurado         text,
  add column if not exists telefone_segurado    text,
  add column if not exists tipo_complemento     text,
  add column if not exists custo_apolice        numeric(14,2),
  add column if not exists valor_comissao       numeric(14,2),
  add column if not exists cd_corretor          text,
  add column if not exists nm_corretor          text;

-- ─── tokio_apolices_raw: 1 linha por DadosSeguro recebido ───
create table if not exists public.tokio_apolices_raw (
  id                       uuid primary key default uuid_generate_v4(),
  num_apolice              text,
  num_proposta             text,
  num_endosso              text,
  ramo                     text,
  produto                  text,
  tipo_seguro              text,
  status_apolice           text,
  tp_complemento           text,

  -- Segurado
  cpf_cnpj                 text,
  nome_segurado            text,
  tp_pessoa                text,
  email                    text,
  ddd                      text,
  telefone                 text,
  endereco                 text,
  numero                   text,
  complemento              text,
  bairro                   text,
  cidade                   text,
  uf                       text,
  cep                      text,

  -- Vigências e datas
  data_emissao             date,
  vigencia_ini             date,
  vigencia_fim             date,
  vigencia_ini_endosso     date,
  vigencia_fim_endosso     date,
  emissao_endosso          date,
  data_cancelamento        date,
  data_recusa              date,
  motivo_recusa            text,

  -- Cobrança
  forma_cobranca           text,
  qtd_parcelas             int,
  premio_liquido           numeric(14,2),
  valor_iof                numeric(14,2),
  premio_total             numeric(14,2),
  custo_apolice            numeric(14,2),
  pc_comissao              numeric(8,4),
  vlr_comissao             numeric(14,2),

  -- Veículo (auto)
  placa                    text,
  chassi                   text,
  modelo                   text,
  fabricante               text,
  ano_modelo               text,
  ano_fabricacao           text,
  combustivel              text,
  cor                      text,
  zerokm                   text,

  -- Corretor
  cd_corretor              text,
  nm_corretor              text,

  apolice_id               uuid references public.apolices(id) on delete set null,
  cliente_id               uuid references public.clientes(id) on delete set null,
  importacao_id            uuid references public.importacoes_tokio(id) on delete set null,
  dados_brutos             jsonb,
  criado_em                timestamptz default now()
);
create unique index if not exists ux_tokio_apo_raw on public.tokio_apolices_raw(num_apolice, num_endosso);
create index if not exists idx_tokio_apo_raw_proposta on public.tokio_apolices_raw(num_proposta);
create index if not exists idx_tokio_apo_raw_cpf on public.tokio_apolices_raw(cpf_cnpj);

alter table public.tokio_apolices_raw enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tokio_apolices_raw' and policyname='autenticados leem tokio_apolices_raw') then
    create policy "autenticados leem tokio_apolices_raw" on public.tokio_apolices_raw for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='tokio_apolices_raw' and policyname='autenticados escrevem tokio_apolices_raw') then
    create policy "autenticados escrevem tokio_apolices_raw" on public.tokio_apolices_raw for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- ─── tokio_parcelas: cópia bruta de cada <parcela> ──────────
create table if not exists public.tokio_parcelas (
  id                  uuid primary key default uuid_generate_v4(),
  num_apolice         text,
  num_endosso         text,
  num_proposta        text,
  ramo                text,
  produto             text,
  cpf_cnpj            text,
  nome_segurado       text,

  num_parcela         int,
  qtde_parcela        int,
  data_vencimento     date,
  data_pagamento      date,
  data_baixa          date,
  data_emissao        date,
  data_competencia    date,

  vlr_premio_parcela  numeric(14,2),
  vlr_juros           numeric(14,2),
  vlr_iof             numeric(14,2),
  vlr_comissao        numeric(14,2),
  vlr_liquido         numeric(14,2),
  vlr_desconto        numeric(14,2),
  vlr_multa           numeric(14,2),
  vlr_total           numeric(14,2),

  forma_cobranca      text,
  banco_cobranca      text,
  agencia             text,
  conta               text,
  num_boleto          text,
  num_nota_fiscal     text,
  status_parcela      text,
  situacao_parcela    text,

  cd_corretor         text,
  nm_corretor         text,

  apolice_id          uuid references public.apolices(id) on delete set null,
  cliente_id          uuid references public.clientes(id) on delete set null,
  conta_pagar_id      uuid references public.contas_pagar(id) on delete set null,
  importacao_id       uuid references public.importacoes_tokio(id) on delete set null,
  dados_brutos        jsonb,
  criado_em           timestamptz default now()
);
create unique index if not exists ux_tokio_parc on public.tokio_parcelas(num_apolice, num_parcela, data_vencimento);
create index if not exists idx_tokio_parc_apolice on public.tokio_parcelas(num_apolice);
create index if not exists idx_tokio_parc_cpf on public.tokio_parcelas(cpf_cnpj);

alter table public.tokio_parcelas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tokio_parcelas' and policyname='autenticados leem tokio_parcelas') then
    create policy "autenticados leem tokio_parcelas" on public.tokio_parcelas for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='tokio_parcelas' and policyname='autenticados escrevem tokio_parcelas') then
    create policy "autenticados escrevem tokio_parcelas" on public.tokio_parcelas for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- ─── tokio_extrato_comissoes: cabeçalho do extrato ──────────
create table if not exists public.tokio_extrato_comissoes (
  id                  uuid primary key default uuid_generate_v4(),
  num_extrato         text,
  cd_corretor         text,
  nm_corretor         text,
  data_pagamento      date,
  data_emissao        date,
  competencia         text,
  vlr_total           numeric(14,2),
  vlr_bruto           numeric(14,2),
  vlr_liquido         numeric(14,2),
  vlr_descontos       numeric(14,2),
  vlr_acrescimos      numeric(14,2),
  vlr_iss             numeric(14,2),
  vlr_irrf            numeric(14,2),
  qtd_detalhes        int,
  importacao_id       uuid references public.importacoes_tokio(id) on delete set null,
  dados_brutos        jsonb,
  criado_em           timestamptz default now(),
  unique (num_extrato)
);
alter table public.tokio_extrato_comissoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tokio_extrato_comissoes' and policyname='autenticados leem tokio_extrato_comissoes') then
    create policy "autenticados leem tokio_extrato_comissoes" on public.tokio_extrato_comissoes for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='tokio_extrato_comissoes' and policyname='autenticados escrevem tokio_extrato_comissoes') then
    create policy "autenticados escrevem tokio_extrato_comissoes" on public.tokio_extrato_comissoes for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- ─── tokio_detalhe_comissao: 1 linha por <DetalheComissao> ──
create table if not exists public.tokio_detalhe_comissao (
  id                  uuid primary key default uuid_generate_v4(),
  extrato_id          uuid references public.tokio_extrato_comissoes(id) on delete cascade,

  num_extrato         text,
  num_apolice         text,
  num_endosso         text,
  num_proposta        text,
  ramo                text,
  produto             text,
  tipo_seguro         text,

  cpf_cnpj            text,
  nome_segurado       text,
  tp_pessoa           text,

  num_parcela         int,
  qtde_parcela        int,
  pc_comissao         numeric(8,4),
  vlr_comissao_parcela numeric(14,2),
  vlr_premio          numeric(14,2),
  vlr_premio_liquido  numeric(14,2),
  vlr_iof             numeric(14,2),
  cd_natureza         text,
  ds_natureza         text,
  cd_tipo_pagto       text,
  ds_tipo_pagto       text,
  status_apolice      text,

  data_emissao        date,
  data_pagamento      date,
  data_movimento      date,
  data_competencia    date,

  cd_corretor         text,
  nm_corretor         text,

  apolice_id          uuid references public.apolices(id) on delete set null,
  cliente_id          uuid references public.clientes(id) on delete set null,
  comissao_recebida_id uuid references public.comissoes_recebidas(id) on delete set null,
  importacao_id       uuid references public.importacoes_tokio(id) on delete set null,
  dados_brutos        jsonb,
  criado_em           timestamptz default now()
);
create index if not exists idx_tokio_dc_extrato on public.tokio_detalhe_comissao(extrato_id);
create index if not exists idx_tokio_dc_apolice on public.tokio_detalhe_comissao(num_apolice);
create index if not exists idx_tokio_dc_cpf on public.tokio_detalhe_comissao(cpf_cnpj);

alter table public.tokio_detalhe_comissao enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tokio_detalhe_comissao' and policyname='autenticados leem tokio_detalhe_comissao') then
    create policy "autenticados leem tokio_detalhe_comissao" on public.tokio_detalhe_comissao for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='tokio_detalhe_comissao' and policyname='autenticados escrevem tokio_detalhe_comissao') then
    create policy "autenticados escrevem tokio_detalhe_comissao" on public.tokio_detalhe_comissao for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- ─── Sinistros: campos extras ──────────────────────────────
alter table public.tokio_sinistros
  add column if not exists tipo_seguro       text,
  add column if not exists num_proposta      text,
  add column if not exists tp_pessoa         text,
  add column if not exists email             text,
  add column if not exists ddd               text,
  add column if not exists telefone          text,
  add column if not exists data_comunicacao  date,
  add column if not exists data_abertura     date,
  add column if not exists data_pagamento    date,
  add column if not exists local_ocorrencia  text,
  add column if not exists uf_ocorrencia     text,
  add column if not exists cidade_ocorrencia text,
  add column if not exists cep_ocorrencia    text,
  add column if not exists fase              text,
  add column if not exists grupo_causa       text,
  add column if not exists vlr_franquia      numeric(14,2),
  add column if not exists vlr_pagamento     numeric(14,2),
  add column if not exists vlr_despesas      numeric(14,2),
  add column if not exists placa             text,
  add column if not exists chassi            text,
  add column if not exists modelo            text,
  add column if not exists fabricante        text,
  add column if not exists ano_modelo        text,
  add column if not exists regulador         text,
  add column if not exists vistoriador       text,
  add column if not exists nr_protocolo      text,
  add column if not exists observacao        text,
  add column if not exists cd_corretor       text,
  add column if not exists nm_corretor       text;

-- ─── Renovações: campos extras ─────────────────────────────
alter table public.tokio_renovacoes
  add column if not exists tipo_seguro          text,
  add column if not exists tp_pessoa            text,
  add column if not exists email                text,
  add column if not exists telefone             text,
  add column if not exists vigencia_ini_atual   date,
  add column if not exists vigencia_fim_atual   date,
  add column if not exists data_emissao         date,
  add column if not exists pc_comissao          numeric(8,4),
  add column if not exists vlr_comissao         numeric(14,2),
  add column if not exists qtd_parcelas         int,
  add column if not exists forma_pagamento      text,
  add column if not exists situacao_renovacao   text,
  add column if not exists placa                text,
  add column if not exists chassi               text,
  add column if not exists modelo               text,
  add column if not exists fabricante           text,
  add column if not exists ano_modelo           text,
  add column if not exists observacao           text,
  add column if not exists cd_corretor          text,
  add column if not exists nm_corretor          text;

-- ─── Pendências: campos extras ─────────────────────────────
alter table public.tokio_pendencias
  add column if not exists tipo_seguro       text,
  add column if not exists tp_pessoa         text,
  add column if not exists email             text,
  add column if not exists telefone          text,
  add column if not exists data_vencimento   date,
  add column if not exists responsavel       text,
  add column if not exists area_responsavel  text,
  add column if not exists prioridade        text,
  add column if not exists observacao        text,
  add column if not exists cd_corretor       text,
  add column if not exists nm_corretor       text;

-- ─── Recusas: campos extras ────────────────────────────────
alter table public.tokio_recusas
  add column if not exists tipo_seguro          text,
  add column if not exists tp_pessoa            text,
  add column if not exists email                text,
  add column if not exists telefone             text,
  add column if not exists data_solicitacao     date,
  add column if not exists codigo_motivo        text,
  add column if not exists descricao_motivo     text,
  add column if not exists area_recusante       text,
  add column if not exists status_recusa        text,
  add column if not exists cd_corretor          text,
  add column if not exists nm_corretor          text;
