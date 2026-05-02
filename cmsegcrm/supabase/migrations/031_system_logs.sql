-- ═══════════════════════════════════════════════════════════════════
-- CM.segCRM — Migration 031: Logs de sistema e logins
--
-- Cria duas tabelas de auditoria:
--   • system_logs : histórico do que cada usuário acessa/faz no CRM
--                   (navegação, ações relevantes em registros, etc.)
--   • login_logs  : registro de cada login (data/hora, IP, user-agent
--                   e localização aproximada)
--
-- Acesso de leitura: somente admins. Inserção: qualquer usuário
-- autenticado pode registrar o próprio log.
-- ═══════════════════════════════════════════════════════════════════

-- ─── SYSTEM LOGS ─────────────────────────────────────────────────────
create table if not exists public.system_logs (
  id          bigserial primary key,
  user_id     uuid references public.users(id) on delete set null,
  user_email  text,
  user_nome   text,
  acao        text not null,                -- ex: 'page_view', 'cliente.criar', 'apolice.editar'
  recurso     text,                         -- ex: 'clientes', 'apolices', 'cotacoes'
  recurso_id  text,                         -- id do registro afetado, quando aplicável
  detalhe     text,                         -- descrição livre
  metadata    jsonb,                        -- payload extra (campos alterados, etc.)
  ip          text,
  user_agent  text,
  pathname    text,                         -- caminho acessado no app
  criado_em   timestamptz not null default now()
);

create index if not exists idx_system_logs_user      on public.system_logs(user_id);
create index if not exists idx_system_logs_criado_em on public.system_logs(criado_em desc);
create index if not exists idx_system_logs_acao      on public.system_logs(acao);
create index if not exists idx_system_logs_recurso   on public.system_logs(recurso);

-- ─── LOGIN LOGS ──────────────────────────────────────────────────────
create table if not exists public.login_logs (
  id          bigserial primary key,
  user_id     uuid references public.users(id) on delete set null,
  user_email  text,
  user_nome   text,
  sucesso     boolean not null default true,
  motivo      text,                         -- preenchido quando sucesso=false
  ip          text,
  user_agent  text,
  pais        text,
  regiao      text,
  cidade      text,
  latitude    numeric(9,6),
  longitude   numeric(9,6),
  timezone    text,
  isp         text,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_login_logs_user      on public.login_logs(user_id);
create index if not exists idx_login_logs_criado_em on public.login_logs(criado_em desc);

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.system_logs enable row level security;
alter table public.login_logs  enable row level security;

-- Leitura: apenas admin
drop policy if exists "system_logs_select_admin" on public.system_logs;
create policy "system_logs_select_admin"
  on public.system_logs for select
  using (public.current_user_role() = 'admin');

drop policy if exists "login_logs_select_admin" on public.login_logs;
create policy "login_logs_select_admin"
  on public.login_logs for select
  using (public.current_user_role() = 'admin');

-- Inserção: qualquer authenticated registra o próprio log
drop policy if exists "system_logs_insert_self" on public.system_logs;
create policy "system_logs_insert_self"
  on public.system_logs for insert
  with check (
    auth.uid() is not null
    and (user_id is null or user_id = auth.uid())
  );

-- login_logs: permite inserir mesmo sem user_id (tentativas mal-sucedidas)
drop policy if exists "login_logs_insert_any" on public.login_logs;
create policy "login_logs_insert_any"
  on public.login_logs for insert
  with check (true);

-- Não permitimos UPDATE nem DELETE: logs são imutáveis.
