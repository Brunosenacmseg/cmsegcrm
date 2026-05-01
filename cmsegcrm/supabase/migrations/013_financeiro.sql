-- ─────────────────────────────────────────────────────────────
-- 013_financeiro.sql
-- Módulo Financeiro / DRE
--
--   • financeiro_seguradoras  — códigos DRE 3.1.XX por seguradora
--   • financeiro_categorias   — classes de custo (3.X.YY)
--   • financeiro_despesas     — lançamentos de despesas
--   • financeiro_acessos      — usuários autorizados a ver o módulo
--
-- Comissões recebidas (tabela já existente comissoes_recebidas) são
-- usadas como faturamento; o IR e o líquido são calculados na view.
-- ─────────────────────────────────────────────────────────────

-- ─── Seguradoras com código DRE ──────────────────────────────
create table if not exists public.financeiro_seguradoras (
  id          uuid primary key default uuid_generate_v4(),
  codigo      text not null unique,            -- '3.1.20'
  nome        text not null,                   -- 'PORTO'
  ativo       boolean default true,
  ordem       int default 0,
  criado_em   timestamptz default now()
);

-- Pré-popular com a tabela de seguradoras do cliente
insert into public.financeiro_seguradoras (codigo, nome, ordem) values
  ('3.1.01','ALLIANZ',1),
  ('3.1.02','AMERICAN LIFE',2),
  ('3.1.03','AZOS',3),
  ('3.1.04','BRADESCO',4),
  ('3.1.06','CRED PORTO',5),
  ('3.1.07','JUSTOS',6),
  ('3.1.08','DARWIN',7),
  ('3.1.09','ESSOR',8),
  ('3.1.10','EXCELSIOR',9),
  ('3.1.11','EZZE',10),
  ('3.1.12','HDI',11),
  ('3.1.13','ICATU',12),
  ('3.1.14','KOVR',13),
  ('3.1.15','YELLUM',14),
  ('3.1.16','MAPFRE',15),
  ('3.1.17','MET LIFE',16),
  ('3.1.18','NOVO',17),
  ('3.1.19','PIER',18),
  ('3.1.20','PORTO',19),
  ('3.1.21','PORTO CAP (PORTO VIDA)',20),
  ('3.1.22','PORTO CONSÓRCIO',21),
  ('3.1.23','PORTO SAÚDE',22),
  ('3.1.24','RC SAÚDE',23),
  ('3.1.25','SUHAI',24),
  ('3.1.26','SULAMERICA',25),
  ('3.1.27','TOKIO',26),
  ('3.1.28','YOUSE',27),
  ('3.1.29','ZURICH',28),
  ('3.1.30','INTERCOR',29),
  ('3.1.31','PORTO VIDA',30),
  ('3.1.32','BP SEGURADORA',31),
  ('3.2.03','RENDIMENTO APLICAÇÃO ITAU',32)
on conflict (codigo) do nothing;

-- ─── Categorias de custo (DRE) ───────────────────────────────
-- O cliente pode criar livremente, ex:
--   '4.1.01' Folha de Pagamento, '4.2.01' Aluguel, '4.3.01' Marketing
create table if not exists public.financeiro_categorias (
  id          uuid primary key default uuid_generate_v4(),
  codigo      text not null unique,
  nome        text not null,
  tipo        text not null default 'despesa' check (tipo in ('despesa','receita','imposto')),
  cor         text,
  ordem       int default 0,
  ativo       boolean default true,
  criado_em   timestamptz default now()
);

-- Categorias iniciais sugeridas
insert into public.financeiro_categorias (codigo, nome, tipo, ordem) values
  ('4.1.01','Folha de Pagamento','despesa',1),
  ('4.1.02','Encargos / Impostos sobre folha','despesa',2),
  ('4.2.01','Aluguel','despesa',3),
  ('4.2.02','Energia/Água/Internet','despesa',4),
  ('4.3.01','Marketing / Anúncios','despesa',5),
  ('4.3.02','Software / SaaS','despesa',6),
  ('4.4.01','Impostos (PIS/COFINS/ISS)','imposto',7),
  ('4.4.02','IRPJ / CSLL','imposto',8),
  ('4.5.01','Material de escritório','despesa',9),
  ('4.5.02','Diversos','despesa',10)
on conflict (codigo) do nothing;

-- ─── Despesas (lançamentos) ──────────────────────────────────
create table if not exists public.financeiro_despesas (
  id            uuid primary key default uuid_generate_v4(),
  categoria_id  uuid references public.financeiro_categorias(id),
  descricao     text not null,
  valor         numeric(12,2) not null check (valor >= 0),
  data          date not null default current_date,
  competencia   text,                         -- '2026-04'
  forma_pagto   text,
  fornecedor    text,
  obs           text,
  registrado_por uuid references public.users(id),
  criado_em     timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_fin_desp_data        on public.financeiro_despesas(data);
create index if not exists idx_fin_desp_competencia on public.financeiro_despesas(competencia);
create index if not exists idx_fin_desp_categoria   on public.financeiro_despesas(categoria_id);

-- ─── Quem tem acesso ao módulo financeiro ────────────────────
-- Admin sempre tem acesso. Usuários adicionais via essa tabela.
create table if not exists public.financeiro_acessos (
  user_id     uuid primary key references public.users(id) on delete cascade,
  liberado_por uuid references public.users(id),
  liberado_em timestamptz default now()
);

-- ─── IR/Imposto retido sobre comissão ────────────────────────
-- Adiciona campos em comissoes_recebidas pra calcular líquido.
alter table public.comissoes_recebidas
  add column if not exists ir_retido      numeric(12,2) default 0,
  add column if not exists outros_descontos numeric(12,2) default 0;

-- Coluna `seguradora` em comissoes_recebidas pode receber apenas o NOME.
-- Pra DRE precisamos do código (3.1.20). Adicionamos seguradora_codigo.
alter table public.comissoes_recebidas
  add column if not exists seguradora_codigo text;

-- ─── RLS ─────────────────────────────────────────────────────
alter table public.financeiro_seguradoras enable row level security;
alter table public.financeiro_categorias  enable row level security;
alter table public.financeiro_despesas    enable row level security;
alter table public.financeiro_acessos     enable row level security;

-- Função helper: usuário tem acesso ao módulo financeiro?
create or replace function public.tem_acesso_financeiro()
returns boolean
language sql security definer set search_path = public
as $$
  select exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
  ) or exists (
    select 1 from public.financeiro_acessos a where a.user_id = auth.uid()
  );
