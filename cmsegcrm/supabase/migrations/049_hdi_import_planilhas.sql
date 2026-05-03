-- ─────────────────────────────────────────────────────────────
-- 049_hdi_import_planilhas.sql
-- Tabelas para a importação de planilhas (XLS/XLSX/CSV) da HDI:
--   * Comissões (emitidas + pagas)
--   * Inadimplência
--
-- Mesmo padrão da Allianz: campos normalizados + JSONB `dados`
-- com a linha bruta para não perder informação.
-- ─────────────────────────────────────────────────────────────

-- Audit log de cada upload
create table if not exists public.hdi_importacoes (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references public.users(id),
  nome_arquivo    text,
  tipo            text not null check (tipo in (
                    'comissoes_emitidas','comissoes_pagas','inadimplencia'
                  )),
  qtd_lidos       int default 0,
  qtd_criados     int default 0,
  qtd_atualizados int default 0,
  qtd_erros       int default 0,
  erros           jsonb default '[]'::jsonb,
  iniciado_em     timestamptz default now(),
  concluido_em    timestamptz
);
create index if not exists idx_hdi_imp_user on public.hdi_importacoes(user_id);
create index if not exists idx_hdi_imp_tipo on public.hdi_importacoes(tipo);

-- Comissões (emitidas + pagas)
create table if not exists public.hdi_comissoes (
  id              uuid primary key default uuid_generate_v4(),
  tipo            text not null check (tipo in ('emitida','paga')),
  numero_apolice  text,
  numero_proposta text,
  endosso         text,
  parcela         int,
  cliente_nome    text,
  cpf_cnpj        text,
  ramo            text,
  produto         text,
  data_emissao    date,
  data_pagamento  date,
  competencia     text,
  premio          numeric(14,2),
  comissao_pct    numeric(8,4),
  comissao_valor  numeric(14,2),
  cliente_id      uuid references public.clientes(id) on delete set null,
  apolice_id      uuid references public.apolices(id) on delete set null,
  importacao_id   uuid references public.hdi_importacoes(id) on delete set null,
  dados           jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists idx_hdi_com_apolice on public.hdi_comissoes(numero_apolice);
create index if not exists idx_hdi_com_tipo    on public.hdi_comissoes(tipo);
create index if not exists idx_hdi_com_comp    on public.hdi_comissoes(competencia);

-- Inadimplência
create table if not exists public.hdi_inadimplencia (
  id              uuid primary key default uuid_generate_v4(),
  numero_apolice  text,
  numero_proposta text,
  parcela         int,
  cliente_nome    text,
  cpf_cnpj        text,
  vencimento      date,
  valor           numeric(14,2),
  dias_atraso     int,
  ramo            text,
  forma_pagamento text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  apolice_id      uuid references public.apolices(id) on delete set null,
  importacao_id   uuid references public.hdi_importacoes(id) on delete set null,
  dados           jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (numero_apolice, parcela, vencimento)
);
create index if not exists idx_hdi_inad_apolice on public.hdi_inadimplencia(numero_apolice);
create index if not exists idx_hdi_inad_cpf     on public.hdi_inadimplencia(cpf_cnpj);

-- RLS — autenticados leem/escrevem
do $$
declare t text;
begin
  for t in select unnest(array[
    'hdi_importacoes','hdi_comissoes','hdi_inadimplencia'
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
