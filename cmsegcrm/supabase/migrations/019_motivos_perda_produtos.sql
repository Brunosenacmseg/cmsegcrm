-- ─────────────────────────────────────────────────────────────
-- 019_motivos_perda_produtos.sql
-- A) Tabela de motivos de perda — admin gerencia, todos selecionam
-- B) Tabela de produtos — admin gerencia, todos selecionam
-- C) Ambos suportam vincular ao RD Station via rd_id, pra sync
--    importar do RD CRM existente sem duplicar.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.motivos_perda (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  descricao   text,
  ativo       boolean default true,
  ordem       int default 0,
  rd_id       text,
  criado_por  uuid references public.users(id),
  criado_em   timestamptz default now()
);
create unique index if not exists motivos_perda_rd_id_idx on public.motivos_perda(rd_id) where rd_id is not null;
create unique index if not exists motivos_perda_nome_idx  on public.motivos_perda(lower(nome));

create table if not exists public.produtos (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  descricao   text,
  preco_base  numeric(12,2),
  ativo       boolean default true,
  rd_id       text,
  criado_por  uuid references public.users(id),
  criado_em   timestamptz default now()
);
create unique index if not exists produtos_rd_id_idx on public.produtos(rd_id) where rd_id is not null;
create unique index if not exists produtos_nome_idx  on public.produtos(lower(nome));

alter table public.motivos_perda enable row level security;
alter table public.produtos      enable row level security;

-- Leitura: qualquer autenticado (corretor precisa ler pra mostrar
-- no dropdown ao marcar perdido / criar negociação)
drop policy if exists "auth_le_motivos_perda" on public.motivos_perda;
create policy "auth_le_motivos_perda" on public.motivos_perda for select using (auth.role() = 'authenticated');
drop policy if exists "admin_escreve_motivos_perda" on public.motivos_perda;
create policy "admin_escreve_motivos_perda" on public.motivos_perda for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "auth_le_produtos" on public.produtos;
create policy "auth_le_produtos" on public.produtos for select using (auth.role() = 'authenticated');
drop policy if exists "admin_escreve_produtos" on public.produtos;
create policy "admin_escreve_produtos" on public.produtos for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- Negociações ganham FK opcional pra motivo_perda (continua existindo
-- a coluna text "motivo_perda" pra compat com import antigo do RD)
alter table public.negocios
  add column if not exists motivo_perda_id uuid references public.motivos_perda(id) on delete set null;
create index if not exists idx_negocios_motivo_perda_id on public.negocios(motivo_perda_id);