$$;

do $$
begin
  -- Seguradoras: leitura livre (lista de referência); escrita só admin
  if not exists (select 1 from pg_policies where tablename='financeiro_seguradoras' and policyname='auth_le_seguradoras_dre') then
    create policy "auth_le_seguradoras_dre" on public.financeiro_seguradoras
      for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='financeiro_seguradoras' and policyname='admin_escreve_seguradoras_dre') then
    create policy "admin_escreve_seguradoras_dre" on public.financeiro_seguradoras
      for all using (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;

  -- Categorias: só quem tem acesso ao financeiro lê; só admin escreve
  if not exists (select 1 from pg_policies where tablename='financeiro_categorias' and policyname='financeiro_le_categorias') then
    create policy "financeiro_le_categorias" on public.financeiro_categorias
      for select using (public.tem_acesso_financeiro());
  end if;
  if not exists (select 1 from pg_policies where tablename='financeiro_categorias' and policyname='admin_escreve_categorias') then
    create policy "admin_escreve_categorias" on public.financeiro_categorias
      for all using (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;

  -- Despesas: leitura e escrita pra quem tem acesso ao financeiro
  if not exists (select 1 from pg_policies where tablename='financeiro_despesas' and policyname='financeiro_le_despesas') then
    create policy "financeiro_le_despesas" on public.financeiro_despesas
      for select using (public.tem_acesso_financeiro());
  end if;
  if not exists (select 1 from pg_policies where tablename='financeiro_despesas' and policyname='financeiro_escreve_despesas') then
    create policy "financeiro_escreve_despesas" on public.financeiro_despesas
      for all using (public.tem_acesso_financeiro());
  end if;

  -- Acessos: admin gerencia
  if not exists (select 1 from pg_policies where tablename='financeiro_acessos' and policyname='admin_gerencia_acessos_fin') then
    create policy "admin_gerencia_acessos_fin" on public.financeiro_acessos
      for all using (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='financeiro_acessos' and policyname='self_le_acesso_fin') then
    create policy "self_le_acesso_fin" on public.financeiro_acessos
      for select using (user_id = auth.uid());
  end if;
end$$;

-- ─── View: Faturamento por seguradora (mês corrente ou competência) ──
-- Usa comissoes_recebidas e agrupa por seguradora_codigo (ou nome se vazio).
create or replace view public.financeiro_faturamento_seguradora as
select
  coalesce(cr.seguradora_codigo, fs.codigo)   as codigo,
  coalesce(fs.nome, cr.seguradora, 'Outras')  as seguradora,
  coalesce(cr.competencia, to_char(cr.data_recebimento, 'YYYY-MM')) as competencia,
  count(*)                                     as qtd_comissoes,
  coalesce(sum(cr.valor), 0)                   as bruto,
  coalesce(sum(cr.ir_retido), 0)               as ir_retido,
  coalesce(sum(cr.outros_descontos), 0)        as outros_descontos,
  coalesce(sum(cr.valor - coalesce(cr.ir_retido,0) - coalesce(cr.outros_descontos,0)), 0) as liquido
from public.comissoes_recebidas cr
left join public.financeiro_seguradoras fs
  on fs.codigo = cr.seguradora_codigo
  or upper(fs.nome) = upper(cr.seguradora)
where cr.status = 'recebido'
group by codigo, seguradora, competencia
order by competencia desc, codigo;

-- ─── View: DRE mensal ────────────────────────────────────────
create or replace view public.financeiro_dre_mensal as
with receitas as (
  select coalesce(competencia, to_char(data_recebimento, 'YYYY-MM')) as competencia,
         sum(valor) as bruto,
         sum(coalesce(ir_retido,0)) as ir,
         sum(coalesce(outros_descontos,0)) as outros,
         sum(valor - coalesce(ir_retido,0) - coalesce(outros_descontos,0)) as liquido
  from public.comissoes_recebidas where status = 'recebido'
  group by competencia
),
despesas as (
  select coalesce(competencia, to_char(data, 'YYYY-MM')) as competencia,
         sum(valor) as total
  from public.financeiro_despesas
  group by competencia
)
select
  coalesce(r.competencia, d.competencia) as competencia,
  coalesce(r.bruto, 0)    as receita_bruta,
  coalesce(r.ir, 0)       as ir_retido,
  coalesce(r.outros, 0)   as outros_descontos,
  coalesce(r.liquido, 0)  as receita_liquida,
  coalesce(d.total, 0)    as total_despesas,
  coalesce(r.liquido, 0) - coalesce(d.total, 0) as resultado
from receitas r
full outer join despesas d on d.competencia = r.competencia
order by competencia desc;

drop trigger if exists fin_desp_updated_at on public.financeiro_despesas;
create trigger fin_desp_updated_at
  before update on public.financeiro_despesas
  for each row execute procedure update_updated_at();
