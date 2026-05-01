-- ─────────────────────────────────────────────────────────────
-- 018_meta_conversions.sql
-- Meta Conversions API (CRM Events) — envia eventos quando o status
-- ou etapa de uma negociação muda, pra alimentar o conjunto de dados
-- da Meta com Lead/MQL/SQL/Customer e melhorar otimização de
-- anúncios.
--
-- A) meta_config ganha dataset_id (pixel/dataset onde os eventos vão)
-- B) meta_evento_log: histórico de eventos enviados (pra debug)
-- C) negocios.meta_lead_id já existe (de 011) — usado aqui pra
--    matching com a Meta (lead_id de 15-17 dígitos).
-- ─────────────────────────────────────────────────────────────

alter table public.meta_config
  add column if not exists dataset_id text;

create table if not exists public.meta_eventos_log (
  id            uuid primary key default uuid_generate_v4(),
  negocio_id    uuid references public.negocios(id) on delete set null,
  cliente_id    uuid references public.clientes(id) on delete set null,
  event_name    text not null,         -- Lead, MQL, SQL, Customer, ...
  event_time    bigint not null,
  payload       jsonb,                 -- corpo enviado (sem hash reverso)
  resposta      jsonb,                 -- resposta da Meta
  status        text default 'enviado' check (status in ('enviado','erro','teste')),
  erro_msg      text,
  enviado_por   uuid references public.users(id),
  enviado_em    timestamptz default now()
);

create index if not exists idx_meta_eventos_log_negocio on public.meta_eventos_log(negocio_id, enviado_em desc);
create index if not exists idx_meta_eventos_log_event   on public.meta_eventos_log(event_name, enviado_em desc);

alter table public.meta_eventos_log enable row level security;

drop policy if exists "admin_le_meta_eventos_log" on public.meta_eventos_log;
create policy "admin_le_meta_eventos_log" on public.meta_eventos_log for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "admin_escreve_meta_eventos_log" on public.meta_eventos_log;
create policy "admin_escreve_meta_eventos_log" on public.meta_eventos_log for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- Mapeamento etapa → event_name (opcional, admin configura). Quando
-- existe um match, mover negocio para essa etapa dispara um evento
-- com esse event_name.
create table if not exists public.meta_eventos_mapping (
  id            uuid primary key default uuid_generate_v4(),
  funil_id      uuid references public.funis(id) on delete cascade,
  etapa         text not null,
  event_name    text not null,         -- Lead, MQL, SQL, Customer, etc
  ativo         boolean default true,
  unique (funil_id, etapa)
);

alter table public.meta_eventos_mapping enable row level security;

drop policy if exists "admin_meta_eventos_mapping" on public.meta_eventos_mapping;
create policy "admin_meta_eventos_mapping" on public.meta_eventos_mapping for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
