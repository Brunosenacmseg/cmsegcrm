-- ─────────────────────────────────────────────────────────────
-- 007_comissoes_recebidas.sql
-- Comissões efetivamente recebidas, vinculadas a apólice/negócio
-- e atribuídas ao vendedor.
--
-- Regras:
--   - Cada lançamento tem um vendedor_id (default = vendedor do negócio/apólice)
--   - Corretor vê apenas as próprias; Líder vê as suas + da equipe;
--     Admin vê todas (RLS via public.can_see_user definida em 005).
--   - Apenas admin pode INSERIR/ATUALIZAR/EXCLUIR.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.comissoes_recebidas (
  id                 uuid primary key default uuid_generate_v4(),
  negocio_id         uuid references public.negocios(id) on delete set null,
  apolice_id         uuid references public.apolices(id) on delete set null,
  cliente_id         uuid references public.clientes(id) on delete set null,
  vendedor_id        uuid not null references public.users(id),
  valor              numeric(12,2) not null check (valor >= 0),
  competencia        text,                  -- ex: '2026-04'
  data_recebimento   date,
  parcela            int default 1,
  total_parcelas     int default 1,
  seguradora         text,
  produto            text,
  status             text not null default 'recebido'
                     check (status in ('previsto','recebido','cancelado')),
  origem             text not null default 'manual'
                     check (origem in ('manual','importacao','api')),
  importacao_id      uuid references public.importacoes_comissao(id) on delete set null,
  obs                text,
  registrado_por     uuid references public.users(id),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists idx_comrec_vendedor    on public.comissoes_recebidas(vendedor_id);
create index if not exists idx_comrec_competencia on public.comissoes_recebidas(competencia);
create index if not exists idx_comrec_negocio     on public.comissoes_recebidas(negocio_id);
create index if not exists idx_comrec_apolice     on public.comissoes_recebidas(apolice_id);

alter table public.comissoes_recebidas enable row level security;

do $$
begin
  -- Leitura: hierarquia (corretor própria, líder + equipe, admin tudo)
  if not exists (select 1 from pg_policies where tablename='comissoes_recebidas' and policyname='scoped_read_comissoes_recebidas') then
    create policy "scoped_read_comissoes_recebidas" on public.comissoes_recebidas
      for select using (public.can_see_user(vendedor_id));
  end if;

  -- Escrita: apenas admin
  if not exists (select 1 from pg_policies where tablename='comissoes_recebidas' and policyname='admin_insert_comissoes_recebidas') then
    create policy "admin_insert_comissoes_recebidas" on public.comissoes_recebidas
      for insert with check (public.current_user_role() = 'admin');
  end if;
  if not exists (select 1 from pg_policies where tablename='comissoes_recebidas' and policyname='admin_update_comissoes_recebidas') then
    create policy "admin_update_comissoes_recebidas" on public.comissoes_recebidas
      for update using (public.current_user_role() = 'admin');
  end if;
  if not exists (select 1 from pg_policies where tablename='comissoes_recebidas' and policyname='admin_delete_comissoes_recebidas') then
    create policy "admin_delete_comissoes_recebidas" on public.comissoes_recebidas
      for delete using (public.current_user_role() = 'admin');
  end if;
end$$;

drop trigger if exists comissoes_recebidas_updated_at on public.comissoes_recebidas;
create trigger comissoes_recebidas_updated_at
  before update on public.comissoes_recebidas
  for each row execute procedure update_updated_at();
