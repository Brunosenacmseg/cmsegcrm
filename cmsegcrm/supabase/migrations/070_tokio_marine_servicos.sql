-- ─────────────────────────────────────────────────────────────
-- 070_tokio_marine_servicos.sql
-- Tabelas de destino dos serviços do webservice Tokio Marine
-- além dos já cobertos (Apólice, Parcela, Extrato → 046):
--   • Sinistro    → public.tokio_sinistros
--   • Renovação   → public.tokio_renovacoes
--   • Pendência   → public.tokio_pendencias
--   • Recusa      → public.tokio_recusas
-- Cada tabela guarda os campos principais já normalizados +
-- jsonb `dados_brutos` com o XML inteiro do registro.
-- ─────────────────────────────────────────────────────────────

-- Sinistro
create table if not exists public.tokio_sinistros (
  id                uuid primary key default uuid_generate_v4(),
  numero_sinistro   text,
  numero_apolice    text,
  numero_endosso    text,
  ramo              text,
  produto           text,
  cpf_cnpj          text,
  nome_segurado     text,
  data_aviso        date,
  data_ocorrencia   date,
  data_encerramento date,
  situacao          text,
  causa             text,
  valor_indenizacao numeric(14,2),
  valor_reserva     numeric(14,2),
  apolice_id        uuid references public.apolices(id) on delete set null,
  cliente_id        uuid references public.clientes(id) on delete set null,
  importacao_id     uuid references public.importacoes_tokio(id) on delete set null,
  dados_brutos      jsonb,
  criado_em         timestamptz default now(),
  unique (numero_sinistro)
);
create index if not exists idx_tokio_sin_apolice on public.tokio_sinistros(numero_apolice);
create index if not exists idx_tokio_sin_cpf     on public.tokio_sinistros(cpf_cnpj);
create index if not exists idx_tokio_sin_cliente on public.tokio_sinistros(cliente_id);

alter table public.tokio_sinistros enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tokio_sinistros' and policyname='autenticados leem tokio_sinistros') then
    create policy "autenticados leem tokio_sinistros" on public.tokio_sinistros for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='tokio_sinistros' and policyname='autenticados escrevem tokio_sinistros') then
    create policy "autenticados escrevem tokio_sinistros" on public.tokio_sinistros for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- Renovação
create table if not exists public.tokio_renovacoes (
  id                uuid primary key default uuid_generate_v4(),
  numero_apolice    text,
  numero_proposta   text,
  numero_renovacao  text,
  ramo              text,
  produto           text,
  cpf_cnpj          text,
  nome_segurado     text,
  vigencia_ini      date,
  vigencia_fim      date,
  data_renovacao    date,
  premio_atual      numeric(14,2),
  premio_renovacao  numeric(14,2),
  status_renovacao  text,
  apolice_id        uuid references public.apolices(id) on delete set null,
  cliente_id        uuid references public.clientes(id) on delete set null,
  importacao_id     uuid references public.importacoes_tokio(id) on delete set null,
  dados_brutos      jsonb,
  criado_em         timestamptz default now(),
  unique (numero_apolice, vigencia_fim)
);
create index if not exists idx_tokio_ren_apolice on public.tokio_renovacoes(numero_apolice);
create index if not exists idx_tokio_ren_cpf     on public.tokio_renovacoes(cpf_cnpj);
create index if not exists idx_tokio_ren_cliente on public.tokio_renovacoes(cliente_id);

alter table public.tokio_renovacoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tokio_renovacoes' and policyname='autenticados leem tokio_renovacoes') then
    create policy "autenticados leem tokio_renovacoes" on public.tokio_renovacoes for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='tokio_renovacoes' and policyname='autenticados escrevem tokio_renovacoes') then
    create policy "autenticados escrevem tokio_renovacoes" on public.tokio_renovacoes for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- Pendência
create table if not exists public.tokio_pendencias (
  id                uuid primary key default uuid_generate_v4(),
  numero_apolice    text,
  numero_proposta   text,
  numero_endosso    text,
  ramo              text,
  produto           text,
  cpf_cnpj          text,
  nome_segurado     text,
  tipo_pendencia    text,
  descricao         text,
  data_abertura     date,
  data_limite       date,
  data_resolucao    date,
  situacao          text,
  apolice_id        uuid references public.apolices(id) on delete set null,
  cliente_id        uuid references public.clientes(id) on delete set null,
  importacao_id     uuid references public.importacoes_tokio(id) on delete set null,
  dados_brutos      jsonb,
  criado_em         timestamptz default now()
);
create index if not exists idx_tokio_pend_apolice on public.tokio_pendencias(numero_apolice);
create index if not exists idx_tokio_pend_proposta on public.tokio_pendencias(numero_proposta);
create index if not exists idx_tokio_pend_cpf     on public.tokio_pendencias(cpf_cnpj);
create index if not exists idx_tokio_pend_cliente on public.tokio_pendencias(cliente_id);

alter table public.tokio_pendencias enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tokio_pendencias' and policyname='autenticados leem tokio_pendencias') then
    create policy "autenticados leem tokio_pendencias" on public.tokio_pendencias for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='tokio_pendencias' and policyname='autenticados escrevem tokio_pendencias') then
    create policy "autenticados escrevem tokio_pendencias" on public.tokio_pendencias for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- Recusa (proposta recusada / apólice não emitida)
create table if not exists public.tokio_recusas (
  id                uuid primary key default uuid_generate_v4(),
  numero_proposta   text,
  numero_apolice    text,
  numero_endosso    text,
  ramo              text,
  produto           text,
  cpf_cnpj          text,
  nome_segurado     text,
  data_recusa       date,
  motivo_recusa     text,
  observacao        text,
  cliente_id        uuid references public.clientes(id) on delete set null,
  importacao_id     uuid references public.importacoes_tokio(id) on delete set null,
  dados_brutos      jsonb,
  criado_em         timestamptz default now()
);
create index if not exists idx_tokio_rec_proposta on public.tokio_recusas(numero_proposta);
create index if not exists idx_tokio_rec_apolice  on public.tokio_recusas(numero_apolice);
create index if not exists idx_tokio_rec_cpf      on public.tokio_recusas(cpf_cnpj);
create index if not exists idx_tokio_rec_cliente  on public.tokio_recusas(cliente_id);

alter table public.tokio_recusas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tokio_recusas' and policyname='autenticados leem tokio_recusas') then
    create policy "autenticados leem tokio_recusas" on public.tokio_recusas for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='tokio_recusas' and policyname='autenticados escrevem tokio_recusas') then
    create policy "autenticados escrevem tokio_recusas" on public.tokio_recusas for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- Estende o check de tipo_arquivo de importacoes_tokio (era texto livre).
-- Mantemos como text para flexibilidade futura.
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='importacoes_tokio') then
    -- nada a fazer, coluna já é text
    null;
  end if;
end $$;
