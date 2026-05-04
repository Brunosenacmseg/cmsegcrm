-- Migration 069: comissoes_recebidas.valor pode ser negativo (estorno por
-- cancelamento). Antes tinha check (valor >= 0) que rejeitava qualquer
-- registro de devolucao de comissao.

-- Drop do check antigo (nome do constraint pode variar; tenta os comuns)
do $$
begin
  alter table public.comissoes_recebidas drop constraint if exists comissoes_recebidas_valor_check;
exception when undefined_object then null; end $$;

-- Tambem remove qualquer outro CHECK em valor que tenha o padrao ">= 0"
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.comissoes_recebidas'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%valor%>= 0%'
  loop
    execute format('alter table public.comissoes_recebidas drop constraint %I', c.conname);
  end loop;
end $$;
