-- Adiciona campo de número da nota fiscal aos lançamentos de despesa
alter table public.financeiro_despesas
  add column if not exists numero_nf text;

create index if not exists idx_fin_desp_numero_nf
  on public.financeiro_despesas(numero_nf);
