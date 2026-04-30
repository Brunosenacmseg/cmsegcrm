-- ═══════════════════════════════════════════════════════════════════
-- CM.segCRM — Migration 003: Correções de schema
-- Corrige incompatibilidades entre o código e o banco que estavam
-- causando falhas em: Cotações, Importação de Clientes e Sync da Porto.
-- Execute no Supabase SQL Editor depois da 001 e da 002.
-- ═══════════════════════════════════════════════════════════════════

-- ─── USERS: incluir role 'lider' ─────────────────────────────────────
alter table public.users drop constraint if exists users_role_check;
alter table public.users add  constraint users_role_check
  check (role in ('admin','corretor','lider'));

-- ─── CLIENTES: campos extras usados por Cliente / Importar / Cotação ─
alter table public.clientes add column if not exists nascimento   date;
alter table public.clientes add column if not exists rg           text;
alter table public.clientes add column if not exists sexo         text;
alter table public.clientes add column if not exists estado_civil text;
alter table public.clientes add column if not exists telefone2    text;
alter table public.clientes add column if not exists telefone3    text;
alter table public.clientes add column if not exists email2       text;
alter table public.clientes add column if not exists email3       text;
alter table public.clientes add column if not exists endereco     text;
alter table public.clientes add column if not exists numero       text;
alter table public.clientes add column if not exists complemento  text;
alter table public.clientes add column if not exists bairro       text;
alter table public.clientes add column if not exists observacao   text;
alter table public.clientes add column if not exists cep2         text;
alter table public.clientes add column if not exists endereco2    text;
alter table public.clientes add column if not exists numero2      text;
alter table public.clientes add column if not exists complemento2 text;
alter table public.clientes add column if not exists bairro2      text;
alter table public.clientes add column if not exists cidade2      text;
alter table public.clientes add column if not exists estado2      text;
alter table public.clientes add column if not exists cep3         text;
alter table public.clientes add column if not exists endereco3    text;
alter table public.clientes add column if not exists numero3      text;
alter table public.clientes add column if not exists complemento3 text;
alter table public.clientes add column if not exists bairro3      text;
alter table public.clientes add column if not exists cidade3      text;
alter table public.clientes add column if not exists estado3      text;
alter table public.clientes add column if not exists vendedor_id  uuid references public.users(id);

-- O código de Apólices/Comissões/Dashboard espera o JOIN
-- users!clientes_vendedor_id_fkey — garantir nome da constraint.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_vendedor_id_fkey') then
    alter table public.clientes
      add constraint clientes_vendedor_id_fkey
      foreign key (vendedor_id) references public.users(id);
  end if;
end $$;

-- ─── NEGOCIOS: campos titulo, vendedor_id, cliente_id opcional ───────
alter table public.negocios add column if not exists titulo      text;
alter table public.negocios add column if not exists vendedor_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'negocios_vendedor_id_fkey') then
    alter table public.negocios
      add constraint negocios_vendedor_id_fkey
      foreign key (vendedor_id) references public.users(id);
  end if;
end $$;

-- Permitir negocios sem cliente vinculado (Porto cria card antes do cliente existir)
alter table public.negocios alter column cliente_id drop not null;

-- ─── APOLICES: vendedor_id + unique no numero ────────────────────────
alter table public.apolices add column if not exists vendedor_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'apolices_vendedor_id_fkey') then
    alter table public.apolices
      add constraint apolices_vendedor_id_fkey
      foreign key (vendedor_id) references public.users(id);
  end if;
end $$;

-- numero único para upsert do Porto funcionar
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'apolices_numero_key') then
    alter table public.apolices add constraint apolices_numero_key unique (numero);
  end if;
end $$;

-- ─── TAREFAS: criado_por + tipo 'ligacao' (sem cedilha) ──────────────
alter table public.tarefas add column if not exists criado_por uuid references public.users(id);

-- check antigo já permite 'ligacao' (sem ç) — não precisa mexer.

-- ─── COTACOES (não existia) ──────────────────────────────────────────
create table if not exists public.cotacoes (
  id              uuid primary key default uuid_generate_v4(),
  cliente_id      uuid references public.clientes(id) on delete set null,
  produto         text,
  status          text default 'calculando',
  user_id         uuid references public.users(id),
  dados           jsonb,
  cpf_cnpj        text,
  nome_segurado   text,
  placa           text,
  modelo          text,
  combustivel     text,
  cep_residencial text,
  screenshot_url  text,
  criado_em       timestamptz default now()
);

alter table public.cotacoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='cotacoes' and policyname='autenticados leem cotacoes') then
    create policy "autenticados leem cotacoes" on public.cotacoes for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='cotacoes' and policyname='autenticados escrevem cotacoes') then
    create policy "autenticados escrevem cotacoes" on public.cotacoes for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- ─── NOTIFICACOES (usado por Porto + outras integrações) ─────────────
create table if not exists public.notificacoes (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references public.users(id) on delete cascade,
  tipo       text default 'sistema',
  titulo     text not null,
  descricao  text,
  link       text,
  lida       boolean default false,
  criado_em  timestamptz default now()
);
create index if not exists notificacoes_user_idx on public.notificacoes (user_id, criado_em desc);

alter table public.notificacoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='notificacoes' and policyname='proprio le notificacoes') then
    create policy "proprio le notificacoes" on public.notificacoes for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='notificacoes' and policyname='autenticados escrevem notificacoes') then
    create policy "autenticados escrevem notificacoes" on public.notificacoes for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- ─── IMPORTACOES_PORTO (controle de execuções do sync) ───────────────
create table if not exists public.importacoes_porto (
  id              uuid primary key default uuid_generate_v4(),
  tipo_arquivo    text,
  nome_arquivo    text,
  produto         text,
  data_geracao    text,
  qtd_registros   int,
  qtd_importados  int default 0,
  qtd_erros       int default 0,
  erros           jsonb,
  status          text default 'processando',
  criado_em       timestamptz default now(),
  concluido_em    timestamptz
);

alter table public.importacoes_porto enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='importacoes_porto' and policyname='autenticados leem importacoes_porto') then
    create policy "autenticados leem importacoes_porto" on public.importacoes_porto for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='importacoes_porto' and policyname='autenticados escrevem importacoes_porto') then
    create policy "autenticados escrevem importacoes_porto" on public.importacoes_porto for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- ─── EQUIPES (usado por Apólices/Comissões para filtro de líder) ─────
create table if not exists public.equipes (
  id        uuid primary key default uuid_generate_v4(),
  nome      text not null,
  lider_id  uuid references public.users(id),
  criado_em timestamptz default now()
);

create table if not exists public.equipe_membros (
  equipe_id  uuid references public.equipes(id) on delete cascade,
  user_id    uuid references public.users(id)   on delete cascade,
  primary key (equipe_id, user_id)
);

alter table public.equipes        enable row level security;
alter table public.equipe_membros enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='equipes' and policyname='autenticados leem equipes') then
    create policy "autenticados leem equipes" on public.equipes for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='equipe_membros' and policyname='autenticados leem equipe_membros') then
    create policy "autenticados leem equipe_membros" on public.equipe_membros for select using (auth.role() = 'authenticated');
  end if;
end $$;
