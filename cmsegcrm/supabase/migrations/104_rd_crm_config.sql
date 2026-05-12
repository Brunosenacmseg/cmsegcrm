-- ═══════════════════════════════════════════
-- RD Station CRM — Tabela de configuração do polling
-- (singleton row id=1). Já existe em produção; este
-- arquivo só formaliza o schema pra novos ambientes.
-- ═══════════════════════════════════════════

create table if not exists public.rd_crm_config (
  id            int primary key default 1,
  api_token     text not null,
  last_sync_at  timestamptz,
  ativo         boolean not null default true,
  observacao    text,
  updated_at    timestamptz not null default now(),
  criado_em     timestamptz not null default now(),
  constraint rd_crm_config_single_row check (id = 1)
);

alter table public.rd_crm_config enable row level security;

drop policy if exists "admins gerenciam rd_crm_config" on public.rd_crm_config;
create policy "admins gerenciam rd_crm_config" on public.rd_crm_config
  for all
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'admin'));

-- Permite o cron (service role bypass) e inserts anonimos pro caso de
-- service role nao estar disponivel.
drop policy if exists "permite update do polling" on public.rd_crm_config;
create policy "permite update do polling" on public.rd_crm_config
  for update using (true) with check (true);

-- ═══════════════════════════════════════════
-- rdstation_syncs: permite insert do cron (sem auth context).
-- ═══════════════════════════════════════════
drop policy if exists "permite insert de sync" on public.rdstation_syncs;
create policy "permite insert de sync" on public.rdstation_syncs
  for insert with check (true);
