-- ═══════════════════════════════════════════════════════════════════
-- 050 — Cache de pipelines/stages do RD Station
-- Persiste o resultado das chamadas pesadas /deal_pipelines e
-- /deal_stages para que o importarNegocios pule esse preâmbulo nas
-- próximas execuções, evitando timeout do Vercel free (60s).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.rdstation_cache (
  chave         text primary key,
  valor         jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table public.rdstation_cache enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='rdstation_cache' and policyname='admin_le_rdcache') then
    create policy "admin_le_rdcache" on public.rdstation_cache for select using (
      exists (select 1 from public.users where id = auth.uid() and role = 'admin')
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='rdstation_cache' and policyname='admin_escreve_rdcache') then
    create policy "admin_escreve_rdcache" on public.rdstation_cache for all using (
      exists (select 1 from public.users where id = auth.uid() and role = 'admin')
    );
  end if;
end $$;
