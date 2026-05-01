-- ═════════════════════════════════════════════════════════════════════
-- CM.segCRM — _RUN_ALL.sql
--
-- COMPILADO COMPLETO de TODAS as migrations 001-014 numa execução só.
-- Idempotente: pode ser rodado em base virgem OU já parcialmente migrada.
--
-- Para usar: cole TUDO no Supabase SQL Editor → Run.
--
-- Ordem é importante:
--   1) Extensão uuid + schema base (users, clientes, funis, negocios, etc)
--   2) Storage / anexos / importacoes_comissao
--   3) Schema fixes (vendedor_id, cotacoes, notificacoes, equipes, ...)
--   4) RD Station (rd_id em todas + rdstation_syncs + rdstation_oauth)
--   5) Módulos extras (manuais, metas, mensagens, mural, whatsapp, goto, ligacoes)
--   6) Funis admin + negocios.status (PRECISA vir antes da view meta_vendas)
--   7) RLS escopado por papel (admin/lider/corretor)
--   8) Comissões recebidas
--   9) Funis seed RD Station (17 funis)
--  10) Funis_equipes (visibilidade por equipe)
--  11) Cotações: campos do robô (resultado/erro/screenshot)
--  12) Meta Ads (campanhas/adsets/ads/insights/leads + view)
--  13) Pixel + grupos de mensagens + importações genéricas
--  14) Financeiro/DRE (seguradoras, categorias, despesas, acessos, views)
-- ═════════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ═════════════════════════════════════════════════════════════════════
-- 01. SCHEMA BASE (de 001_schema.sql)
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  email       text not null,
  role        text not null default 'corretor',
  avatar_url  text,
  created_at  timestamptz default now()
);

-- users.role precisa aceitar 'lider' (de 003_fix_schema)
alter table public.users drop constraint if exists users_role_check;
alter table public.users add  constraint users_role_check
  check (role in ('admin','corretor','lider'));

