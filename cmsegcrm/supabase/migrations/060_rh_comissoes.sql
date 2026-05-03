-- ─────────────────────────────────────────────────────────────
-- 060_rh_comissoes.sql
-- Aba "Comissões" no módulo RH — funciona como "contas a pagar":
-- equipe RH lança a comissão para um vendedor, anexa extrato (Excel)
-- e o vendedor aprova / reprova / levanta dúvida.
-- ─────────────────────────────────────────────────────────────

-- Helper: é membro da equipe "RH" (ou admin)
create or replace function public.is_rh_team()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select true
       from public.equipe_membros em
       join public.equipes e on e.id = em.equipe_id
      where em.user_id = auth.uid()
        and public.pt_norm(e.nome) = public.pt_norm('RH')
      limit 1),
    false
  ) or exists (
    select 1 from public.users u
     where u.id = auth.uid() and u.role = 'admin'
  );
$$;

-- Tabela
create table if not exists public.rh_comissoes (
  id            uuid primary key default uuid_generate_v4(),
  vendedor_id   uuid not null references public.users(id) on delete cascade,
  valor         numeric(12,2) not null check (valor >= 0),
  competencia   text,
  descricao     text,
  anexo_path    text,
  anexo_nome    text,
  status        text not null default 'pendente'
                check (status in ('pendente','aprovada','reprovada','duvida')),
  duvida_texto  text,
  resposta_rh   text,
  created_by    uuid references public.users(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  decidido_em   timestamptz
);

create index if not exists idx_rh_com_vend   on public.rh_comissoes(vendedor_id);
create index if not exists idx_rh_com_status on public.rh_comissoes(status);

alter table public.rh_comissoes enable row level security;

drop policy if exists rh_com_select on public.rh_comissoes;
drop policy if exists rh_com_insert on public.rh_comissoes;
drop policy if exists rh_com_update on public.rh_comissoes;
drop policy if exists rh_com_delete on public.rh_comissoes;

create policy rh_com_select on public.rh_comissoes
  for select using (public.is_rh_team() or vendedor_id = auth.uid());

create policy rh_com_insert on public.rh_comissoes
  for insert with check (public.is_rh_team());

create policy rh_com_update on public.rh_comissoes
  for update using (public.is_rh_team() or vendedor_id = auth.uid())
              with check (public.is_rh_team() or vendedor_id = auth.uid());

create policy rh_com_delete on public.rh_comissoes
  for delete using (public.is_rh_team());

drop trigger if exists rh_comissoes_updated_at on public.rh_comissoes;
create trigger rh_comissoes_updated_at
  before update on public.rh_comissoes
  for each row execute procedure update_updated_at();
