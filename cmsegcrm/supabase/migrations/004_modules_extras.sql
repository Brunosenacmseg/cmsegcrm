-- ═══════════════════════════════════════════════════════════════════
-- CM.segCRM — Migration 004: Tabelas dos demais módulos
--   • manuais
--   • metas
--   • mensagens_internas
--   • mural_posts / mural_comentarios / mural_reacoes / mural_mencoes
--   • whatsapp_instancias / whatsapp_mensagens
--   • goto_tokens
--   • ligacoes
--   • users.ramal_goto
-- Execute no Supabase SQL Editor depois das migrations 001, 002 e 003.
-- ═══════════════════════════════════════════════════════════════════

-- ─── USERS: ramal_goto (lido por usuários/perfil/telefone) ───────────
alter table public.users add column if not exists ramal_goto text;

-- ─── MANUAIS (biblioteca de arquivos compartilhados) ─────────────────
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
alter table public.manuais enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='manuais' and policyname='autenticados leem manuais') then
    create policy "autenticados leem manuais" on public.manuais for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='manuais' and policyname='autenticados escrevem manuais') then
    create policy "autenticados escrevem manuais" on public.manuais for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- ─── METAS (metas de venda/comissão por usuário) ─────────────────────
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
alter table public.metas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='metas' and policyname='autenticados leem metas') then
    create policy "autenticados leem metas" on public.metas for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='metas' and policyname='autenticados escrevem metas') then
    create policy "autenticados escrevem metas" on public.metas for all using (auth.role() = 'authenticated');
  end if;
end $$;
drop trigger if exists metas_updated_at on public.metas;
create trigger metas_updated_at before update on public.metas for each row execute procedure update_updated_at();

-- ─── MENSAGENS INTERNAS (chat entre usuários) ────────────────────────
create table if not exists public.mensagens_internas (
  id            uuid primary key default uuid_generate_v4(),
  de_user_id    uuid not null references public.users(id) on delete cascade,
  para_user_id  uuid not null references public.users(id) on delete cascade,
  conteudo      text not null,
  lida          boolean default false,
  criado_em     timestamptz default now()
);
create index if not exists mensagens_internas_idx on public.mensagens_internas (para_user_id, de_user_id, criado_em desc);
alter table public.mensagens_internas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='mensagens_internas' and policyname='participantes leem mensagens') then
    create policy "participantes leem mensagens" on public.mensagens_internas for select
      using (auth.uid() in (de_user_id, para_user_id));
  end if;
  if not exists (select 1 from pg_policies where tablename='mensagens_internas' and policyname='remetente envia mensagens') then
    create policy "remetente envia mensagens" on public.mensagens_internas for insert
      with check (auth.uid() = de_user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='mensagens_internas' and policyname='destinatario marca lida') then
    create policy "destinatario marca lida" on public.mensagens_internas for update
      using (auth.uid() = para_user_id);
  end if;
end $$;

-- ─── MURAL ───────────────────────────────────────────────────────────
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

alter table public.mural_posts        enable row level security;
alter table public.mural_comentarios  enable row level security;
alter table public.mural_reacoes      enable row level security;
alter table public.mural_mencoes      enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='mural_posts' and policyname='autenticados leem posts') then
    create policy "autenticados leem posts" on public.mural_posts for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='mural_posts' and policyname='autenticados escrevem posts') then
    create policy "autenticados escrevem posts" on public.mural_posts for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='mural_comentarios' and policyname='autenticados leem comentarios') then
    create policy "autenticados leem comentarios" on public.mural_comentarios for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='mural_comentarios' and policyname='autenticados escrevem comentarios') then
    create policy "autenticados escrevem comentarios" on public.mural_comentarios for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='mural_reacoes' and policyname='autenticados leem reacoes') then
    create policy "autenticados leem reacoes" on public.mural_reacoes for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='mural_reacoes' and policyname='autenticados escrevem reacoes') then
    create policy "autenticados escrevem reacoes" on public.mural_reacoes for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='mural_mencoes' and policyname='autenticados leem mencoes') then
    create policy "autenticados leem mencoes" on public.mural_mencoes for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='mural_mencoes' and policyname='autenticados escrevem mencoes') then
    create policy "autenticados escrevem mencoes" on public.mural_mencoes for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- ─── WHATSAPP (Evolution API) ────────────────────────────────────────
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

alter table public.whatsapp_instancias enable row level security;
alter table public.whatsapp_mensagens  enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='whatsapp_instancias' and policyname='autenticados leem whatsapp_instancias') then
    create policy "autenticados leem whatsapp_instancias" on public.whatsapp_instancias for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='whatsapp_instancias' and policyname='autenticados escrevem whatsapp_instancias') then
    create policy "autenticados escrevem whatsapp_instancias" on public.whatsapp_instancias for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='whatsapp_mensagens' and policyname='autenticados leem whatsapp_mensagens') then
    create policy "autenticados leem whatsapp_mensagens" on public.whatsapp_mensagens for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='whatsapp_mensagens' and policyname='autenticados escrevem whatsapp_mensagens') then
    create policy "autenticados escrevem whatsapp_mensagens" on public.whatsapp_mensagens for all using (auth.role() = 'authenticated');
  end if;
end $$;

drop trigger if exists whatsapp_instancias_updated_at on public.whatsapp_instancias;
create trigger whatsapp_instancias_updated_at before update on public.whatsapp_instancias
  for each row execute procedure update_updated_at();

-- ─── GOTO CONNECT (tokens OAuth) ─────────────────────────────────────
create table if not exists public.goto_tokens (
  user_id       uuid primary key references public.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz not null,
  account_key   text,
  updated_at    timestamptz default now()
);
alter table public.goto_tokens enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='goto_tokens' and policyname='proprio le goto_tokens') then
    create policy "proprio le goto_tokens" on public.goto_tokens for select using (auth.uid() = user_id);
  end if;
  -- Webhook usa service role key → bypassa RLS, mas autenticados escreverem é seguro (cada um o seu)
  if not exists (select 1 from pg_policies where tablename='goto_tokens' and policyname='autenticados gerenciam proprio goto_tokens') then
    create policy "autenticados gerenciam proprio goto_tokens" on public.goto_tokens for all using (auth.uid() = user_id);
  end if;
end $$;

-- ─── LIGAÇÕES (histórico GoTo) ───────────────────────────────────────
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

alter table public.ligacoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='ligacoes' and policyname='autenticados leem ligacoes') then
    create policy "autenticados leem ligacoes" on public.ligacoes for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='ligacoes' and policyname='autenticados escrevem ligacoes') then
    create policy "autenticados escrevem ligacoes" on public.ligacoes for all using (auth.role() = 'authenticated');
  end if;
end $$;
