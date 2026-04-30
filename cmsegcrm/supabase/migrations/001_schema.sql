-- ═══════════════════════════════════════════
-- CM.segCRM — Schema Supabase
-- ═══════════════════════════════════════════

-- Habilitar UUID
create extension if not exists "uuid-ossp";

-- ─── USUÁRIOS / CORRETORES ───────────────────
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  email       text not null,
  role        text not null default 'corretor' check (role in ('admin','corretor')),
  avatar_url  text,
  created_at  timestamptz default now()
);

-- ─── CLIENTES ────────────────────────────────
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

-- ─── FUNIS ───────────────────────────────────
create table if not exists public.funis (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  tipo        text not null check (tipo in ('venda','renovacao','cobranca','posVenda')),
  emoji       text,
  cor         text,
  etapas      text[] not null,
  ordem       int default 0,
  created_at  timestamptz default now()
);

-- Funis padrão
insert into public.funis (nome, tipo, emoji, cor, etapas, ordem)
select * from (values
  ('Venda Nova',          'venda',     '🆕', '#c9a84c', ARRAY['Prospecção','Cotação Enviada','Proposta Enviada','Negociação','Fechado Ganho','Fechado Perdido'], 1),
  ('Renovação',           'renovacao', '🔄', '#1cb5a0', ARRAY['Identificado','Cotando','Proposta Enviada','Aguardando Assinatura','Renovado','Não Renovado'], 2),
  ('Cobrança',            'cobranca',  '💰', '#e05252', ARRAY['Em Atraso','Contato Realizado','Promessa de Pagamento','Pago','Inadimplente'], 3),
  ('Pós-venda / Sinistro','posVenda',  '🛡️','#4a80f0', ARRAY['Novo Sinistro','Em Análise','Aguardando Docs','Em Regulação','Concluído','Negado'], 4)
) as v(nome,tipo,emoji,cor,etapas,ordem)
where not exists (select 1 from public.funis limit 1);

-- ─── NEGÓCIOS ────────────────────────────────
create table if not exists public.negocios (
  id           uuid primary key default uuid_generate_v4(),
  cliente_id   uuid not null references public.clientes(id) on delete cascade,
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

-- ─── HISTÓRICO ───────────────────────────────
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

-- ─── TAREFAS ─────────────────────────────────
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

-- ─── APÓLICES ────────────────────────────────
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

-- ═══════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════
alter table public.users     enable row level security;
alter table public.clientes  enable row level security;
alter table public.negocios  enable row level security;
alter table public.historico enable row level security;
alter table public.tarefas   enable row level security;
alter table public.apolices  enable row level security;
alter table public.funis     enable row level security;

-- Policies (drop antes para evitar erro de duplicação)
do $$ begin
  -- clientes
  if not exists (select 1 from pg_policies where tablename='clientes' and policyname='autenticados leem') then
    create policy "autenticados leem" on public.clientes for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='clientes' and policyname='autenticados escrevem clientes') then
    create policy "autenticados escrevem clientes" on public.clientes for all using (auth.role() = 'authenticated');
  end if;
  -- negocios
  if not exists (select 1 from pg_policies where tablename='negocios' and policyname='autenticados leem') then
    create policy "autenticados leem" on public.negocios for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='negocios' and policyname='autenticados escrevem negocios') then
    create policy "autenticados escrevem negocios" on public.negocios for all using (auth.role() = 'authenticated');
  end if;
  -- historico
  if not exists (select 1 from pg_policies where tablename='historico' and policyname='autenticados leem') then
    create policy "autenticados leem" on public.historico for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='historico' and policyname='autenticados escrevem historico') then
    create policy "autenticados escrevem historico" on public.historico for all using (auth.role() = 'authenticated');
  end if;
  -- tarefas
  if not exists (select 1 from pg_policies where tablename='tarefas' and policyname='autenticados leem') then
    create policy "autenticados leem" on public.tarefas for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='tarefas' and policyname='autenticados escrevem tarefas') then
    create policy "autenticados escrevem tarefas" on public.tarefas for all using (auth.role() = 'authenticated');
  end if;
  -- apolices
  if not exists (select 1 from pg_policies where tablename='apolices' and policyname='autenticados leem') then
    create policy "autenticados leem" on public.apolices for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='apolices' and policyname='autenticados escrevem apolices') then
    create policy "autenticados escrevem apolices" on public.apolices for all using (auth.role() = 'authenticated');
  end if;
  -- funis
  if not exists (select 1 from pg_policies where tablename='funis' and policyname='autenticados leem') then
    create policy "autenticados leem" on public.funis for select using (auth.role() = 'authenticated');
  end if;
  -- users
  if not exists (select 1 from pg_policies where tablename='users' and policyname='autenticados leem') then
    create policy "autenticados leem" on public.users for select using (auth.role() = 'authenticated');
  end if;
end $$;

-- Função para criar user na tabela public ao registrar
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

-- Updated_at automático
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists clientes_updated_at on public.clientes;
create trigger clientes_updated_at  before update on public.clientes  for each row execute procedure update_updated_at();
drop trigger if exists negocios_updated_at on public.negocios;
create trigger negocios_updated_at  before update on public.negocios  for each row execute procedure update_updated_at();
