-- ═══════════════════════════════════════════
-- RD Station CRM — Integração de importação
-- Adiciona colunas de id externo para deduplicação
-- ═══════════════════════════════════════════

alter table public.clientes  add column if not exists rd_id text;
alter table public.negocios  add column if not exists rd_id text;
alter table public.tarefas   add column if not exists rd_id text;
alter table public.funis     add column if not exists rd_id text;
alter table public.users     add column if not exists rd_id text;
alter table public.historico add column if not exists rd_id text;

create unique index if not exists clientes_rd_id_idx  on public.clientes(rd_id)  where rd_id is not null;
create unique index if not exists negocios_rd_id_idx  on public.negocios(rd_id)  where rd_id is not null;
create unique index if not exists tarefas_rd_id_idx   on public.tarefas(rd_id)   where rd_id is not null;
create unique index if not exists funis_rd_id_idx     on public.funis(rd_id)     where rd_id is not null;
create unique index if not exists users_rd_id_idx     on public.users(rd_id)     where rd_id is not null;
create unique index if not exists historico_rd_id_idx on public.historico(rd_id) where rd_id is not null;

-- Tabela de log de sincronizações
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

alter table public.rdstation_syncs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='rdstation_syncs' and policyname='admins gerenciam syncs') then
    create policy "admins gerenciam syncs" on public.rdstation_syncs for all
      using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
  end if;
end $$;
