-- ─────────────────────────────────────────────────────────────
-- 006_funis_admin.sql
-- Admin-managed funis (custom funnels) + ganho/perdido em negócios
-- ─────────────────────────────────────────────────────────────

-- 1) Tipo do funil: remover check fixo para permitir tipos livres
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.funis'::regclass and contype = 'c'
  loop
    execute format('alter table public.funis drop constraint %I', r.conname);
  end loop;
end$$;

-- 2) Garantir colunas opcionais usadas pela tela de configuração
alter table public.funis
  add column if not exists descricao text;

-- 3) Negócios: status ganho/perdido + auditoria de fechamento
alter table public.negocios
  add column if not exists status text not null default 'em_andamento'
    check (status in ('em_andamento','ganho','perdido')),
  add column if not exists motivo_perda    text,
  add column if not exists data_fechamento timestamptz,
  add column if not exists fechado_por     uuid references public.users(id);

create index if not exists idx_negocios_status on public.negocios(status);

-- 4) RLS para funis: leitura para autenticados, escrita só admin
do $$
begin
  if not exists (select 1 from pg_policies where tablename='funis' and policyname='admin_insert_funis') then
    create policy "admin_insert_funis" on public.funis
      for insert with check (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;

  if not exists (select 1 from pg_policies where tablename='funis' and policyname='admin_update_funis') then
    create policy "admin_update_funis" on public.funis
      for update using (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;

  if not exists (select 1 from pg_policies where tablename='funis' and policyname='admin_delete_funis') then
    create policy "admin_delete_funis" on public.funis
      for delete using (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;
end$$;
