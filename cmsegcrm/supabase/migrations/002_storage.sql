-- ═══════════════════════════════════════════
-- CM.segCRM — Migration 002: Storage de Arquivos
-- Execute no Supabase SQL Editor após a 001
-- ═══════════════════════════════════════════

-- ─── 1. TABELA DE ANEXOS ─────────────────────
create table if not exists public.anexos (
  id           uuid primary key default uuid_generate_v4(),
  bucket       text not null default 'cmsegcrm',
  path         text not null,
  nome_arquivo text not null,
  tipo_mime    text,
  tamanho_kb   int,
  categoria    text not null check (categoria in ('negocio','cliente','comissao','outro')),
  negocio_id   uuid references public.negocios(id)  on delete cascade,
  cliente_id   uuid references public.clientes(id)  on delete cascade,
  user_id      uuid references public.users(id),
  created_at   timestamptz default now()
);

-- ─── 2. TABELA DE IMPORTAÇÕES ────────────────
create table if not exists public.importacoes_comissao (
  id              uuid primary key default uuid_generate_v4(),
  nome_arquivo    text not null,
  competencia     text,
  total_importado numeric(12,2),
  qtd_registros   int,
  status          text default 'processado',
  anexo_id        uuid references public.anexos(id),
  user_id         uuid references public.users(id),
  created_at      timestamptz default now()
);

-- ─── 3. ROW LEVEL SECURITY ───────────────────
alter table public.anexos               enable row level security;
alter table public.importacoes_comissao enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='anexos' and policyname='autenticados leem anexos') then
    create policy "autenticados leem anexos" on public.anexos for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='anexos' and policyname='autenticados escrevem anexos') then
    create policy "autenticados escrevem anexos" on public.anexos for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='importacoes_comissao' and policyname='autenticados leem importacoes') then
    create policy "autenticados leem importacoes" on public.importacoes_comissao for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='importacoes_comissao' and policyname='autenticados escrevem importacoes') then
    create policy "autenticados escrevem importacoes" on public.importacoes_comissao for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- ─── 4. STORAGE BUCKET ───────────────────────
-- Faça manualmente no painel Supabase:
-- Storage → New Bucket → Nome: cmsegcrm → Public: DESATIVADO → Create
-- Depois: Storage → cmsegcrm → Policies → New Policy → authenticated para INSERT, SELECT e DELETE
