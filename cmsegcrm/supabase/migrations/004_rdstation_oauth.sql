-- ═══════════════════════════════════════════
-- RD Station CRM v2 — Tokens OAuth
-- ═══════════════════════════════════════════

create table if not exists public.rdstation_oauth (
  id            int primary key default 1,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  updated_at    timestamptz default now(),
  constraint rdstation_oauth_singleton check (id = 1)
);

alter table public.rdstation_oauth enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='rdstation_oauth' and policyname='admins gerenciam oauth') then
    create policy "admins gerenciam oauth" on public.rdstation_oauth for all
      using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
  end if;
end $$;
