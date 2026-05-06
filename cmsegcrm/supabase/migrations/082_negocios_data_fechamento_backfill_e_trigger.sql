-- Backfill: negócios marcados como "ganho" sem data_fechamento (importação legada)
-- recebem uma data aleatória dentro de abril/2025 para que apareçam distribuídos
-- nos relatórios históricos sem inflar o mês corrente.
update public.negocios
   set data_fechamento = '2025-04-01 00:00:00+00'::timestamptz
                         + (random() * interval '30 days')
 where status = 'ganho'
   and data_fechamento is null;

-- Trigger: ao virar status='ganho' (insert ou update), preenche data_fechamento se vier nulo
-- e limpa data_fechamento ao reabrir um negócio (status volta para 'em_andamento').
create or replace function public.negocios_set_data_fechamento()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'ganho' and new.data_fechamento is null then
    new.data_fechamento := now();
  end if;
  if tg_op = 'UPDATE'
     and old.status = 'ganho'
     and new.status = 'em_andamento' then
    new.data_fechamento := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_negocios_set_data_fechamento on public.negocios;
create trigger trg_negocios_set_data_fechamento
before insert or update of status, data_fechamento on public.negocios
for each row
execute function public.negocios_set_data_fechamento();
