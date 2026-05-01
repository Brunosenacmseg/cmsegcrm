-- ─────────────────────────────────────────────────────────────
-- 017_agentes_ia.sql
-- A) Cadastro de "Agentes de IA" (perfis de prompt + modelo Claude
--    + parâmetros) - apenas admin gerencia.
-- B) whatsapp_instancias ganha agente_id + agente_ativo, pra que o
--    webhook responda automaticamente usando o agente escolhido.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.ai_agentes (
  id              uuid primary key default uuid_generate_v4(),
  nome            text not null,
  descricao       text,
  modelo          text not null default 'claude-sonnet-4-6',
  system_prompt   text not null,
  temperatura     numeric(3,2) default 0.7 check (temperatura between 0 and 1),
  max_tokens      int default 1024 check (max_tokens between 64 and 8192),
  ativo           boolean default true,
  criado_por      uuid references public.users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_ai_agentes_ativo on public.ai_agentes(ativo);

alter table public.whatsapp_instancias
  add column if not exists agente_id    uuid references public.ai_agentes(id) on delete set null,
  add column if not exists agente_ativo boolean default false;

-- RLS: apenas admin lê/escreve agentes
alter table public.ai_agentes enable row level security;

drop policy if exists "admin_le_ai_agentes" on public.ai_agentes;
create policy "admin_le_ai_agentes" on public.ai_agentes for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "admin_escreve_ai_agentes" on public.ai_agentes;
create policy "admin_escreve_ai_agentes" on public.ai_agentes for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop trigger if exists ai_agentes_updated_at on public.ai_agentes;
create trigger ai_agentes_updated_at
  before update on public.ai_agentes
  for each row execute procedure update_updated_at();

-- Seed: um agente exemplo (só se não houver nenhum)
insert into public.ai_agentes (nome, descricao, modelo, system_prompt)
select 'Atendente Padrão',
       'Responde clientes no WhatsApp de forma cordial. Edite o prompt antes de ativar em produção.',
       'claude-sonnet-4-6',
       'Você é uma atendente de uma corretora de seguros chamada CM.seg. Responda de forma cordial, em português do Brasil, e sempre confirme dados antes de tomar ações. Se o cliente pedir algo que precise de aprovação humana (cancelamento, alteração de dados sensíveis, sinistro), informe que vai encaminhar para um corretor.'
where not exists (select 1 from public.ai_agentes);
