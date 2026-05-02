-- ═══════════════════════════════════════════════════════════════════
-- 028 — Mural: humor do dia
-- Tabela dedicada para o registro do humor diário dos usuários.
-- (Anteriormente estava sendo gravado em mural_reacoes, mas falhava
--  pois post_id é uuid com FK para mural_posts.)
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.mural_humor (
  id        uuid primary key default uuid_generate_v4(),
  user_id   uuid not null references public.users(id) on delete cascade,
  dia       date not null default current_date,
  emoji     text not null,
  criado_em timestamptz default now(),
  unique (user_id, dia)
);

create index if not exists mural_humor_dia_idx on public.mural_humor (dia);

alter table public.mural_humor enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='mural_humor' and policyname='autenticados leem humor') then
    create policy "autenticados leem humor" on public.mural_humor for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='mural_humor' and policyname='autenticados escrevem humor') then
    create policy "autenticados escrevem humor" on public.mural_humor for all using (auth.role() = 'authenticated');
  end if;
end $$;
