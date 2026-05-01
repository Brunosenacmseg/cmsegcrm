-- ─────────────────────────────────────────────────────────────
-- 020_rd_crm_features.sql
-- Paridade com RD Station CRM — Fase 1:
--   A) Tags (etiquetas coloridas em negócios e clientes)
--   B) Origens / fontes de leads (deal_source no RD)
--   C) Negócio × Produtos (M2M com qtd, valor unitário, total)
--   D) Notas/Anotações em negócios (versionadas)
--   E) Drag-and-drop entre etapas usa só o etapa text — ok.
-- ─────────────────────────────────────────────────────────────

-- ─── A) TAGS ────────────────────────────────────────────────
create table if not exists public.tags (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  cor         text default '#c9a84c',
  rd_id       text,
  criado_em   timestamptz default now()
);
create unique index if not exists tags_nome_idx  on public.tags(lower(nome));
create unique index if not exists tags_rd_id_idx on public.tags(rd_id) where rd_id is not null;

create table if not exists public.negocio_tags (
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  tag_id     uuid not null references public.tags(id)     on delete cascade,
  primary key (negocio_id, tag_id)
);

create table if not exists public.cliente_tags (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tag_id     uuid not null references public.tags(id)     on delete cascade,
  primary key (cliente_id, tag_id)
);

-- ─── B) ORIGENS (deal sources) ──────────────────────────────
create table if not exists public.origens (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  rd_id       text,
  ativo       boolean default true,
  criado_em   timestamptz default now()
);
create unique index if not exists origens_nome_idx  on public.origens(lower(nome));
create unique index if not exists origens_rd_id_idx on public.origens(rd_id) where rd_id is not null;

alter table public.negocios
  add column if not exists origem_id uuid references public.origens(id) on delete set null;
create index if not exists idx_negocios_origem on public.negocios(origem_id);

-- ─── C) NEGOCIO × PRODUTOS (M2M com qtd e valor) ───────────
create table if not exists public.negocio_produtos (
  id             uuid primary key default uuid_generate_v4(),
  negocio_id     uuid not null references public.negocios(id) on delete cascade,
  produto_id     uuid references public.produtos(id) on delete set null,
  nome_snapshot  text not null,             -- guarda nome ainda que produto seja deletado
  quantidade     int not null default 1 check (quantidade > 0),
  valor_unit     numeric(12,2) not null default 0 check (valor_unit >= 0),
  desconto       numeric(12,2) default 0 check (desconto >= 0),
  observacao     text,
  criado_em      timestamptz default now()
);
create index if not exists idx_neg_produtos_neg on public.negocio_produtos(negocio_id);
create index if not exists idx_neg_produtos_prd on public.negocio_produtos(produto_id);

-- ─── D) NOTAS/Anotações em negócios ────────────────────────
create table if not exists public.negocio_notas (
  id          uuid primary key default uuid_generate_v4(),
  negocio_id  uuid not null references public.negocios(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  conteudo    text not null,
  criado_em   timestamptz default now()
);
create index if not exists idx_neg_notas_neg on public.negocio_notas(negocio_id, criado_em desc);

-- ─── RLS ────────────────────────────────────────────────────
alter table public.tags             enable row level security;
alter table public.negocio_tags     enable row level security;
alter table public.cliente_tags     enable row level security;
alter table public.origens          enable row level security;
alter table public.negocio_produtos enable row level security;
alter table public.negocio_notas    enable row level security;

drop policy if exists "auth_le_tags" on public.tags;
create policy "auth_le_tags" on public.tags for select using (auth.role() = 'authenticated');
drop policy if exists "auth_escreve_tags" on public.tags;
create policy "auth_escreve_tags" on public.tags for all using (auth.role() = 'authenticated');

drop policy if exists "auth_negocio_tags" on public.negocio_tags;
create policy "auth_negocio_tags" on public.negocio_tags for all using (auth.role() = 'authenticated');

drop policy if exists "auth_cliente_tags" on public.cliente_tags;
create policy "auth_cliente_tags" on public.cliente_tags for all using (auth.role() = 'authenticated');

drop policy if exists "auth_le_origens" on public.origens;
create policy "auth_le_origens" on public.origens for select using (auth.role() = 'authenticated');
drop policy if exists "admin_escreve_origens" on public.origens;
create policy "admin_escreve_origens" on public.origens for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "auth_negocio_produtos" on public.negocio_produtos;
create policy "auth_negocio_produtos" on public.negocio_produtos for all using (auth.role() = 'authenticated');

drop policy if exists "auth_le_negocio_notas" on public.negocio_notas;
create policy "auth_le_negocio_notas" on public.negocio_notas for select using (auth.role() = 'authenticated');
drop policy if exists "auth_escreve_negocio_notas" on public.negocio_notas;
create policy "auth_escreve_negocio_notas" on public.negocio_notas for insert with check (auth.uid() = user_id);
drop policy if exists "auth_atualiza_propria_nota" on public.negocio_notas;
create policy "auth_atualiza_propria_nota" on public.negocio_notas for update using (auth.uid() = user_id);
drop policy if exists "auth_deleta_propria_nota" on public.negocio_notas;
create policy "auth_deleta_propria_nota" on public.negocio_notas for delete using (
  auth.uid() = user_id or
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
