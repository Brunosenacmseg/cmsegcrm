-- ─────────────────────────────────────────────────────────────
-- 106_historico_auto_log.sql
-- Triggers que registram automaticamente em `historico` toda
-- movimentação relevante feita num card de negócio:
--
--   • Criação do negócio
--   • Mudança de etapa, status, funil, vendedor, cliente, prêmio
--   • Tarefa criada / concluída / excluída
--   • Produto adicionado / removido / alterado
--
-- `user_id` é capturado de auth.uid() (usuário que disparou a query).
-- Idempotente.
-- ─────────────────────────────────────────────────────────────

create or replace function public.hist_log(
  p_negocio_id uuid,
  p_cliente_id uuid,
  p_titulo text,
  p_descricao text,
  p_tipo text default 'sistema'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.historico (negocio_id, cliente_id, tipo, titulo, descricao, user_id, created_at)
  values (p_negocio_id, p_cliente_id, p_tipo, p_titulo, p_descricao, auth.uid(), now());
exception when others then null;
end $$;

-- ── NEGOCIOS ──────────────────────────────────────────────────
create or replace function public.trg_neg_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  vNome text;
  fAntes text;
  fDepois text;
  cAntes text;
  cDepois text;
  uAntes text;
  uDepois text;
begin
  if tg_op = 'INSERT' then
    perform public.hist_log(NEW.id, NEW.cliente_id, '🆕 Negócio criado', coalesce(NEW.titulo,'(sem título)'), 'criado');
    return NEW;
  end if;
  if tg_op = 'UPDATE' then
    if NEW.etapa is distinct from OLD.etapa then
      perform public.hist_log(NEW.id, NEW.cliente_id, '🔄 Etapa alterada', coalesce(OLD.etapa,'—') || ' → ' || coalesce(NEW.etapa,'—'), 'etapa');
    end if;
    if NEW.status is distinct from OLD.status then
      perform public.hist_log(NEW.id, NEW.cliente_id, '⚑ Status alterado', coalesce(OLD.status,'—') || ' → ' || coalesce(NEW.status,'—'), 'status');
    end if;
    if NEW.funil_id is distinct from OLD.funil_id then
      select nome into fAntes from public.funis where id = OLD.funil_id;
      select nome into fDepois from public.funis where id = NEW.funil_id;
      perform public.hist_log(NEW.id, NEW.cliente_id, '📂 Funil alterado', coalesce(fAntes,'—') || ' → ' || coalesce(fDepois,'—'), 'funil');
    end if;
    if NEW.vendedor_id is distinct from OLD.vendedor_id then
      select nome into uAntes from public.users where id = OLD.vendedor_id;
      select nome into uDepois from public.users where id = NEW.vendedor_id;
      perform public.hist_log(NEW.id, NEW.cliente_id, '👤 Responsável alterado', coalesce(uAntes,'—') || ' → ' || coalesce(uDepois,'—'), 'responsavel');
    end if;
    if NEW.cliente_id is distinct from OLD.cliente_id then
      select nome into cAntes from public.clientes where id = OLD.cliente_id;
      select nome into cDepois from public.clientes where id = NEW.cliente_id;
      perform public.hist_log(NEW.id, NEW.cliente_id, '🧑 Cliente alterado', coalesce(cAntes,'—') || ' → ' || coalesce(cDepois,'—'), 'cliente');
    end if;
    if NEW.premio is distinct from OLD.premio then
      perform public.hist_log(NEW.id, NEW.cliente_id, '💰 Prêmio alterado', coalesce(OLD.premio::text,'—') || ' → ' || coalesce(NEW.premio::text,'—'), 'premio');
    end if;
    return NEW;
  end if;
  return null;
end $$;

drop trigger if exists trg_neg_log on public.negocios;
create trigger trg_neg_log
after insert or update on public.negocios
for each row execute function public.trg_neg_log();

-- ── TAREFAS ───────────────────────────────────────────────────
create or replace function public.trg_tarefa_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and NEW.negocio_id is not null then
    perform public.hist_log(NEW.negocio_id, NEW.cliente_id, '📋 Tarefa criada', coalesce(NEW.titulo,'(sem título)'), 'tarefa');
    return NEW;
  end if;
  if tg_op = 'UPDATE' and NEW.negocio_id is not null and NEW.status is distinct from OLD.status then
    perform public.hist_log(NEW.negocio_id, NEW.cliente_id,
      case when NEW.status = 'concluida' then '✅ Tarefa concluída'
           when NEW.status = 'cancelada' then '⏹ Tarefa cancelada'
           when NEW.status = 'em_andamento' then '▶ Tarefa iniciada'
           else '📋 Tarefa atualizada' end,
      coalesce(NEW.titulo,'(sem título)'), 'tarefa');
    return NEW;
  end if;
  if tg_op = 'DELETE' and OLD.negocio_id is not null then
    perform public.hist_log(OLD.negocio_id, OLD.cliente_id, '🗑 Tarefa excluída', coalesce(OLD.titulo,'(sem título)'), 'tarefa');
    return OLD;
  end if;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_tarefa_log on public.tarefas;
create trigger trg_tarefa_log
after insert or update or delete on public.tarefas
for each row execute function public.trg_tarefa_log();

-- ── NEGOCIO_PRODUTOS ──────────────────────────────────────────
create or replace function public.trg_negprod_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cliId uuid;
begin
  if tg_op = 'INSERT' then
    select cliente_id into cliId from public.negocios where id = NEW.negocio_id;
    perform public.hist_log(NEW.negocio_id, cliId, '➕ Produto adicionado',
      coalesce(NEW.nome_snapshot,'(produto)') || ' (' || NEW.quantidade || '× R$ ' || NEW.valor_unit || ')', 'produto');
    return NEW;
  end if;
  if tg_op = 'UPDATE' then
    select cliente_id into cliId from public.negocios where id = NEW.negocio_id;
    perform public.hist_log(NEW.negocio_id, cliId, '✎ Produto alterado',
      coalesce(NEW.nome_snapshot,'(produto)') || ' (' || NEW.quantidade || '× R$ ' || NEW.valor_unit || ')', 'produto');
    return NEW;
  end if;
  if tg_op = 'DELETE' then
    select cliente_id into cliId from public.negocios where id = OLD.negocio_id;
    perform public.hist_log(OLD.negocio_id, cliId, '➖ Produto removido', coalesce(OLD.nome_snapshot,'(produto)'), 'produto');
    return OLD;
  end if;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_negprod_log on public.negocio_produtos;
create trigger trg_negprod_log
after insert or update or delete on public.negocio_produtos
for each row execute function public.trg_negprod_log();
