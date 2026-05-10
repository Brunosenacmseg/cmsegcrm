-- ─────────────────────────────────────────────────────────────
-- 099_whatsapp_conversa_agentes.sql
-- Permite escolher (e ativar/desativar) um agente de IA por
-- CONVERSA do WhatsApp, sobrepondo o agente padrão configurado
-- na instância. Se a conversa não tiver registro aqui, o webhook
-- continua usando o agente da instância como antes.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.whatsapp_conversa_agentes (
  id           uuid primary key default uuid_generate_v4(),
  instancia_id uuid not null references public.whatsapp_instancias(id) on delete cascade,
  remoto_jid   text not null,
  agente_id    uuid references public.ai_agentes(id) on delete set null,
  agente_ativo boolean not null default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (instancia_id, remoto_jid)
);

create index if not exists whatsapp_conversa_agentes_idx
  on public.whatsapp_conversa_agentes (instancia_id, remoto_jid);

alter table public.whatsapp_conversa_agentes enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'whatsapp_conversa_agentes'
      and policyname = 'autenticados leem whatsapp_conversa_agentes'
  ) then
    create policy "autenticados leem whatsapp_conversa_agentes"
      on public.whatsapp_conversa_agentes
      for select using (auth.role() = 'authenticated');
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'whatsapp_conversa_agentes'
      and policyname = 'autenticados escrevem whatsapp_conversa_agentes'
  ) then
    create policy "autenticados escrevem whatsapp_conversa_agentes"
      on public.whatsapp_conversa_agentes
      for all using (auth.role() = 'authenticated');
  end if;
end $$;

drop trigger if exists whatsapp_conversa_agentes_updated_at on public.whatsapp_conversa_agentes;
create trigger whatsapp_conversa_agentes_updated_at
  before update on public.whatsapp_conversa_agentes
  for each row execute procedure update_updated_at();
