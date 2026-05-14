-- ─────────────────────────────────────────────────────────────
-- 108_despesas_operacao.sql
-- Modulo "Despesas Operação" no Financeiro.
-- Acesso: admin OR EQUIPE GESTÃO.
--
-- Modelo:
--   despesas_operacao              — uma operação por (mês, equipe)
--   despesas_operacao_itens        — linhas de despesas (aluguel, café, etc)
--   despesas_operacao_vendedores   — vendedores adicionados, com salário,
--                                    encargos %, comissão %, faturamento
-- ─────────────────────────────────────────────────────────────

create table if not exists public.despesas_operacao (
  id uuid primary key default uuid_generate_v4(),
  mes date not null,                          -- primeiro dia do mês (ex: 2026-05-01)
  equipe_id uuid references public.equipes(id) on delete cascade,
  nome text not null,                          -- "Maio/2026 - EQUIPE VENDAS"
  margem_lucro_pct numeric(5,2) default 30,    -- % de margem alvo sobre custo total
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.users(id)
);
create unique index if not exists despesas_operacao_mes_equipe_uk on public.despesas_operacao(mes, equipe_id);

create table if not exists public.despesas_operacao_itens (
  id uuid primary key default uuid_generate_v4(),
  operacao_id uuid not null references public.despesas_operacao(id) on delete cascade,
  descricao text not null,
  categoria text,
  valor numeric(12,2) not null default 0,
  ordem int default 0,
  criado_em timestamptz not null default now()
);

create table if not exists public.despesas_operacao_vendedores (
  id uuid primary key default uuid_generate_v4(),
  operacao_id uuid not null references public.despesas_operacao(id) on delete cascade,
  user_id uuid references public.users(id),
  nome_snapshot text not null,                 -- copia do nome (caso user seja removido depois)
  salario_fixo numeric(12,2) default 0,
  encargos_pct numeric(5,2) default 70,        -- default 70% (FGTS, INSS, férias, 13º)
  comissao_pct numeric(5,2) default 0,         -- % aplicado sobre faturamento_mes
  faturamento_mes numeric(12,2) default 0,     -- digitado manualmente
  ordem int default 0,
  criado_em timestamptz not null default now()
);
create unique index if not exists despesas_operacao_vendedores_uk on public.despesas_operacao_vendedores(operacao_id, user_id);

alter table public.despesas_operacao enable row level security;
alter table public.despesas_operacao_itens enable row level security;
alter table public.despesas_operacao_vendedores enable row level security;

drop policy if exists "gestao gerencia despesas_operacao" on public.despesas_operacao;
create policy "gestao gerencia despesas_operacao" on public.despesas_operacao
  for all
  using ((select role from public.users where id = auth.uid()) = 'admin' or public.is_member_of_gestao())
  with check ((select role from public.users where id = auth.uid()) = 'admin' or public.is_member_of_gestao());

drop policy if exists "gestao gerencia despesas_operacao_itens" on public.despesas_operacao_itens;
create policy "gestao gerencia despesas_operacao_itens" on public.despesas_operacao_itens
  for all
  using ((select role from public.users where id = auth.uid()) = 'admin' or public.is_member_of_gestao())
  with check ((select role from public.users where id = auth.uid()) = 'admin' or public.is_member_of_gestao());

drop policy if exists "gestao gerencia despesas_operacao_vendedores" on public.despesas_operacao_vendedores;
create policy "gestao gerencia despesas_operacao_vendedores" on public.despesas_operacao_vendedores
  for all
  using ((select role from public.users where id = auth.uid()) = 'admin' or public.is_member_of_gestao())
  with check ((select role from public.users where id = auth.uid()) = 'admin' or public.is_member_of_gestao());

grant select, insert, update, delete on public.despesas_operacao to authenticated;
grant select, insert, update, delete on public.despesas_operacao_itens to authenticated;
grant select, insert, update, delete on public.despesas_operacao_vendedores to authenticated;
