-- ─────────────────────────────────────────────────────────────
-- 046_allianz_integracao.sql
-- Tabelas para a integração Allianz (importação de relatórios em XLS)
--
-- Cobre:
--   - Sinistros (Avisados + Encerrados)
--   - Inadimplência
--   - Comissões (Emitidas + Pagas)
--   - Parcelas Emitidas
--   - Propostas Pendentes
--   - Apólices (Emitidas + Renovadas)
--
-- A planilha original é grande e o nome das colunas varia entre relatórios,
-- então cada tabela guarda os campos principais já normalizados + um JSONB
-- `dados` com a linha bruta inteira pra não perder nada.
-- ─────────────────────────────────────────────────────────────

-- Audit log de cada upload (zip ou planilha avulsa)
create table if not exists public.allianz_importacoes (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references public.users(id),
  nome_arquivo    text,
  tipo            text not null check (tipo in (
                    'sinistros_avisados','sinistros_encerrados',
                    'inadimplencia',
                    'comissoes_emitidas','comissoes_pagas',
                    'parcelas_emitidas',
                    'propostas_pendentes',
                    'apolices_emitidas','apolices_renovadas'
                  )),
  qtd_lidos       int default 0,
  qtd_criados     int default 0,
  qtd_atualizados int default 0,
  qtd_erros       int default 0,
  erros           jsonb default '[]'::jsonb,
  iniciado_em     timestamptz default now(),
  concluido_em    timestamptz
);
create index if not exists idx_allianz_imp_user on public.allianz_importacoes(user_id);
create index if not exists idx_allianz_imp_tipo on public.allianz_importacoes(tipo);

-- Sinistros (avisados + encerrados em uma só tabela com flag status)
create table if not exists public.allianz_sinistros (
  id              uuid primary key default uuid_generate_v4(),
  status          text not null check (status in ('avisado','encerrado')),
  numero_sinistro text,
  numero_apolice  text,
  ramo            text,
  cliente_nome    text,
  cpf_cnpj        text,
  data_aviso      date,
  data_ocorrencia date,
  data_encerramento date,
  valor_indenizacao numeric(14,2),
  valor_reserva   numeric(14,2),
  causa           text,
  situacao        text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  apolice_id      uuid references public.apolices(id) on delete set null,
  importacao_id   uuid references public.allianz_importacoes(id) on delete set null,
  dados           jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (status, numero_sinistro)
);
create index if not exists idx_allianz_sin_apolice on public.allianz_sinistros(numero_apolice);
create index if not exists idx_allianz_sin_cpf     on public.allianz_sinistros(cpf_cnpj);

-- Inadimplência
create table if not exists public.allianz_inadimplencia (
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
  importacao_id   uuid references public.allianz_importacoes(id) on delete set null,
  dados           jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (numero_apolice, parcela, vencimento)
);
create index if not exists idx_allianz_inad_apolice on public.allianz_inadimplencia(numero_apolice);
create index if not exists idx_allianz_inad_cpf     on public.allianz_inadimplencia(cpf_cnpj);

-- Comissões (emitidas + pagas em uma só tabela com flag tipo)
create table if not exists public.allianz_comissoes (
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
  importacao_id   uuid references public.allianz_importacoes(id) on delete set null,
  dados           jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists idx_allianz_com_apolice on public.allianz_comissoes(numero_apolice);
create index if not exists idx_allianz_com_tipo    on public.allianz_comissoes(tipo);
create index if not exists idx_allianz_com_comp    on public.allianz_comissoes(competencia);

-- Parcelas emitidas
create table if not exists public.allianz_parcelas_emitidas (
  id              uuid primary key default uuid_generate_v4(),
  numero_apolice  text,
  numero_proposta text,
  parcela         int,
  total_parcelas  int,
  cliente_nome    text,
  cpf_cnpj        text,
  ramo            text,
  vencimento      date,
  valor           numeric(14,2),
  forma_pagamento text,
  status          text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  apolice_id      uuid references public.apolices(id) on delete set null,
  importacao_id   uuid references public.allianz_importacoes(id) on delete set null,
  dados           jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (numero_apolice, parcela)
);
create index if not exists idx_allianz_parc_apolice on public.allianz_parcelas_emitidas(numero_apolice);

-- Propostas pendentes
create table if not exists public.allianz_propostas_pendentes (
  id              uuid primary key default uuid_generate_v4(),
  numero_proposta text,
  cliente_nome    text,
  cpf_cnpj        text,
  ramo            text,
  produto         text,
  data_proposta   date,
  vigencia_ini    date,
  vigencia_fim    date,
  premio          numeric(14,2),
  situacao        text,
  pendencia       text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  importacao_id   uuid references public.allianz_importacoes(id) on delete set null,
  dados           jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (numero_proposta)
);

-- Apólices Allianz (emitidas + renovadas) — espelha o relatório bruto;
-- a tabela `apolices` principal é alimentada via match/upsert no import.
create table if not exists public.allianz_apolices_relatorio (
  id              uuid primary key default uuid_generate_v4(),
  tipo            text not null check (tipo in ('emitida','renovada')),
  numero_apolice  text,
  numero_proposta text,
  endosso         text,
  apolice_anterior text,
  cliente_nome    text,
  cpf_cnpj        text,
  ramo            text,
  produto         text,
  emissao         date,
  vigencia_ini    date,
  vigencia_fim    date,
  premio_liquido  numeric(14,2),
  premio_total    numeric(14,2),
  comissao_pct    numeric(8,4),
  comissao_valor  numeric(14,2),
  forma_pagamento text,
  qtd_parcelas    int,
  cliente_id      uuid references public.clientes(id) on delete set null,
  apolice_id      uuid references public.apolices(id) on delete set null,
  importacao_id   uuid references public.allianz_importacoes(id) on delete set null,
  dados           jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (tipo, numero_apolice)
);
create index if not exists idx_allianz_apol_apolice on public.allianz_apolices_relatorio(numero_apolice);
create index if not exists idx_allianz_apol_tipo    on public.allianz_apolices_relatorio(tipo);

-- ── RLS: leitura para autenticados, escrita só para admin ──
do $$
declare t text;
begin
  for t in select unnest(array[
    'allianz_importacoes','allianz_sinistros','allianz_inadimplencia',
    'allianz_comissoes','allianz_parcelas_emitidas',
    'allianz_propostas_pendentes','allianz_apolices_relatorio'
  ]) loop
    execute format('alter table public.%I enable row level security', t);

    if not exists (select 1 from pg_policies where tablename=t and policyname='auth_read_'||t) then
      execute format(
        'create policy %I on public.%I for select using (auth.role() = ''authenticated'')',
        'auth_read_'||t, t
      );
    end if;
    if not exists (select 1 from pg_policies where tablename=t and policyname='admin_write_'||t) then
      execute format(
        'create policy %I on public.%I for all using (public.current_user_role() = ''admin'') with check (public.current_user_role() = ''admin'')',
        'admin_write_'||t, t
      );
    end if;
  end loop;
end$$;

-- updated_at triggers
do $$
declare t text;
begin
  for t in select unnest(array[
    'allianz_sinistros','allianz_inadimplencia','allianz_comissoes',
    'allianz_parcelas_emitidas','allianz_propostas_pendentes',
    'allianz_apolices_relatorio'
  ]) loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_updated_at before update on public.%I for each row execute procedure update_updated_at()',
      t, t
    );
  end loop;
end$$;
