-- ─────────────────────────────────────────────────────────────
-- 072_seg_stage_propostas.sql
-- Adiciona suporte a importacao de PROPOSTAS no modulo Seguradoras.
-- Disponivel para TODAS as seguradoras (campo generico).
-- ─────────────────────────────────────────────────────────────

-- 1) Permite 'propostas' no enum de tipo de importacao
alter table public.seg_importacoes drop constraint if exists seg_importacoes_tipo_check;
alter table public.seg_importacoes add constraint seg_importacoes_tipo_check
  check (tipo in ('apolices','sinistros','inadimplencia','comissoes','propostas'));

-- 2) Staging: PROPOSTAS
create table if not exists public.seg_stage_propostas (
  id              uuid primary key default uuid_generate_v4(),
  seguradora_id   uuid not null references public.seguradoras(id) on delete cascade,
  importacao_id   uuid references public.seg_importacoes(id) on delete set null,
  numero_proposta text,
  numero_apolice  text,
  cpf_cnpj        text,
  cliente_nome    text,
  produto         text,
  ramo            text,
  premio          numeric(14,2),
  comissao_pct    numeric(8,4),
  vigencia_ini    date,
  vigencia_fim    date,
  data_proposta   date,
  data_emissao    date,
  placa           text,
  situacao        text,
  corretor_nome   text,
  corretor_susep  text,
  observacoes     text,
  dados           jsonb,
  status          text not null default 'pendente'
                  check (status in ('pendente','sincronizado','erro')),
  erro_msg        text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  apolice_id      uuid references public.apolices(id) on delete set null,
  negocio_id      uuid references public.negocios(id) on delete set null,
  cliente_criado_auto boolean default false,
  created_at      timestamptz default now(),
  sincronizado_em timestamptz
);
create index if not exists idx_seg_stage_prop_seg on public.seg_stage_propostas(seguradora_id);
create index if not exists idx_seg_stage_prop_st  on public.seg_stage_propostas(status);
create index if not exists idx_seg_stage_prop_num on public.seg_stage_propostas(numero_proposta);
create index if not exists idx_seg_stage_prop_apo on public.seg_stage_propostas(numero_apolice);

-- 3) RLS — mesmo padrao das outras tabelas de staging
alter table public.seg_stage_propostas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'seg_stage_propostas'
       and policyname = 'auth_read_seg_stage_propostas'
  ) then
    create policy auth_read_seg_stage_propostas
      on public.seg_stage_propostas
      for select using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
     where tablename = 'seg_stage_propostas'
       and policyname = 'admin_write_seg_stage_propostas'
  ) then
    create policy admin_write_seg_stage_propostas
      on public.seg_stage_propostas
      for all
      using (public.current_user_role() = 'admin')
      with check (public.current_user_role() = 'admin');
  end if;
end$$;
