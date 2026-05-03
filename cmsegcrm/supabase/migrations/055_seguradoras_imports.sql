-- ─────────────────────────────────────────────────────────────
-- 055_seguradoras_imports.sql
-- Tabelas de staging para o módulo "Seguradoras":
-- cada seguradora pode importar Apólices, Sinistros, Inadimplência
-- e Comissões. Os dados ficam em staging e o botão "Sincronizar"
-- processa os pendentes, criando/atualizando apólices, negócios em
-- funis (Cobrança/Sinistro), comissões e histórico do cliente.
-- ─────────────────────────────────────────────────────────────

-- Audit log dos uploads (1 registro por arquivo enviado)
create table if not exists public.seg_importacoes (
  id              uuid primary key default uuid_generate_v4(),
  seguradora_id   uuid not null references public.seguradoras(id) on delete cascade,
  user_id         uuid references public.users(id),
  tipo            text not null check (tipo in ('apolices','sinistros','inadimplencia','comissoes')),
  formato         text not null check (formato in ('xlsx','csv','pdf')),
  nome_arquivo    text,
  qtd_linhas      int default 0,
  qtd_pendentes   int default 0,
  qtd_sincronizadas int default 0,
  qtd_erros       int default 0,
  iniciado_em     timestamptz default now(),
  concluido_em    timestamptz
);
create index if not exists idx_seg_imp_seg  on public.seg_importacoes(seguradora_id);
create index if not exists idx_seg_imp_tipo on public.seg_importacoes(tipo);

-- Staging: APÓLICES
create table if not exists public.seg_stage_apolices (
  id              uuid primary key default uuid_generate_v4(),
  seguradora_id   uuid not null references public.seguradoras(id) on delete cascade,
  importacao_id   uuid references public.seg_importacoes(id) on delete set null,
  numero          text,
  cpf_cnpj        text,
  cliente_nome    text,
  produto         text,
  premio          numeric(14,2),
  comissao_pct    numeric(8,4),
  vigencia_ini    date,
  vigencia_fim    date,
  placa           text,
  status_apolice  text,
  dados           jsonb,
  status          text not null default 'pendente'
                  check (status in ('pendente','sincronizado','erro')),
  erro_msg        text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  apolice_id      uuid references public.apolices(id) on delete set null,
  created_at      timestamptz default now(),
  sincronizado_em timestamptz
);
create index if not exists idx_seg_stage_apo_seg on public.seg_stage_apolices(seguradora_id);
create index if not exists idx_seg_stage_apo_st  on public.seg_stage_apolices(status);
create index if not exists idx_seg_stage_apo_num on public.seg_stage_apolices(numero);

-- Staging: SINISTROS
create table if not exists public.seg_stage_sinistros (
  id              uuid primary key default uuid_generate_v4(),
  seguradora_id   uuid not null references public.seguradoras(id) on delete cascade,
  importacao_id   uuid references public.seg_importacoes(id) on delete set null,
  numero_sinistro text,
  numero_apolice  text,
  cpf_cnpj        text,
  cliente_nome    text,
  data_aviso      date,
  data_ocorrencia date,
  data_encerramento date,
  valor_indenizacao numeric(14,2),
  causa           text,
  situacao        text,
  dados           jsonb,
  status          text not null default 'pendente'
                  check (status in ('pendente','sincronizado','erro')),
  erro_msg        text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  apolice_id      uuid references public.apolices(id) on delete set null,
  negocio_id      uuid references public.negocios(id) on delete set null,
  created_at      timestamptz default now(),
  sincronizado_em timestamptz
);
create index if not exists idx_seg_stage_sin_seg on public.seg_stage_sinistros(seguradora_id);
create index if not exists idx_seg_stage_sin_st  on public.seg_stage_sinistros(status);
create index if not exists idx_seg_stage_sin_apo on public.seg_stage_sinistros(numero_apolice);

-- Staging: INADIMPLÊNCIA
create table if not exists public.seg_stage_inadimplencia (
  id              uuid primary key default uuid_generate_v4(),
  seguradora_id   uuid not null references public.seguradoras(id) on delete cascade,
  importacao_id   uuid references public.seg_importacoes(id) on delete set null,
  numero_apolice  text,
  cpf_cnpj        text,
  cliente_nome    text,
  parcela         int,
  vencimento      date,
  valor           numeric(14,2),
  dias_atraso     int,
  dados           jsonb,
  status          text not null default 'pendente'
                  check (status in ('pendente','sincronizado','erro')),
  erro_msg        text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  apolice_id      uuid references public.apolices(id) on delete set null,
  negocio_id      uuid references public.negocios(id) on delete set null,
  created_at      timestamptz default now(),
  sincronizado_em timestamptz
);
create index if not exists idx_seg_stage_inad_seg on public.seg_stage_inadimplencia(seguradora_id);
create index if not exists idx_seg_stage_inad_st  on public.seg_stage_inadimplencia(status);
create index if not exists idx_seg_stage_inad_apo on public.seg_stage_inadimplencia(numero_apolice);

-- Staging: COMISSÕES
create table if not exists public.seg_stage_comissoes (
  id              uuid primary key default uuid_generate_v4(),
  seguradora_id   uuid not null references public.seguradoras(id) on delete cascade,
  importacao_id   uuid references public.seg_importacoes(id) on delete set null,
  numero_apolice  text,
  cpf_cnpj        text,
  cliente_nome    text,
  produto         text,
  competencia     text,
  data_pagamento  date,
  parcela         int,
  total_parcelas  int,
  premio          numeric(14,2),
  comissao_pct    numeric(8,4),
  comissao_valor  numeric(14,2),
  dados           jsonb,
  status          text not null default 'pendente'
                  check (status in ('pendente','sincronizado','erro')),
  erro_msg        text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  apolice_id      uuid references public.apolices(id) on delete set null,
  comissao_id     uuid references public.comissoes_recebidas(id) on delete set null,
  created_at      timestamptz default now(),
  sincronizado_em timestamptz
);
create index if not exists idx_seg_stage_com_seg on public.seg_stage_comissoes(seguradora_id);
create index if not exists idx_seg_stage_com_st  on public.seg_stage_comissoes(status);
create index if not exists idx_seg_stage_com_apo on public.seg_stage_comissoes(numero_apolice);

-- ── RLS ──────────────────────────────────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'seg_importacoes','seg_stage_apolices','seg_stage_sinistros',
    'seg_stage_inadimplencia','seg_stage_comissoes'
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
