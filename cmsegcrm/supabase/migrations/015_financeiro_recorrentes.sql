-- ─────────────────────────────────────────────────────────────
-- 015_financeiro_recorrentes.sql
-- A) Modelos de despesas recorrentes (cadastro reutilizável)
-- B) Despesa: tipo_despesa, condição, data_vencimento, data_pgto
-- C) Views split: DRE Projetado vs DRE Real
--
-- Permite ao admin cadastrar templates (ex: "Aluguel matriz, R$6.600,
-- FIXA, PIX, todo dia 10") e depois gerar lançamentos rapidamente
-- só selecionando o template.
--
-- Campo `data` continua existindo (compat) — equivale a data_pgto;
-- onde data_pgto for NULL a despesa é PROJETADA (ainda não paga).
-- ─────────────────────────────────────────────────────────────

create table if not exists public.financeiro_despesas_recorrentes (
  id              uuid primary key default uuid_generate_v4(),
  descricao       text not null,
  categoria_id    uuid references public.financeiro_categorias(id),
  tipo_despesa    text default 'FIXA' check (tipo_despesa in ('FIXA','VARIÁVEL')),
  forma_pagto     text,                          -- PIX, BOLETO, CARTÃO DE CRÉDITO, DÉBITO COMISSÃO
  condicao        text,                          -- '04/60', 'MENSAL', etc
  dia_vencimento  int check (dia_vencimento between 1 and 31),
  valor_padrao    numeric(12,2) not null default 0,
  fornecedor      text,
  obs             text,
  ativo           boolean default true,
  criado_por      uuid references public.users(id),
  criado_em       timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_fin_recorr_ativo on public.financeiro_despesas_recorrentes(ativo);

-- Adiciona campos em financeiro_despesas
alter table public.financeiro_despesas
  add column if not exists recorrente_id    uuid references public.financeiro_despesas_recorrentes(id) on delete set null,
  add column if not exists tipo_despesa     text check (tipo_despesa in ('FIXA','VARIÁVEL')),
  add column if not exists condicao         text,
  add column if not exists data_vencimento  date,
  add column if not exists data_pgto        date;

-- Backfill: data antiga = data_pgto. data_vencimento default = data.
update public.financeiro_despesas
   set data_pgto = coalesce(data_pgto, data),
       data_vencimento = coalesce(data_vencimento, data)
 where data_pgto is null or data_vencimento is null;

create index if not exists idx_fin_desp_data_vencimento on public.financeiro_despesas(data_vencimento);
create index if not exists idx_fin_desp_data_pgto       on public.financeiro_despesas(data_pgto);
create index if not exists idx_fin_desp_recorrente      on public.financeiro_despesas(recorrente_id);

-- RLS
alter table public.financeiro_despesas_recorrentes enable row level security;

drop policy if exists "financeiro_le_recorrentes" on public.financeiro_despesas_recorrentes;
create policy "financeiro_le_recorrentes" on public.financeiro_despesas_recorrentes
  for select using (public.tem_acesso_financeiro());
drop policy if exists "financeiro_escreve_recorrentes" on public.financeiro_despesas_recorrentes;
create policy "financeiro_escreve_recorrentes" on public.financeiro_despesas_recorrentes
  for all using (public.tem_acesso_financeiro());

drop trigger if exists fin_recorr_updated_at on public.financeiro_despesas_recorrentes;
create trigger fin_recorr_updated_at
  before update on public.financeiro_despesas_recorrentes
  for each row execute procedure update_updated_at();

-- ─── Views: Projeção vs Real ──────────────────────────────────

-- DRE Projetado: tudo que está previsto pra cair no mês (data_vencimento)
create or replace view public.financeiro_dre_projetado as
with receitas as (
  select coalesce(competencia, to_char(data_recebimento, 'YYYY-MM')) as competencia,
         sum(valor) as bruto,
         sum(coalesce(ir_retido,0)) as ir,
         sum(coalesce(outros_descontos,0)) as outros,
         sum(valor - coalesce(ir_retido,0) - coalesce(outros_descontos,0)) as liquido
  from public.comissoes_recebidas
  where status in ('previsto','recebido')
  group by 1
),
despesas as (
  select coalesce(competencia, to_char(coalesce(data_vencimento, data), 'YYYY-MM')) as competencia,
         sum(valor) as total,
         sum(case when tipo_despesa = 'FIXA'     then valor else 0 end) as fixa,
         sum(case when tipo_despesa = 'VARIÁVEL' then valor else 0 end) as variavel
  from public.financeiro_despesas
  group by 1
)
select
  coalesce(r.competencia, d.competencia) as competencia,
  coalesce(r.bruto, 0)    as receita_bruta,
  coalesce(r.ir, 0)       as ir_retido,
  coalesce(r.outros, 0)   as outros_descontos,
  coalesce(r.liquido, 0)  as receita_liquida,
  coalesce(d.total, 0)    as total_despesas,
  coalesce(d.fixa, 0)     as despesas_fixas,
  coalesce(d.variavel, 0) as despesas_variaveis,
  coalesce(r.liquido, 0) - coalesce(d.total, 0) as resultado
from receitas r
full outer join despesas d on d.competencia = r.competencia
order by competencia desc;

-- DRE Real: só o que efetivamente entrou (recebido) e saiu (data_pgto preenchida)
create or replace view public.financeiro_dre_real as
with receitas as (
  select coalesce(competencia, to_char(data_recebimento, 'YYYY-MM')) as competencia,
         sum(valor) as bruto,
         sum(coalesce(ir_retido,0)) as ir,
         sum(coalesce(outros_descontos,0)) as outros,
         sum(valor - coalesce(ir_retido,0) - coalesce(outros_descontos,0)) as liquido
  from public.comissoes_recebidas
  where status = 'recebido'
  group by 1
),
despesas as (
  select coalesce(competencia, to_char(coalesce(data_pgto, data), 'YYYY-MM')) as competencia,
         sum(valor) as total,
         sum(case when tipo_despesa = 'FIXA'     then valor else 0 end) as fixa,
         sum(case when tipo_despesa = 'VARIÁVEL' then valor else 0 end) as variavel
  from public.financeiro_despesas
  where data_pgto is not null
  group by 1
)
select
  coalesce(r.competencia, d.competencia) as competencia,
  coalesce(r.bruto, 0)    as receita_bruta,
  coalesce(r.ir, 0)       as ir_retido,
  coalesce(r.outros, 0)   as outros_descontos,
  coalesce(r.liquido, 0)  as receita_liquida,
  coalesce(d.total, 0)    as total_despesas,
  coalesce(d.fixa, 0)     as despesas_fixas,
  coalesce(d.variavel, 0) as despesas_variaveis,
  coalesce(r.liquido, 0) - coalesce(d.total, 0) as resultado
from receitas r
full outer join despesas d on d.competencia = r.competencia
order by competencia desc;