create table if not exists public.clientes (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  tipo        text not null default 'PF' check (tipo in ('PF','PJ')),
  cpf_cnpj    text,
  email       text,
  telefone    text,
  cep         text,
  cidade      text,
  estado      text,
  fonte       text,
  corretor_id uuid references public.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists public.funis (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  tipo        text not null,
  emoji       text,
  cor         text,
  etapas      text[] not null,
  ordem       int default 0,
  created_at  timestamptz default now()
);

-- Remove qualquer check de tipo (de 006) para permitir tipos livres
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.funis'::regclass and contype = 'c'
  loop
    execute format('alter table public.funis drop constraint %I', r.conname);
  end loop;
end$$;

create table if not exists public.negocios (
  id           uuid primary key default uuid_generate_v4(),
  cliente_id   uuid references public.clientes(id) on delete cascade,
  funil_id     uuid not null references public.funis(id),
  etapa        text not null,
  produto      text,
  seguradora   text,
  premio       numeric(12,2) default 0,
  comissao_pct numeric(5,2)  default 0,
  placa        text,
  cpf_cnpj     text,
  cep          text,
  fonte        text,
  vencimento   date,
  obs          text,
  corretor_id  uuid references public.users(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Permitir negocios sem cliente (Porto cria card antes do cliente existir)
alter table public.negocios alter column cliente_id drop not null;

create table if not exists public.historico (
  id          uuid primary key default uuid_generate_v4(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  negocio_id  uuid references public.negocios(id) on delete set null,
  tipo        text not null default 'info' check (tipo in ('gold','teal','red','blue','gray')),
  titulo      text not null,
  descricao   text,
  user_id     uuid references public.users(id),
  created_at  timestamptz default now()
);

create table if not exists public.tarefas (
  id          uuid primary key default uuid_generate_v4(),
  cliente_id  uuid references public.clientes(id) on delete cascade,
  negocio_id  uuid references public.negocios(id) on delete cascade,
  titulo      text not null,
  descricao   text,
  tipo        text default 'tarefa' check (tipo in ('tarefa','ligacao','email','reuniao','nota')),
  status      text default 'pendente' check (status in ('pendente','concluida','cancelada')),
  prazo       timestamptz,
  responsavel_id uuid references public.users(id),
  created_at  timestamptz default now()
);

create table if not exists public.apolices (
  id           uuid primary key default uuid_generate_v4(),
  cliente_id   uuid not null references public.clientes(id) on delete cascade,
  negocio_id   uuid references public.negocios(id),
  numero       text,
  produto      text,
  seguradora   text,
  premio       numeric(12,2),
  comissao_pct numeric(5,2),
  vigencia_ini date,
  vigencia_fim date,
  status       text default 'ativo' check (status in ('ativo','cancelado','renovar','vencido')),
  placa        text,
  created_at   timestamptz default now()
);

-- Trigger updated_at
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists clientes_updated_at on public.clientes;
create trigger clientes_updated_at  before update on public.clientes  for each row execute procedure update_updated_at();
drop trigger if exists negocios_updated_at on public.negocios;
create trigger negocios_updated_at  before update on public.negocios  for each row execute procedure update_updated_at();

-- handle_new_user
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ═════════════════════════════════════════════════════════════════════
-- 02. STORAGE / ANEXOS (de 002_storage.sql)
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.anexos (
  id           uuid primary key default uuid_generate_v4(),
  bucket       text not null default 'cmsegcrm',
  path         text not null,
  nome_arquivo text not null,
  tipo_mime    text,
  tamanho_kb   int,
  categoria    text not null check (categoria in ('negocio','cliente','comissao','outro')),
  negocio_id   uuid references public.negocios(id) on delete cascade,
  cliente_id   uuid references public.clientes(id) on delete cascade,
  user_id      uuid references public.users(id),
  created_at   timestamptz default now()
);

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

-- ═════════════════════════════════════════════════════════════════════
-- 03. SCHEMA FIXES (de 003_fix_schema.sql)
-- ═════════════════════════════════════════════════════════════════════

-- CLIENTES — campos extras
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

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_vendedor_id_fkey') then
    alter table public.clientes
      add constraint clientes_vendedor_id_fkey
      foreign key (vendedor_id) references public.users(id);
  end if;
end $$;

-- NEGOCIOS — titulo, vendedor_id, status (PRECISA vir antes da view meta_vendas_por_campanha)
alter table public.negocios add column if not exists titulo      text;
alter table public.negocios add column if not exists vendedor_id uuid;
alter table public.negocios
  add column if not exists status text not null default 'em_andamento';

-- garantir o check de status (de 006_funis_admin)
do $$ begin
  alter table public.negocios drop constraint if exists negocios_status_check;
  alter table public.negocios add constraint negocios_status_check
    check (status in ('em_andamento','ganho','perdido'));
end $$;

alter table public.negocios add column if not exists motivo_perda    text;
alter table public.negocios add column if not exists data_fechamento timestamptz;
alter table public.negocios add column if not exists fechado_por     uuid references public.users(id);

create index if not exists idx_negocios_status on public.negocios(status);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'negocios_vendedor_id_fkey') then
    alter table public.negocios
      add constraint negocios_vendedor_id_fkey
      foreign key (vendedor_id) references public.users(id);
  end if;
end $$;

-- APOLICES — vendedor_id + numero unique
alter table public.apolices add column if not exists vendedor_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'apolices_vendedor_id_fkey') then
    alter table public.apolices
      add constraint apolices_vendedor_id_fkey
      foreign key (vendedor_id) references public.users(id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'apolices_numero_key') then
    alter table public.apolices add constraint apolices_numero_key unique (numero);
  end if;
end $$;

-- TAREFAS — criado_por
alter table public.tarefas add column if not exists criado_por uuid references public.users(id);

-- COTACOES (de 003 + 010_cotacoes_resultado)
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

alter table public.cotacoes add column if not exists resultado     jsonb;
alter table public.cotacoes add column if not exists erro          text;
alter table public.cotacoes add column if not exists screenshot    text;
alter table public.cotacoes add column if not exists concluido_em  timestamptz;
alter table public.cotacoes add column if not exists tentativas    int default 0;
create index if not exists idx_cotacoes_status on public.cotacoes(status);

-- NOTIFICACOES
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

-- IMPORTACOES_PORTO
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

-- EQUIPES + EQUIPE_MEMBROS
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

-- ═════════════════════════════════════════════════════════════════════
-- 04. RD STATION (de 003_rd_station.sql + 004_rdstation_oauth.sql)
-- ═════════════════════════════════════════════════════════════════════

alter table public.clientes  add column if not exists rd_id text;
alter table public.negocios  add column if not exists rd_id text;
alter table public.tarefas   add column if not exists rd_id text;
alter table public.funis     add column if not exists rd_id text;
alter table public.users     add column if not exists rd_id text;
alter table public.historico add column if not exists rd_id text;
alter table public.funis     add column if not exists descricao text;

create unique index if not exists clientes_rd_id_idx  on public.clientes(rd_id)  where rd_id is not null;
create unique index if not exists negocios_rd_id_idx  on public.negocios(rd_id)  where rd_id is not null;
create unique index if not exists tarefas_rd_id_idx   on public.tarefas(rd_id)   where rd_id is not null;
create unique index if not exists funis_rd_id_idx     on public.funis(rd_id)     where rd_id is not null;
create unique index if not exists users_rd_id_idx     on public.users(rd_id)     where rd_id is not null;
create unique index if not exists historico_rd_id_idx on public.historico(rd_id) where rd_id is not null;

create table if not exists public.rdstation_syncs (
  id            uuid primary key default uuid_generate_v4(),
  recurso       text not null,
  status        text not null default 'processando' check (status in ('processando','concluido','parcial','erro')),
  qtd_lidos     int default 0,
  qtd_criados   int default 0,
  qtd_atualizados int default 0,
  qtd_erros     int default 0,
  erros         text[],
  iniciado_em   timestamptz default now(),
  concluido_em  timestamptz,
  user_id       uuid references public.users(id)
);

create table if not exists public.rdstation_oauth (
  id            int primary key default 1,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  updated_at    timestamptz default now(),
  constraint rdstation_oauth_singleton check (id = 1)
);

-- ═════════════════════════════════════════════════════════════════════
-- 05. MÓDULOS EXTRAS (de 004_modules_extras.sql)
-- ═════════════════════════════════════════════════════════════════════

alter table public.users add column if not exists ramal_goto text;

-- MANUAIS
create table if not exists public.manuais (
  id            uuid primary key default uuid_generate_v4(),
  titulo        text not null,
  descricao     text,
  categoria     text not null default 'geral',
  arquivo_url   text not null,
  arquivo_nome  text,
  arquivo_tipo  text,
  tamanho_bytes bigint,
  criado_por    uuid,
  created_at    timestamptz default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'manuais_criado_por_fkey') then
    alter table public.manuais add constraint manuais_criado_por_fkey
      foreign key (criado_por) references public.users(id);
  end if;
end $$;

-- METAS
create table if not exists public.metas (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null,
  criado_por      uuid,
  titulo          text not null,
  descricao       text,
  tipo            text default 'premio' check (tipo in ('premio','negocios','clientes','comissao')),
  valor_meta      numeric(12,2) not null,
  valor_atual     numeric(12,2) default 0,
  periodo_inicio  date not null,
  periodo_fim     date not null,
  status          text default 'ativa' check (status in ('ativa','inativa','concluida')),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'metas_user_id_fkey') then
    alter table public.metas add constraint metas_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'metas_criado_por_fkey') then
    alter table public.metas add constraint metas_criado_por_fkey
      foreign key (criado_por) references public.users(id);
  end if;
end $$;
drop trigger if exists metas_updated_at on public.metas;
create trigger metas_updated_at before update on public.metas for each row execute procedure update_updated_at();

-- MENSAGENS INTERNAS
create table if not exists public.mensagens_internas (
  id            uuid primary key default uuid_generate_v4(),
  de_user_id    uuid not null references public.users(id) on delete cascade,
  para_user_id  uuid references public.users(id) on delete cascade,
  conteudo      text not null,
  lida          boolean default false,
  criado_em     timestamptz default now()
);
create index if not exists mensagens_internas_idx on public.mensagens_internas (para_user_id, de_user_id, criado_em desc);

-- MURAL
create table if not exists public.mural_posts (
  id        uuid primary key default uuid_generate_v4(),
  user_id   uuid not null references public.users(id) on delete cascade,
  conteudo  text not null,
  foto_url  text,
  criado_em timestamptz default now()
);
create table if not exists public.mural_comentarios (
  id        uuid primary key default uuid_generate_v4(),
  post_id   uuid not null references public.mural_posts(id) on delete cascade,
  user_id   uuid not null references public.users(id)       on delete cascade,
  conteudo  text not null,
  criado_em timestamptz default now()
);
create table if not exists public.mural_reacoes (
  id        uuid primary key default uuid_generate_v4(),
  post_id   uuid not null references public.mural_posts(id) on delete cascade,
  user_id   uuid not null references public.users(id)       on delete cascade,
  tipo      text not null,
  criado_em timestamptz default now(),
  unique (post_id, user_id)
);
create table if not exists public.mural_mencoes (
  id                   uuid primary key default uuid_generate_v4(),
  post_id              uuid references public.mural_posts(id)        on delete cascade,
  comentario_id        uuid references public.mural_comentarios(id)  on delete cascade,
  user_mencionado_id   uuid not null references public.users(id)     on delete cascade,
  criado_em            timestamptz default now()
);

-- WHATSAPP
create table if not exists public.whatsapp_instancias (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  nome          text not null,
  evolution_url text,
  api_key       text,
  status        text default 'disconnected',
  qrcode        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create unique index if not exists whatsapp_instancias_user_unique on public.whatsapp_instancias(user_id);

create table if not exists public.whatsapp_mensagens (
  id            uuid primary key default uuid_generate_v4(),
  instancia_id  uuid not null references public.whatsapp_instancias(id) on delete cascade,
  cliente_id    uuid references public.clientes(id) on delete set null,
  remoto_jid    text not null,
  remoto_numero text,
  remoto_nome   text,
  conteudo      text,
  tipo          text default 'text',
  direcao       text default 'recebida' check (direcao in ('enviada','recebida')),
  lida          boolean default false,
  evolution_id  text,
  created_at    timestamptz default now()
);
create index if not exists whatsapp_mensagens_idx on public.whatsapp_mensagens (instancia_id, remoto_jid, created_at desc);

drop trigger if exists whatsapp_instancias_updated_at on public.whatsapp_instancias;
create trigger whatsapp_instancias_updated_at before update on public.whatsapp_instancias
  for each row execute procedure update_updated_at();

-- GOTO
create table if not exists public.goto_tokens (
  user_id       uuid primary key references public.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz not null,
  account_key   text,
  updated_at    timestamptz default now()
);

create table if not exists public.ligacoes (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid references public.users(id) on delete set null,
  cliente_id           uuid references public.clientes(id) on delete set null,
  numero_origem        text,
  numero_destino       text,
  nome_contato         text,
  direcao              text default 'sainte' check (direcao in ('sainte','entrante')),
  status               text default 'iniciada' check (status in ('iniciada','em_andamento','encerrada','encerrando','perdida','erro')),
  inicio               timestamptz,
  fim                  timestamptz,
  duracao_seg          int default 0,
  goto_call_id         text,
  goto_conversation_id text,
  criado_em            timestamptz default now()
);
create index if not exists ligacoes_user_idx on public.ligacoes (user_id, criado_em desc);
create index if not exists ligacoes_conv_idx on public.ligacoes (goto_conversation_id);

-- ═════════════════════════════════════════════════════════════════════
-- 06. RLS HELPERS + SCOPED POLICIES (de 005_rls_scoped.sql + 001 + 003)
-- ═════════════════════════════════════════════════════════════════════

create or replace function public.current_user_role()
returns text
language sql security definer stable set search_path = public
as $$ select role from public.users where id = auth.uid() $$;

create or replace function public.can_see_user(target_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  with me as (select id, role from public.users where id = auth.uid())
  select case
    when target_id is null then (select role in ('admin','lider') from me)
    when target_id = (select id from me) then true
    when (select role from me) = 'admin' then true
    when (select role from me) = 'lider' then exists (
      select 1 from public.equipes e
      join public.equipe_membros em on em.equipe_id = e.id
      where e.lider_id = (select id from me) and em.user_id = target_id
    )
    else false
  end
$$;

-- Habilitar RLS em todas as tabelas
alter table public.users                 enable row level security;
alter table public.clientes              enable row level security;
alter table public.negocios              enable row level security;
alter table public.historico             enable row level security;
alter table public.tarefas               enable row level security;
alter table public.apolices              enable row level security;
alter table public.funis                 enable row level security;
alter table public.anexos                enable row level security;
alter table public.importacoes_comissao  enable row level security;
alter table public.cotacoes              enable row level security;
alter table public.notificacoes          enable row level security;
alter table public.importacoes_porto     enable row level security;
alter table public.equipes               enable row level security;
alter table public.equipe_membros        enable row level security;
alter table public.rdstation_syncs       enable row level security;
alter table public.rdstation_oauth       enable row level security;
alter table public.manuais               enable row level security;
alter table public.metas                 enable row level security;
alter table public.mensagens_internas    enable row level security;
alter table public.mural_posts           enable row level security;
alter table public.mural_comentarios     enable row level security;
alter table public.mural_reacoes         enable row level security;
alter table public.mural_mencoes         enable row level security;
alter table public.whatsapp_instancias   enable row level security;
alter table public.whatsapp_mensagens    enable row level security;
alter table public.goto_tokens           enable row level security;
alter table public.ligacoes              enable row level security;

-- Limpa policies amplas antigas que serão substituídas
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in (
        'clientes','negocios','apolices','tarefas','cotacoes','ligacoes',
        'whatsapp_instancias','whatsapp_mensagens','metas','importacoes_porto'
      )
      and policyname like 'autenticados%'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- USERS / FUNIS / EQUIPES / HISTÓRICO etc — leitura aberta a autenticados
drop policy if exists "autenticados leem" on public.users;
create policy "autenticados leem" on public.users for select using (auth.role() = 'authenticated');

drop policy if exists "autenticados leem" on public.historico;
create policy "autenticados leem" on public.historico for select using (auth.role() = 'authenticated');
drop policy if exists "autenticados escrevem historico" on public.historico;
create policy "autenticados escrevem historico" on public.historico for all using (auth.role() = 'authenticated');

drop policy if exists "autenticados leem equipes" on public.equipes;
create policy "autenticados leem equipes" on public.equipes for select using (auth.role() = 'authenticated');
drop policy if exists "autenticados leem equipe_membros" on public.equipe_membros;
create policy "autenticados leem equipe_membros" on public.equipe_membros for select using (auth.role() = 'authenticated');

-- ANEXOS
drop policy if exists "autenticados leem anexos" on public.anexos;
create policy "autenticados leem anexos" on public.anexos for select using (auth.role() = 'authenticated');
drop policy if exists "autenticados escrevem anexos" on public.anexos;
create policy "autenticados escrevem anexos" on public.anexos for all using (auth.role() = 'authenticated');

-- IMPORTACOES_COMISSAO
drop policy if exists "autenticados leem importacoes" on public.importacoes_comissao;
create policy "autenticados leem importacoes" on public.importacoes_comissao for select using (auth.role() = 'authenticated');
drop policy if exists "autenticados escrevem importacoes" on public.importacoes_comissao;
create policy "autenticados escrevem importacoes" on public.importacoes_comissao for all using (auth.role() = 'authenticated');

-- CLIENTES — escopadas
drop policy if exists "scoped_read_clientes"  on public.clientes;
create policy "scoped_read_clientes"  on public.clientes for select using (public.can_see_user(vendedor_id));
drop policy if exists "auth_insert_clientes"  on public.clientes;
create policy "auth_insert_clientes"  on public.clientes for insert with check (auth.role() = 'authenticated');
drop policy if exists "auth_update_clientes"  on public.clientes;
create policy "auth_update_clientes"  on public.clientes for update using (auth.role() = 'authenticated');
drop policy if exists "admin_delete_clientes" on public.clientes;
create policy "admin_delete_clientes" on public.clientes for delete using (public.current_user_role() = 'admin');

-- NEGOCIOS
drop policy if exists "scoped_read_negocios"  on public.negocios;
create policy "scoped_read_negocios"  on public.negocios for select using (public.can_see_user(vendedor_id));
drop policy if exists "auth_insert_negocios"  on public.negocios;
create policy "auth_insert_negocios"  on public.negocios for insert with check (auth.role() = 'authenticated');
drop policy if exists "auth_update_negocios"  on public.negocios;
create policy "auth_update_negocios"  on public.negocios for update using (auth.role() = 'authenticated');
drop policy if exists "admin_delete_negocios" on public.negocios;
create policy "admin_delete_negocios" on public.negocios for delete using (public.current_user_role() = 'admin');

-- APOLICES
drop policy if exists "scoped_read_apolices"  on public.apolices;
create policy "scoped_read_apolices"  on public.apolices for select using (public.can_see_user(vendedor_id));
drop policy if exists "auth_insert_apolices"  on public.apolices;
create policy "auth_insert_apolices"  on public.apolices for insert with check (auth.role() = 'authenticated');
drop policy if exists "auth_update_apolices"  on public.apolices;
create policy "auth_update_apolices"  on public.apolices for update using (auth.role() = 'authenticated');
drop policy if exists "admin_delete_apolices" on public.apolices;
create policy "admin_delete_apolices" on public.apolices for delete using (public.current_user_role() = 'admin');

-- TAREFAS
drop policy if exists "scoped_read_tarefas"   on public.tarefas;
create policy "scoped_read_tarefas"   on public.tarefas for select using (
  public.can_see_user(responsavel_id) or public.can_see_user(criado_por)
);
drop policy if exists "auth_insert_tarefas"   on public.tarefas;
create policy "auth_insert_tarefas"   on public.tarefas for insert with check (auth.role() = 'authenticated');
drop policy if exists "auth_update_tarefas"   on public.tarefas;
create policy "auth_update_tarefas"   on public.tarefas for update using (auth.role() = 'authenticated');
drop policy if exists "admin_delete_tarefas"  on public.tarefas;
create policy "admin_delete_tarefas"  on public.tarefas for delete using (public.current_user_role() = 'admin');

-- COTACOES
drop policy if exists "scoped_read_cotacoes"  on public.cotacoes;
create policy "scoped_read_cotacoes"  on public.cotacoes for select using (public.can_see_user(user_id));
drop policy if exists "auth_insert_cotacoes"  on public.cotacoes;
create policy "auth_insert_cotacoes"  on public.cotacoes for insert with check (auth.role() = 'authenticated');
drop policy if exists "auth_update_cotacoes"  on public.cotacoes;
create policy "auth_update_cotacoes"  on public.cotacoes for update using (auth.role() = 'authenticated');
drop policy if exists "admin_delete_cotacoes" on public.cotacoes;
create policy "admin_delete_cotacoes" on public.cotacoes for delete using (public.current_user_role() = 'admin');

-- LIGACOES
drop policy if exists "scoped_read_ligacoes"  on public.ligacoes;
create policy "scoped_read_ligacoes"  on public.ligacoes for select using (public.can_see_user(user_id));
drop policy if exists "auth_insert_ligacoes"  on public.ligacoes;
create policy "auth_insert_ligacoes"  on public.ligacoes for insert with check (auth.role() = 'authenticated');
drop policy if exists "auth_update_ligacoes"  on public.ligacoes;
create policy "auth_update_ligacoes"  on public.ligacoes for update using (auth.role() = 'authenticated');
drop policy if exists "admin_delete_ligacoes" on public.ligacoes;
create policy "admin_delete_ligacoes" on public.ligacoes for delete using (public.current_user_role() = 'admin');

-- WHATSAPP_INSTANCIAS
drop policy if exists "own_read_whatsapp_inst"   on public.whatsapp_instancias;
create policy "own_read_whatsapp_inst"   on public.whatsapp_instancias for select using (public.can_see_user(user_id));
drop policy if exists "own_insert_whatsapp_inst" on public.whatsapp_instancias;
create policy "own_insert_whatsapp_inst" on public.whatsapp_instancias for insert with check (auth.uid() = user_id);
drop policy if exists "own_update_whatsapp_inst" on public.whatsapp_instancias;
create policy "own_update_whatsapp_inst" on public.whatsapp_instancias for update using (auth.uid() = user_id or public.current_user_role() = 'admin');
drop policy if exists "admin_delete_whatsapp_inst" on public.whatsapp_instancias;
create policy "admin_delete_whatsapp_inst" on public.whatsapp_instancias for delete using (public.current_user_role() = 'admin');

drop policy if exists "scoped_read_whatsapp_msg" on public.whatsapp_mensagens;
create policy "scoped_read_whatsapp_msg" on public.whatsapp_mensagens for select using (
  exists (
    select 1 from public.whatsapp_instancias i
    where i.id = whatsapp_mensagens.instancia_id and public.can_see_user(i.user_id)
  )
);
drop policy if exists "auth_insert_whatsapp_msg" on public.whatsapp_mensagens;
create policy "auth_insert_whatsapp_msg" on public.whatsapp_mensagens for insert with check (auth.role() = 'authenticated');
drop policy if exists "auth_update_whatsapp_msg" on public.whatsapp_mensagens;
create policy "auth_update_whatsapp_msg" on public.whatsapp_mensagens for update using (auth.role() = 'authenticated');
drop policy if exists "admin_delete_whatsapp_msg" on public.whatsapp_mensagens;
create policy "admin_delete_whatsapp_msg" on public.whatsapp_mensagens for delete using (public.current_user_role() = 'admin');

-- METAS
drop policy if exists "scoped_read_metas" on public.metas;
create policy "scoped_read_metas" on public.metas for select using (
  public.can_see_user(user_id) or public.can_see_user(criado_por)
);
drop policy if exists "auth_insert_metas" on public.metas;
create policy "auth_insert_metas" on public.metas for insert with check (auth.role() = 'authenticated');
drop policy if exists "auth_update_metas" on public.metas;
create policy "auth_update_metas" on public.metas for update using (auth.role() = 'authenticated');
drop policy if exists "admin_delete_metas" on public.metas;
create policy "admin_delete_metas" on public.metas for delete using (public.current_user_role() = 'admin');

-- IMPORTACOES_PORTO
drop policy if exists "manager_read_porto_imp" on public.importacoes_porto;
create policy "manager_read_porto_imp" on public.importacoes_porto for select using (public.current_user_role() in ('admin','lider'));
drop policy if exists "auth_write_porto_imp"   on public.importacoes_porto;
create policy "auth_write_porto_imp"   on public.importacoes_porto for all using (auth.role() = 'authenticated');

-- NOTIFICACOES
drop policy if exists "proprio le notificacoes" on public.notificacoes;
create policy "proprio le notificacoes" on public.notificacoes for select using (auth.uid() = user_id);
drop policy if exists "autenticados escrevem notificacoes" on public.notificacoes;
create policy "autenticados escrevem notificacoes" on public.notificacoes for all using (auth.role() = 'authenticated');

-- MANUAIS
drop policy if exists "autenticados leem manuais" on public.manuais;
create policy "autenticados leem manuais" on public.manuais for select using (auth.role() = 'authenticated');
drop policy if exists "autenticados escrevem manuais" on public.manuais;
create policy "autenticados escrevem manuais" on public.manuais for all using (auth.role() = 'authenticated');

-- MURAL
drop policy if exists "autenticados leem posts" on public.mural_posts;
create policy "autenticados leem posts" on public.mural_posts for select using (auth.role() = 'authenticated');
drop policy if exists "autenticados escrevem posts" on public.mural_posts;
create policy "autenticados escrevem posts" on public.mural_posts for all using (auth.role() = 'authenticated');
drop policy if exists "autenticados leem comentarios" on public.mural_comentarios;
create policy "autenticados leem comentarios" on public.mural_comentarios for select using (auth.role() = 'authenticated');
drop policy if exists "autenticados escrevem comentarios" on public.mural_comentarios;
create policy "autenticados escrevem comentarios" on public.mural_comentarios for all using (auth.role() = 'authenticated');
drop policy if exists "autenticados leem reacoes" on public.mural_reacoes;
create policy "autenticados leem reacoes" on public.mural_reacoes for select using (auth.role() = 'authenticated');
drop policy if exists "autenticados escrevem reacoes" on public.mural_reacoes;
create policy "autenticados escrevem reacoes" on public.mural_reacoes for all using (auth.role() = 'authenticated');
drop policy if exists "autenticados leem mencoes" on public.mural_mencoes;
create policy "autenticados leem mencoes" on public.mural_mencoes for select using (auth.role() = 'authenticated');
drop policy if exists "autenticados escrevem mencoes" on public.mural_mencoes;
create policy "autenticados escrevem mencoes" on public.mural_mencoes for all using (auth.role() = 'authenticated');

-- GOTO_TOKENS
drop policy if exists "proprio le goto_tokens" on public.goto_tokens;
create policy "proprio le goto_tokens" on public.goto_tokens for select using (auth.uid() = user_id);
drop policy if exists "autenticados gerenciam proprio goto_tokens" on public.goto_tokens;
create policy "autenticados gerenciam proprio goto_tokens" on public.goto_tokens for all using (auth.uid() = user_id);

-- RDSTATION
drop policy if exists "admins gerenciam syncs" on public.rdstation_syncs;
create policy "admins gerenciam syncs" on public.rdstation_syncs for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
drop policy if exists "admins gerenciam oauth" on public.rdstation_oauth;
create policy "admins gerenciam oauth" on public.rdstation_oauth for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- MENSAGENS INTERNAS — policies serão recriadas na seção 12 (com suporte a grupos)

-- FUNIS — admin escreve (ler é tratado depois com funis_equipes)
drop policy if exists "admin_insert_funis" on public.funis;
create policy "admin_insert_funis" on public.funis for insert with check (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "admin_update_funis" on public.funis;
create policy "admin_update_funis" on public.funis for update using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "admin_delete_funis" on public.funis;
create policy "admin_delete_funis" on public.funis for delete using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- ═════════════════════════════════════════════════════════════════════
-- 07. COMISSÕES RECEBIDAS (de 007)
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.comissoes_recebidas (
  id                 uuid primary key default uuid_generate_v4(),
  negocio_id         uuid references public.negocios(id) on delete set null,
  apolice_id         uuid references public.apolices(id) on delete set null,
  cliente_id         uuid references public.clientes(id) on delete set null,
  vendedor_id        uuid not null references public.users(id),
  valor              numeric(12,2) not null check (valor >= 0),
  competencia        text,
  data_recebimento   date,
  parcela            int default 1,
  total_parcelas     int default 1,
  seguradora         text,
  produto            text,
  status             text not null default 'recebido'
                     check (status in ('previsto','recebido','cancelado')),
  origem             text not null default 'manual'
                     check (origem in ('manual','importacao','api')),
  importacao_id      uuid references public.importacoes_comissao(id) on delete set null,
  obs                text,
  registrado_por     uuid references public.users(id),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists idx_comrec_vendedor    on public.comissoes_recebidas(vendedor_id);
create index if not exists idx_comrec_competencia on public.comissoes_recebidas(competencia);
create index if not exists idx_comrec_negocio     on public.comissoes_recebidas(negocio_id);
create index if not exists idx_comrec_apolice     on public.comissoes_recebidas(apolice_id);

alter table public.comissoes_recebidas enable row level security;

drop policy if exists "scoped_read_comissoes_recebidas" on public.comissoes_recebidas;
create policy "scoped_read_comissoes_recebidas" on public.comissoes_recebidas
  for select using (public.can_see_user(vendedor_id));
drop policy if exists "admin_insert_comissoes_recebidas" on public.comissoes_recebidas;
create policy "admin_insert_comissoes_recebidas" on public.comissoes_recebidas
  for insert with check (public.current_user_role() = 'admin');
drop policy if exists "admin_update_comissoes_recebidas" on public.comissoes_recebidas;
create policy "admin_update_comissoes_recebidas" on public.comissoes_recebidas
  for update using (public.current_user_role() = 'admin');
drop policy if exists "admin_delete_comissoes_recebidas" on public.comissoes_recebidas;
create policy "admin_delete_comissoes_recebidas" on public.comissoes_recebidas
  for delete using (public.current_user_role() = 'admin');

drop trigger if exists comissoes_recebidas_updated_at on public.comissoes_recebidas;
create trigger comissoes_recebidas_updated_at
  before update on public.comissoes_recebidas
  for each row execute procedure update_updated_at();

-- ═════════════════════════════════════════════════════════════════════
-- 08. FUNIS_EQUIPES + LEITURA ESCOPADA (de 009)
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.funis_equipes (
  funil_id  uuid not null references public.funis(id)   on delete cascade,
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  primary key (funil_id, equipe_id)
);

alter table public.funis_equipes enable row level security;

drop policy if exists "auth_read_funis_equipes" on public.funis_equipes;
create policy "auth_read_funis_equipes" on public.funis_equipes for select using (auth.role() = 'authenticated');
drop policy if exists "admin_insert_funis_equipes" on public.funis_equipes;
create policy "admin_insert_funis_equipes" on public.funis_equipes for insert with check (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "admin_delete_funis_equipes" on public.funis_equipes;
create policy "admin_delete_funis_equipes" on public.funis_equipes for delete using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "autenticados leem"   on public.funis;
drop policy if exists "scoped_read_funis"   on public.funis;
create policy "scoped_read_funis" on public.funis for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  or not exists (select 1 from public.funis_equipes fe where fe.funil_id = funis.id)
  or exists (
    select 1 from public.funis_equipes fe
    join public.equipe_membros em on em.equipe_id = fe.equipe_id
    where fe.funil_id = funis.id and em.user_id = auth.uid()
  )
  or exists (
    select 1 from public.funis_equipes fe
    join public.equipes e on e.id = fe.equipe_id
    where fe.funil_id = funis.id and e.lider_id = auth.uid()
  )
);

-- ═════════════════════════════════════════════════════════════════════
-- 09. SEED DE FUNIS DO RD STATION (de 008)
-- Só insere se não houver funil com o mesmo nome.
-- ═════════════════════════════════════════════════════════════════════

do $$
declare
  v_funis jsonb := $json$
  [
    {"nome":"VENDA","tipo":"venda","emoji":"💼","cor":"#c9a84c","ordem":1,"etapas":["NOVO LEAD","CARDS ESCRITÓRIO","SEM CONTATO","INTERAÇÃO","ORÇAMENTO ENVIADO/NEGOCIAÇÃO","PROPOSTA ENVIADA","PENDENTE RASTREADOR","APÓLICE EMITIDA","AUTENTIQUE ENVIADO","PÓS VENDA","RASTREADOR PARA AGENDAR","PROCESSO FINALIZADO"]},
    {"nome":"FUNIL RECICLADO - VIDA","tipo":"venda","emoji":"🌿","cor":"#1cb5a0","ordem":2,"etapas":["Sem contato","Contato feito","Identificação do Interesse","SEM CONTATO","Apresentação","Proposta enviada"]},
    {"nome":"META + MULTICANAL","tipo":"venda","emoji":"📡","cor":"#4a80f0","ordem":3,"etapas":["NOVO LEAD MULTICANAL","TENTATIVA 1","TENTATIVA 2","TENTATIVA 3","INTERAÇÃO","ORÇAMENTO ENVIADO/NEGOCIAÇÃO","RETORNO COBRADO","PROPOSTA ENVIADA","APÓLICE EMITIDA","AUTENTIQUE ENVIADO","PÓS VENDA","PROCESSO FINALIZADO"]},
    {"nome":"SAUDE","tipo":"venda","emoji":"🩺","cor":"#3dc46a","ordem":4,"etapas":["NOVO LEAD","SEM CONTATO","INTERAÇÃO","ORÇAMENTO/NEGOCIAÇÃO","RETORNO COBRADO","LEMBRETE PROMOÇÃO","PROPOSTA ENVIADA","APÓLICE EMITIDA","AUTENTIQUE ENVIADO","PÓS VENDA","PROCESSO FINALIZADO"]},
    {"nome":"RENOVAÇÕES","tipo":"renovacao","emoji":"🔄","cor":"#9c5de4","ordem":5,"etapas":["RENOVAÇÕES À VENCER","VENCIMENTO ATÉ 10 DIAS","AGUARDANDO INTERAÇÃO","ORÇAMENTO ENVIADO","AGUARDANDO DATA DE CARTÃO","RENOVAÇÕES AUTOMÁTICAS","PROPOSTA EFETIVADA","APÓLICE EMITIDA","AUTENTIQUE ENVIADO","PÓS VENDA","RASTREADOR PARA AGENDAR","PROCESSO FINALIZADO"]},
    {"nome":"RCO","tipo":"renovacao","emoji":"📈","cor":"#5b8def","ordem":6,"etapas":["RENOVAÇÕES À VENCER","VENCIMENTO ATÉ 10 DIAS","CONTATO INICIADO","AGUARDANDO INTERAÇÃO","AGUARDANDO DATA DE EMISSÃO","PROPOSTA EFETIVADA","APÓLICE EMITIDA","AUTENTIQUE ENVIADO","PROCESSO FINALIZADO"]},
    {"nome":"ENDOSSO B2B","tipo":"venda","emoji":"🧾","cor":"#ff8a3d","ordem":7,"etapas":["ENDOSSO SOLICITADO","CALCULO ENVIADO","PROPOSTA EFETIVADA","PENDENTE RASTREADOR","ENDOSSO EMITIDO","AUTENTIQUE ENVIADO","PROCESSO FINALIZADO"]},
    {"nome":"CONSÓRCIO","tipo":"venda","emoji":"🏠","cor":"#d8425c","ordem":8,"etapas":["NOVO LEAD","TENTATIVA 1","TENTATIVA 2","TENTATIVA 3","INTERAÇÃO","ORÇAMENTO APRESENTADO","RETORNO COBRADO","LEMBRETE PROMOÇÃO","PROPOSTA ENVIADA","APÓLICE EMITIDA"]},
    {"nome":"CONTA PORTO BANK","tipo":"venda","emoji":"🏦","cor":"#a0a8b8","ordem":9,"etapas":["Sem contato","Contato feito","Identificação do Interesse","Apresentação","Proposta enviada"]},
    {"nome":"CARTÃO PORTO","tipo":"venda","emoji":"💳","cor":"#7aa3f8","ordem":10,"etapas":["Sem contato","Contato feito","Identificação do Interesse","Apresentação","Proposta enviada"]},
    {"nome":"FINANCIAMENTO E REFINANCIAMENTO","tipo":"venda","emoji":"💵","cor":"#4dd9c7","ordem":11,"etapas":["Sem contato","Contato feito","Identificação do Interesse","Apresentação","Proposta enviada"]},
    {"nome":"FUNIL COBRANÇA","tipo":"cobranca","emoji":"💰","cor":"#e05252","ordem":12,"etapas":["CLIENTES INADIMPLENTES","SOLICITAÇÃO TALLOS","TALLOS EM ANDAMENTO","MENSAGEM PADRÃO TALLOS","SEGUNDA TENTATIVA - TALLOS","TERCEIRA TENTATIVA - TALLOS","BOLETO ENVIADO (cancelamento)","PROCESSO FINALIZADO"]},
    {"nome":"FUNIL RASTREADOR","tipo":"venda","emoji":"📍","cor":"#e6c97a","ordem":13,"etapas":["NOVAS SOLICITAÇÕES","CONTATO TELEFÔNICO","MENSAGEM PADRÃO 1","MENSAGEM PADRÃO 2","AGENDADO","REAGENDADO 1","REAGENDADO 2","CONCLUÍDO","ENVIADO AO VENDEDOR","PROCESSO FINALIZADO"]},
    {"nome":"ASSISTÊNCIA 24HRS","tipo":"posVenda","emoji":"🛟","cor":"#7aa3f8","ordem":14,"etapas":["ABERTURA DE ASSISTÊNCIA","ENVIO DE DOCUMENTOS/FOTOS","AGENDAMENTO REALIZADO","REAGENDAMENTO 1","REAGENDAMENTO 2","AGUARDANDO SERVIÇO/REEMBOLSO","FINALIZADO","ABERTURA SAC","SAC FINALIZADO"]},
    {"nome":"SINISTRO","tipo":"posVenda","emoji":"🛡️","cor":"#4a80f0","ordem":15,"etapas":["SOLICITAÇÃO DE ABERTURA","AGUARDANDO DOCUMENTAÇÃO","AGUARDANDO VISTORIA","VISTORIA FEITA","AGUARDANDO DOCUMENTAÇÃO COMPLEMENTAR","ANALISE ESPECIAL / BAIXA DE GRAVAME","AGUARDANDO PROGRAMAÇÃO DE PGTO","VIDA","SINISTRO ENCERRADO"]},
    {"nome":"CANCELADOS / INADIMPLENTES","tipo":"cobranca","emoji":"🚫","cor":"#f08080","ordem":16,"etapas":["VERIFICAR APOLICE","CONTATO FEITO","ORÇAMENTO ENVIADO","REFEITO","CANCELADO"]},
    {"nome":"EMISSÃO E IMPLANTAÇÃO","tipo":"venda","emoji":"📤","cor":"#5b8def","ordem":17,"etapas":["AGUARDANDO EMISSÃO","EM IMPLANTAÇÃO","PENDENTE DOCUMENTOS","EMITIDO","FINALIZADO"]}
  ]
  $json$::jsonb;
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(v_funis)
  loop
    if not exists (select 1 from public.funis where nome = v_item->>'nome') then
      insert into public.funis (nome, tipo, emoji, cor, etapas, ordem)
      values (
        v_item->>'nome',
        v_item->>'tipo',
        v_item->>'emoji',
        v_item->>'cor',
        array(select jsonb_array_elements_text(v_item->'etapas')),
        (v_item->>'ordem')::int
      );
    end if;
  end loop;
end$$;

-- ═════════════════════════════════════════════════════════════════════
-- 10. META ADS (de 011_meta_ads.sql) — view exige negocios.status (já criada)
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.meta_config (
  id              int primary key default 1 check (id = 1),
  access_token    text,
  ad_account_id   text,
  page_id         text,
  app_id          text,
  app_secret      text,
  verify_token    text,
  webhook_subscribed boolean default false,
  expires_at      timestamptz,
  connected_by    uuid references public.users(id),
  configurado_em  timestamptz default now(),
  updated_at      timestamptz default now()
);

create table if not exists public.meta_campanhas (
  id            uuid primary key default uuid_generate_v4(),
  meta_id       text unique not null,
  nome          text not null,
  status        text,
  objetivo      text,
  daily_budget  numeric(12,2),
  inicio        date,
  fim           date,
  criada_em     timestamptz,
  atualizada_em timestamptz default now()
);

create table if not exists public.meta_adsets (
  id           uuid primary key default uuid_generate_v4(),
  meta_id      text unique not null,
  campanha_id  uuid references public.meta_campanhas(id) on delete cascade,
  nome         text not null,
  status       text,
  daily_budget numeric(12,2),
  atualizada_em timestamptz default now()
);

create table if not exists public.meta_ads (
  id        uuid primary key default uuid_generate_v4(),
  meta_id   text unique not null,
  adset_id  uuid references public.meta_adsets(id) on delete cascade,
  nome      text not null,
  status    text,
  formato   text,
  preview_url text,
  atualizado_em timestamptz default now()
);

create table if not exists public.meta_insights (
  id            uuid primary key default uuid_generate_v4(),
  entidade_tipo text not null check (entidade_tipo in ('campanha','adset','ad')),
  entidade_id   text not null,
  data          date  not null,
  impressoes    bigint default 0,
  alcance       bigint default 0,
  cliques       bigint default 0,
  gasto         numeric(12,2) default 0,
  leads         int default 0,
  ctr           numeric(8,4),
  cpc           numeric(8,2),
  cpm           numeric(8,2),
  atualizado_em timestamptz default now(),
  unique (entidade_tipo, entidade_id, data)
);

create index if not exists idx_meta_insights_entidade on public.meta_insights(entidade_tipo, entidade_id);
create index if not exists idx_meta_insights_data     on public.meta_insights(data);

create table if not exists public.meta_leads (
  id            uuid primary key default uuid_generate_v4(),
  meta_lead_id  text unique not null,
  form_id       text,
  ad_id         text,
  adset_id      text,
  campanha_id   text,
  page_id       text,
  campos        jsonb,
  cliente_id    uuid references public.clientes(id) on delete set null,
  negocio_id    uuid references public.negocios(id) on delete set null,
  recebido_em   timestamptz default now(),
  processado_em timestamptz
);

create index if not exists idx_meta_leads_ad      on public.meta_leads(ad_id);
create index if not exists idx_meta_leads_cliente on public.meta_leads(cliente_id);

alter table public.clientes
  add column if not exists meta_campaign_id text,
  add column if not exists meta_adset_id    text,
  add column if not exists meta_ad_id       text,
  add column if not exists meta_lead_id     text,
  add column if not exists meta_form_id     text;

alter table public.negocios
  add column if not exists meta_campaign_id text,
  add column if not exists meta_ad_id       text;

create index if not exists idx_clientes_meta_campaign on public.clientes(meta_campaign_id);
create index if not exists idx_negocios_meta_campaign on public.negocios(meta_campaign_id);

alter table public.meta_config     enable row level security;
alter table public.meta_campanhas  enable row level security;
alter table public.meta_adsets     enable row level security;
alter table public.meta_ads        enable row level security;
alter table public.meta_insights   enable row level security;
alter table public.meta_leads      enable row level security;

drop policy if exists "auth_read_meta_campanhas" on public.meta_campanhas;
create policy "auth_read_meta_campanhas" on public.meta_campanhas for select using (auth.role() = 'authenticated');
drop policy if exists "auth_read_meta_adsets" on public.meta_adsets;
create policy "auth_read_meta_adsets" on public.meta_adsets for select using (auth.role() = 'authenticated');
drop policy if exists "auth_read_meta_ads" on public.meta_ads;
create policy "auth_read_meta_ads" on public.meta_ads for select using (auth.role() = 'authenticated');
drop policy if exists "auth_read_meta_insights" on public.meta_insights;
create policy "auth_read_meta_insights" on public.meta_insights for select using (auth.role() = 'authenticated');
drop policy if exists "auth_read_meta_leads" on public.meta_leads;
create policy "auth_read_meta_leads" on public.meta_leads for select using (auth.role() = 'authenticated');

drop policy if exists "admin_read_meta_config" on public.meta_config;
create policy "admin_read_meta_config" on public.meta_config for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "admin_write_meta_config" on public.meta_config;
create policy "admin_write_meta_config" on public.meta_config for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "admin_write_meta_campanhas" on public.meta_campanhas;
create policy "admin_write_meta_campanhas" on public.meta_campanhas for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "admin_write_meta_adsets" on public.meta_adsets;
create policy "admin_write_meta_adsets" on public.meta_adsets for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "admin_write_meta_ads" on public.meta_ads;
create policy "admin_write_meta_ads" on public.meta_ads for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "admin_write_meta_insights" on public.meta_insights;
create policy "admin_write_meta_insights" on public.meta_insights for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "admin_write_meta_leads" on public.meta_leads;
create policy "admin_write_meta_leads" on public.meta_leads for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- View atribuição (campanha → vendas) — depende de negocios.status criado lá em cima
create or replace view public.meta_vendas_por_campanha as
select
  n.meta_campaign_id        as campanha_meta_id,
  c.nome                    as campanha_nome,
  count(*) filter (where n.status = 'ganho')        as vendas,
  count(*) filter (where n.status = 'perdido')      as perdas,
  count(*) filter (where n.status = 'em_andamento') as em_andamento,
  coalesce(sum(n.premio) filter (where n.status = 'ganho'), 0) as receita_total,
  coalesce(avg(n.premio) filter (where n.status = 'ganho'), 0) as ticket_medio
from public.negocios n
left join public.meta_campanhas c on c.meta_id = n.meta_campaign_id
where n.meta_campaign_id is not null
group by n.meta_campaign_id, c.nome;

-- ═════════════════════════════════════════════════════════════════════
-- 11. PIXEL + GRUPOS DE MENSAGENS + IMPORTAÇÕES (de 012)
-- ═════════════════════════════════════════════════════════════════════

alter table public.meta_config
  add column if not exists pixel_id           text,
  add column if not exists conversions_token  text;

create table if not exists public.mensagens_grupos (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  descricao   text,
  criado_por  uuid references public.users(id),
  criado_em   timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists public.mensagens_grupo_membros (
  grupo_id  uuid not null references public.mensagens_grupos(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  papel     text not null default 'membro' check (papel in ('admin','membro')),
  entrou_em timestamptz default now(),
  primary key (grupo_id, user_id)
);

alter table public.mensagens_internas
  add column if not exists grupo_id uuid references public.mensagens_grupos(id) on delete cascade;

do $$ begin
  alter table public.mensagens_internas alter column para_user_id drop not null;
exception when others then null; end$$;

create index if not exists idx_msg_grupo on public.mensagens_internas(grupo_id, criado_em desc);

alter table public.mensagens_grupos        enable row level security;
alter table public.mensagens_grupo_membros enable row level security;

drop policy if exists "membro_le_grupo" on public.mensagens_grupos;
create policy "membro_le_grupo" on public.mensagens_grupos for select using (
  exists (
    select 1 from public.mensagens_grupo_membros
    where grupo_id = mensagens_grupos.id and user_id = auth.uid()
  )
);
drop policy if exists "auth_cria_grupo" on public.mensagens_grupos;
create policy "auth_cria_grupo" on public.mensagens_grupos for insert with check (
  auth.role() = 'authenticated' and criado_por = auth.uid()
);
drop policy if exists "admin_grupo_atualiza" on public.mensagens_grupos;
create policy "admin_grupo_atualiza" on public.mensagens_grupos for update using (
  exists (select 1 from public.mensagens_grupo_membros
          where grupo_id = mensagens_grupos.id and user_id = auth.uid() and papel = 'admin')
);
drop policy if exists "admin_grupo_apaga" on public.mensagens_grupos;
create policy "admin_grupo_apaga" on public.mensagens_grupos for delete using (
  exists (select 1 from public.mensagens_grupo_membros
          where grupo_id = mensagens_grupos.id and user_id = auth.uid() and papel = 'admin')
);

drop policy if exists "membro_le_membros" on public.mensagens_grupo_membros;
create policy "membro_le_membros" on public.mensagens_grupo_membros for select using (
  exists (
    select 1 from public.mensagens_grupo_membros m2
    where m2.grupo_id = mensagens_grupo_membros.grupo_id and m2.user_id = auth.uid()
  )
);
drop policy if exists "criador_adiciona_membros" on public.mensagens_grupo_membros;
create policy "criador_adiciona_membros" on public.mensagens_grupo_membros for insert with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.mensagens_grupo_membros m2
    where m2.grupo_id = mensagens_grupo_membros.grupo_id
      and m2.user_id = auth.uid() and m2.papel = 'admin'
  )
);
drop policy if exists "admin_remove_membros" on public.mensagens_grupo_membros;
create policy "admin_remove_membros" on public.mensagens_grupo_membros for delete using (
  user_id = auth.uid()
  or exists (
    select 1 from public.mensagens_grupo_membros m2
    where m2.grupo_id = mensagens_grupo_membros.grupo_id
      and m2.user_id = auth.uid() and m2.papel = 'admin'
  )
);

-- mensagens_internas — recriar policies suportando grupos
drop policy if exists "participantes leem mensagens"      on public.mensagens_internas;
drop policy if exists "remetente envia mensagens"         on public.mensagens_internas;
drop policy if exists "destinatario marca lida"           on public.mensagens_internas;
drop policy if exists "le_mensagens_diretas_ou_grupo"     on public.mensagens_internas;
drop policy if exists "envia_mensagem_direta_ou_grupo"    on public.mensagens_internas;

create policy "le_mensagens_diretas_ou_grupo" on public.mensagens_internas for select using (
  (grupo_id is null and auth.uid() in (de_user_id, para_user_id))
  or
  (grupo_id is not null and exists (
    select 1 from public.mensagens_grupo_membros
    where grupo_id = mensagens_internas.grupo_id and user_id = auth.uid()
  ))
);
create policy "envia_mensagem_direta_ou_grupo" on public.mensagens_internas for insert with check (
  auth.uid() = de_user_id and (
    (grupo_id is null and para_user_id is not null)
    or
    (grupo_id is not null and exists (
      select 1 from public.mensagens_grupo_membros
      where grupo_id = mensagens_internas.grupo_id and user_id = auth.uid()
    ))
  )
);
create policy "destinatario marca lida" on public.mensagens_internas for update
  using (auth.uid() = para_user_id);

-- IMPORTAÇÕES GENÉRICAS
create table if not exists public.importacoes_dados (
  id              uuid primary key default uuid_generate_v4(),
  entidade        text not null check (entidade in
                    ('clientes','negocios','apolices','propostas','comissoes','tarefas')),
  nome_arquivo    text,
  formato         text check (formato in ('csv','xlsx','pdf')),
  qtd_lidos       int default 0,
  qtd_criados     int default 0,
  qtd_atualizados int default 0,
  qtd_erros       int default 0,
  erros           text[],
  status          text default 'processado' check (status in ('processado','erro','parcial')),
  user_id         uuid references public.users(id),
  iniciado_em     timestamptz default now(),
  concluido_em    timestamptz
);

create index if not exists idx_importacoes_dados_user on public.importacoes_dados(user_id, iniciado_em desc);
alter table public.importacoes_dados enable row level security;

drop policy if exists "admin_le_importacoes_dados" on public.importacoes_dados;
create policy "admin_le_importacoes_dados" on public.importacoes_dados for select using (
  user_id = auth.uid()
  or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "admin_escreve_importacoes_dados" on public.importacoes_dados;
create policy "admin_escreve_importacoes_dados" on public.importacoes_dados for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- ═════════════════════════════════════════════════════════════════════
-- 12. FINANCEIRO / DRE (de 013_financeiro.sql)
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.financeiro_seguradoras (
  id          uuid primary key default uuid_generate_v4(),
  codigo      text not null unique,
  nome        text not null,
  ativo       boolean default true,
  ordem       int default 0,
  criado_em   timestamptz default now()
);

insert into public.financeiro_seguradoras (codigo, nome, ordem) values
  ('3.1.01','ALLIANZ',1), ('3.1.02','AMERICAN LIFE',2), ('3.1.03','AZOS',3),
  ('3.1.04','BRADESCO',4), ('3.1.06','CRED PORTO',5), ('3.1.07','JUSTOS',6),
  ('3.1.08','DARWIN',7), ('3.1.09','ESSOR',8), ('3.1.10','EXCELSIOR',9),
  ('3.1.11','EZZE',10), ('3.1.12','HDI',11), ('3.1.13','ICATU',12),
  ('3.1.14','KOVR',13), ('3.1.15','YELLUM',14), ('3.1.16','MAPFRE',15),
  ('3.1.17','MET LIFE',16), ('3.1.18','NOVO',17), ('3.1.19','PIER',18),
  ('3.1.20','PORTO',19), ('3.1.21','PORTO CAP (PORTO VIDA)',20),
  ('3.1.22','PORTO CONSÓRCIO',21), ('3.1.23','PORTO SAÚDE',22),
  ('3.1.24','RC SAÚDE',23), ('3.1.25','SUHAI',24), ('3.1.26','SULAMERICA',25),
  ('3.1.27','TOKIO',26), ('3.1.28','YOUSE',27), ('3.1.29','ZURICH',28),
  ('3.1.30','INTERCOR',29), ('3.1.31','PORTO VIDA',30), ('3.1.32','BP SEGURADORA',31),
  ('3.2.03','RENDIMENTO APLICAÇÃO ITAU',32)
on conflict (codigo) do nothing;

create table if not exists public.financeiro_categorias (
  id          uuid primary key default uuid_generate_v4(),
  codigo      text not null unique,
  nome        text not null,
  tipo        text not null default 'despesa' check (tipo in ('despesa','receita','imposto')),
  cor         text,
  ordem       int default 0,
  ativo       boolean default true,
  criado_em   timestamptz default now()
);

insert into public.financeiro_categorias (codigo, nome, tipo, ordem) values
  ('4.1.01','Folha de Pagamento','despesa',1),
  ('4.1.02','Encargos / Impostos sobre folha','despesa',2),
  ('4.2.01','Aluguel','despesa',3),
  ('4.2.02','Energia/Água/Internet','despesa',4),
  ('4.3.01','Marketing / Anúncios','despesa',5),
  ('4.3.02','Software / SaaS','despesa',6),
  ('4.4.01','Impostos (PIS/COFINS/ISS)','imposto',7),
  ('4.4.02','IRPJ / CSLL','imposto',8),
  ('4.5.01','Material de escritório','despesa',9),
  ('4.5.02','Diversos','despesa',10)
on conflict (codigo) do nothing;

create table if not exists public.financeiro_despesas (
  id            uuid primary key default uuid_generate_v4(),
  categoria_id  uuid references public.financeiro_categorias(id),
  descricao     text not null,
  valor         numeric(12,2) not null check (valor >= 0),
  data          date not null default current_date,
  competencia   text,
  forma_pagto   text,
  fornecedor    text,
  obs           text,
  registrado_por uuid references public.users(id),
  criado_em     timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_fin_desp_data        on public.financeiro_despesas(data);
create index if not exists idx_fin_desp_competencia on public.financeiro_despesas(competencia);
create index if not exists idx_fin_desp_categoria   on public.financeiro_despesas(categoria_id);

create table if not exists public.financeiro_acessos (
  user_id      uuid primary key references public.users(id) on delete cascade,
  liberado_por uuid references public.users(id),
  liberado_em  timestamptz default now()
);

alter table public.comissoes_recebidas
  add column if not exists ir_retido        numeric(12,2) default 0,
  add column if not exists outros_descontos numeric(12,2) default 0,
  add column if not exists seguradora_codigo text;

alter table public.financeiro_seguradoras enable row level security;
alter table public.financeiro_categorias  enable row level security;
alter table public.financeiro_despesas    enable row level security;
alter table public.financeiro_acessos     enable row level security;

create or replace function public.tem_acesso_financeiro()
returns boolean
language sql security definer set search_path = public
as $$
  select exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
  ) or exists (
    select 1 from public.financeiro_acessos a where a.user_id = auth.uid()
  );
$$;

drop policy if exists "auth_le_seguradoras_dre" on public.financeiro_seguradoras;
create policy "auth_le_seguradoras_dre" on public.financeiro_seguradoras for select using (auth.role() = 'authenticated');
drop policy if exists "admin_escreve_seguradoras_dre" on public.financeiro_seguradoras;
create policy "admin_escreve_seguradoras_dre" on public.financeiro_seguradoras for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "financeiro_le_categorias" on public.financeiro_categorias;
create policy "financeiro_le_categorias" on public.financeiro_categorias for select using (public.tem_acesso_financeiro());
drop policy if exists "admin_escreve_categorias" on public.financeiro_categorias;
create policy "admin_escreve_categorias" on public.financeiro_categorias for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "financeiro_le_despesas" on public.financeiro_despesas;
create policy "financeiro_le_despesas" on public.financeiro_despesas for select using (public.tem_acesso_financeiro());
drop policy if exists "financeiro_escreve_despesas" on public.financeiro_despesas;
create policy "financeiro_escreve_despesas" on public.financeiro_despesas for all using (public.tem_acesso_financeiro());

drop policy if exists "admin_gerencia_acessos_fin" on public.financeiro_acessos;
create policy "admin_gerencia_acessos_fin" on public.financeiro_acessos for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "self_le_acesso_fin" on public.financeiro_acessos;
create policy "self_le_acesso_fin" on public.financeiro_acessos for select using (user_id = auth.uid());

-- View DRE mensal
create or replace view public.financeiro_dre_mensal as
with receitas as (
  select coalesce(competencia, to_char(data_recebimento, 'YYYY-MM')) as competencia,
         sum(valor) as bruto,
         sum(coalesce(ir_retido,0)) as ir,
         sum(coalesce(outros_descontos,0)) as outros,
         sum(valor - coalesce(ir_retido,0) - coalesce(outros_descontos,0)) as liquido
  from public.comissoes_recebidas where status = 'recebido'
  group by 1
),
despesas as (
  select coalesce(competencia, to_char(data, 'YYYY-MM')) as competencia,
         sum(valor) as total
  from public.financeiro_despesas
  group by 1
)
select
  coalesce(r.competencia, d.competencia) as competencia,
  coalesce(r.bruto, 0)    as receita_bruta,
  coalesce(r.ir, 0)       as ir_retido,
  coalesce(r.outros, 0)   as outros_descontos,
  coalesce(r.liquido, 0)  as receita_liquida,
  coalesce(d.total, 0)    as total_despesas,
  coalesce(r.liquido, 0) - coalesce(d.total, 0) as resultado
from receitas r
full outer join despesas d on d.competencia = r.competencia
order by competencia desc;

drop view if exists public.financeiro_faturamento_seguradora;
create or replace view public.financeiro_faturamento_seguradora as
with base as (
  select
    coalesce(cr.seguradora_codigo, fs.codigo)   as codigo,
    coalesce(fs.nome, cr.seguradora, 'Outras')  as seguradora,
    coalesce(cr.competencia, to_char(cr.data_recebimento, 'YYYY-MM')) as competencia,
    cr.valor,
    coalesce(cr.ir_retido, 0)         as ir_retido,
    coalesce(cr.outros_descontos, 0)  as outros_descontos
  from public.comissoes_recebidas cr
  left join public.financeiro_seguradoras fs
    on fs.codigo = cr.seguradora_codigo
    or upper(fs.nome) = upper(cr.seguradora)
  where cr.status = 'recebido'
)
select
  codigo, seguradora, competencia,
  count(*)                            as qtd_comissoes,
  coalesce(sum(valor), 0)             as bruto,
  coalesce(sum(ir_retido), 0)         as ir_retido,
  coalesce(sum(outros_descontos), 0)  as outros_descontos,
  coalesce(sum(valor - ir_retido - outros_descontos), 0) as liquido
from base
group by codigo, seguradora, competencia
order by competencia desc, codigo;

drop trigger if exists fin_desp_updated_at on public.financeiro_despesas;
create trigger fin_desp_updated_at
  before update on public.financeiro_despesas
  for each row execute procedure update_updated_at();

-- ═════════════════════════════════════════════════════════════════════
-- FIM. Para limpar dados (clientes, funis, negociações) antes de
-- reimportar do RD Station / Meta, use o arquivo:
--   supabase/sql_helpers/limpar_dados.sql
-- ═════════════════════════════════════════════════════════════════════
