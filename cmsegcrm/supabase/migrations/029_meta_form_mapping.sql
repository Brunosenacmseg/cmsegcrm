-- ═══════════════════════════════════════════════════════════════════
-- Migration 029 — Meta Lead Ads: mapeamento de formulário → funil/vendedor
-- ═══════════════════════════════════════════════════════════════════
-- Para cada formulário de Lead Ads do Meta, definimos em qual funil
-- (e etapa inicial) o lead vira negociação, e qual vendedor recebe.

create table if not exists public.meta_form_mapeamento (
  id            uuid primary key default uuid_generate_v4(),
  form_id       text unique not null,
  form_nome     text,
  page_id       text,
  funil_id      uuid references public.funis(id) on delete set null,
  etapa         text,
  vendedor_id   uuid references public.users(id) on delete set null,
  ativo         boolean not null default true,
  criar_negocio boolean not null default true,
  observacoes   text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_meta_form_mapeamento_ativo
  on public.meta_form_mapeamento (ativo);

alter table public.meta_form_mapeamento enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename='meta_form_mapeamento' and policyname='auth_read_meta_form_map'
  ) then
    create policy "auth_read_meta_form_map" on public.meta_form_mapeamento
      for select using (auth.role() = 'authenticated');
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename='meta_form_mapeamento' and policyname='admin_write_meta_form_map'
  ) then
    create policy "admin_write_meta_form_map" on public.meta_form_mapeamento
      for all using (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;
end $$;

-- Adiciona o vendedor responsável diretamente no lead Meta (auditoria)
alter table public.meta_leads
  add column if not exists vendedor_id uuid references public.users(id) on delete set null;
