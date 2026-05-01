-- ─────────────────────────────────────────────────────────────
-- 021_autentique.sql
-- Integração com Autentique (assinatura digital).
--
-- A) Tabela `assinaturas`: 1 registro por documento que mandamos
--    pra assinar. Vinculado opcionalmente a negocio/apolice/cliente.
-- B) Tabela `assinaturas_signatarios`: cada email/CPF que precisa
--    assinar o documento, com status individual.
-- C) Token AUTENTIQUE_TOKEN é variável de ambiente — NUNCA no DB.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.assinaturas (
  id              uuid primary key default uuid_generate_v4(),
  autentique_id   text unique,                 -- ID do documento na Autentique
  nome_documento  text not null,
  arquivo_url     text,                        -- URL do PDF original (Storage)
  arquivo_nome    text,
  pasta           text,                        -- pasta na Autentique (opcional)
  status          text not null default 'pendente'
                  check (status in ('pendente','enviado','assinado','recusado','expirado','cancelado','erro')),
  url_assinatura  text,                        -- URL pública pra abrir/assinar
  url_pdf_final   text,                        -- URL do PDF assinado (após concluído)
  total_signatarios int default 0,
  total_assinados   int default 0,
  negocio_id      uuid references public.negocios(id) on delete set null,
  apolice_id      uuid references public.apolices(id) on delete set null,
  cliente_id      uuid references public.clientes(id) on delete set null,
  enviado_por     uuid references public.users(id),
  obs             text,
  payload_resposta jsonb,                      -- resposta crua da API
  criado_em       timestamptz default now(),
  atualizado_em   timestamptz default now(),
  concluido_em    timestamptz
);

create index if not exists idx_assinaturas_negocio  on public.assinaturas(negocio_id);
create index if not exists idx_assinaturas_apolice  on public.assinaturas(apolice_id);
create index if not exists idx_assinaturas_cliente  on public.assinaturas(cliente_id);
create index if not exists idx_assinaturas_status   on public.assinaturas(status);

create table if not exists public.assinaturas_signatarios (
  id              uuid primary key default uuid_generate_v4(),
  assinatura_id   uuid not null references public.assinaturas(id) on delete cascade,
  autentique_id   text,                        -- ID do signatário na Autentique
  nome            text,
  email           text,
  cpf             text,
  funcao          text default 'sign',         -- sign | witness | approve
  status          text default 'pendente'
                  check (status in ('pendente','assinado','recusado','expirado')),
  link_assinatura text,                        -- link individual de assinatura
  assinado_em     timestamptz,
  criado_em       timestamptz default now()
);

create index if not exists idx_assin_signs_assin on public.assinaturas_signatarios(assinatura_id);
create index if not exists idx_assin_signs_email on public.assinaturas_signatarios(email);

-- RLS
alter table public.assinaturas             enable row level security;
alter table public.assinaturas_signatarios enable row level security;

drop policy if exists "auth_le_assinaturas" on public.assinaturas;
create policy "auth_le_assinaturas" on public.assinaturas for select using (auth.role() = 'authenticated');
drop policy if exists "auth_escreve_assinaturas" on public.assinaturas;
create policy "auth_escreve_assinaturas" on public.assinaturas for all using (auth.role() = 'authenticated');

drop policy if exists "auth_le_assin_signs" on public.assinaturas_signatarios;
create policy "auth_le_assin_signs" on public.assinaturas_signatarios for select using (auth.role() = 'authenticated');
drop policy if exists "auth_escreve_assin_signs" on public.assinaturas_signatarios;
create policy "auth_escreve_assin_signs" on public.assinaturas_signatarios for all using (auth.role() = 'authenticated');

drop trigger if exists assinaturas_atualizado_em on public.assinaturas;
create or replace function public.update_atualizado_em()
returns trigger as $$ begin new.atualizado_em = now(); return new; end; $$ language plpgsql;
create trigger assinaturas_atualizado_em
  before update on public.assinaturas
  for each row execute procedure public.update_atualizado_em();
