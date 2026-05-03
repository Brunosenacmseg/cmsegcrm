-- ─────────────────────────────────────────────────────────────
-- 051_email_contas.sql
-- Módulo de Email: conta SMTP/IMAP por usuário e log de envios.
-- A senha SMTP é guardada como ciphertext (AES-GCM) — encriptada
-- e desencriptada no servidor (route handlers) com EMAIL_ENC_KEY.
-- A coluna nunca é retornada para o cliente.
-- ─────────────────────────────────────────────────────────────

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.email_contas (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null unique references public.users(id) on delete cascade,
  -- Identidade do remetente
  from_email      text not null,
  from_nome       text,
  assinatura      text,
  -- SMTP (saída)
  smtp_host       text not null,
  smtp_port       int  not null default 587,
  smtp_secure     boolean not null default false, -- true => SSL/465; false => STARTTLS/587
  smtp_user       text not null,
  smtp_pass_enc   text not null,                  -- ciphertext base64
  -- IMAP (entrada — opcional, base para sincronização futura)
  imap_host       text,
  imap_port       int default 993,
  imap_secure     boolean default true,
  imap_user       text,
  -- Status
  ativo           boolean not null default true,
  ultimo_teste_em timestamptz,
  ultimo_teste_ok boolean,
  ultimo_teste_msg text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists idx_email_contas_user on public.email_contas(user_id);

alter table public.email_contas enable row level security;

-- Cada usuário enxerga e gerencia apenas a própria conta. O ciphertext da
-- senha está protegido pela RLS — mesmo lido, não vale sem EMAIL_ENC_KEY.
drop policy if exists "email_contas_self_select" on public.email_contas;
create policy "email_contas_self_select" on public.email_contas
  for select using (auth.uid() = user_id);

drop policy if exists "email_contas_self_insert" on public.email_contas;
create policy "email_contas_self_insert" on public.email_contas
  for insert with check (auth.uid() = user_id);

drop policy if exists "email_contas_self_update" on public.email_contas;
create policy "email_contas_self_update" on public.email_contas
  for update using (auth.uid() = user_id);

drop policy if exists "email_contas_self_delete" on public.email_contas;
create policy "email_contas_self_delete" on public.email_contas
  for delete using (auth.uid() = user_id);

create or replace function public.email_contas_set_atualizado()
returns trigger as $$ begin new.atualizado_em = now(); return new; end; $$ language plpgsql;
drop trigger if exists email_contas_atualizado on public.email_contas;
create trigger email_contas_atualizado
  before update on public.email_contas
  for each row execute procedure public.email_contas_set_atualizado();

-- ─── Log de emails enviados ──────────────────────────────────
create table if not exists public.emails_enviados (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  conta_id      uuid references public.email_contas(id) on delete set null,
  para          text not null,            -- destinatários (separados por vírgula)
  cc            text,
  bcc           text,
  assunto       text,
  corpo_html    text,
  corpo_texto   text,
  -- vínculos opcionais com entidades do CRM (para automações futuras)
  cliente_id    uuid,
  negocio_id    uuid,
  apolice_id    uuid,
  template_id   uuid references public.email_templates(id) on delete set null,
  -- status do envio
  status        text not null default 'pendente'
                check (status in ('pendente','enviado','erro')),
  erro          text,
  message_id    text,
  enviado_em    timestamptz,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_emails_enviados_user    on public.emails_enviados(user_id, criado_em desc);
create index if not exists idx_emails_enviados_cliente on public.emails_enviados(cliente_id);
create index if not exists idx_emails_enviados_negocio on public.emails_enviados(negocio_id);
create index if not exists idx_emails_enviados_status  on public.emails_enviados(status);

alter table public.emails_enviados enable row level security;

drop policy if exists "emails_enviados_self_select" on public.emails_enviados;
create policy "emails_enviados_self_select" on public.emails_enviados
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

drop policy if exists "emails_enviados_self_insert" on public.emails_enviados;
create policy "emails_enviados_self_insert" on public.emails_enviados
  for insert with check (auth.uid() = user_id);

drop policy if exists "emails_enviados_self_update" on public.emails_enviados;
create policy "emails_enviados_self_update" on public.emails_enviados
  for update using (auth.uid() = user_id);
