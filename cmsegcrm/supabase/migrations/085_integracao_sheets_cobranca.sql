-- ─────────────────────────────────────────────────────────────
-- 083_integracao_sheets_cobranca.sql
-- Integração: Google Sheets → Funil Cobrança.
-- Cada linha nova na planilha vira uma negociação no funil cobrança
-- via webhook (POST /api/integracoes/sheets-cobranca/webhook).
--
-- Tabelas:
--   integracao_sheets_cobranca       (config singleton id=1)
--   integracao_sheets_cobranca_logs  (auditoria de cada linha recebida)
-- ─────────────────────────────────────────────────────────────

-- Garante que existe pelo menos um funil de cobrança. Em bases que
-- foram criadas antes do seed do 001 (ou onde o admin apagou), recria.
insert into public.funis (nome, tipo, emoji, cor, etapas, ordem)
select 'Cobrança', 'cobranca', '💰', '#e05252',
       ARRAY['Em Atraso','Contato Realizado','Promessa de Pagamento','Pago','Inadimplente'],
       3
where not exists (select 1 from public.funis where tipo = 'cobranca');

-- Config singleton
create table if not exists public.integracao_sheets_cobranca (
  id              int primary key default 1 check (id = 1),
  ativo           boolean not null default false,
  webhook_token   text,                                 -- segredo enviado pelo Apps Script
  funil_id        uuid references public.funis(id),    -- por padrão, primeiro funil cobranca
  etapa_padrao    text,                                 -- por padrão, primeira etapa do funil
  vendedor_padrao_id uuid references public.users(id), -- corretor responsável (opcional)
  spreadsheet_id  text,                                 -- info da planilha (apenas referência)
  spreadsheet_url text,
  ultima_execucao timestamptz,
  total_recebidos int not null default 0,
  total_criados   int not null default 0,
  configurado_por uuid references public.users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Log/auditoria de cada linha recebida (também serve para idempotência)
create table if not exists public.integracao_sheets_cobranca_logs (
  id              uuid primary key default uuid_generate_v4(),
  external_id     text,                                  -- row_id da planilha (sheet+linha)
  payload         jsonb not null,                        -- linha recebida do Sheets
  status          text not null default 'ok'             -- 'ok' | 'erro' | 'duplicado'
                  check (status in ('ok','erro','duplicado')),
  erro            text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  negocio_id      uuid references public.negocios(id) on delete set null,
  created_at      timestamptz default now()
);

create unique index if not exists idx_int_sheets_cob_logs_extid
  on public.integracao_sheets_cobranca_logs(external_id)
  where external_id is not null;
create index if not exists idx_int_sheets_cob_logs_created
  on public.integracao_sheets_cobranca_logs(created_at desc);

-- RLS — apenas admin pode ler/alterar pela UI; o webhook usa service_role.
alter table public.integracao_sheets_cobranca       enable row level security;
alter table public.integracao_sheets_cobranca_logs  enable row level security;

drop policy if exists "admin_all_int_sheets_cobranca" on public.integracao_sheets_cobranca;
create policy "admin_all_int_sheets_cobranca"
  on public.integracao_sheets_cobranca
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "admin_all_int_sheets_cobranca_logs" on public.integracao_sheets_cobranca_logs;
create policy "admin_all_int_sheets_cobranca_logs"
  on public.integracao_sheets_cobranca_logs
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Pré-popula a singleton apontando pro funil cobrança padrão
insert into public.integracao_sheets_cobranca (id, ativo, funil_id, etapa_padrao)
select 1, false, f.id, f.etapas[1]
  from public.funis f
 where f.tipo = 'cobranca'
 order by f.ordem nulls last
 limit 1
on conflict (id) do nothing;
