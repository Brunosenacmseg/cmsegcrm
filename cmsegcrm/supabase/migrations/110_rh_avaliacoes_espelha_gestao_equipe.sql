-- ─────────────────────────────────────────────────────────────
-- 110_rh_avaliacoes_espelha_gestao_equipe.sql
-- Espelha avaliações de gestao_equipe_avaliacoes em rh_avaliacoes
-- (módulo RH passa a mostrar o que líderes preenchem em Gestão de Equipe).
--
-- - Auto-cria rh_funcionarios para o colaborador se ainda não existir
-- - UPSERT por (funcionario_id, periodo) — periodo = semana do dia da avaliação
-- - Idempotente
-- ─────────────────────────────────────────────────────────────

create unique index if not exists rh_avaliacoes_func_periodo_uk on public.rh_avaliacoes(funcionario_id, periodo);

create or replace function public.espelha_aval_gestao_em_rh() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_func_id uuid; v_periodo text; v_nota numeric; v_user record;
begin
  select id into v_func_id from public.rh_funcionarios where user_id = NEW.colaborador_id limit 1;
  if v_func_id is null then
    select nome, email into v_user from public.users where id = NEW.colaborador_id;
    if v_user.nome is null then return NEW; end if;
    insert into public.rh_funcionarios (user_id, nome, email, status)
    values (NEW.colaborador_id, v_user.nome, v_user.email, 'ativo')
    returning id into v_func_id;
  end if;

  v_periodo := 'Semana de ' || to_char(NEW.data, 'DD/MM/YYYY') || ' a ' || to_char(NEW.data + 6, 'DD/MM/YYYY');
  v_nota := greatest(0, least(10, coalesce(NEW.nota_geral, 0)));

  insert into public.rh_avaliacoes (
    funcionario_id, avaliador_id, periodo, nota_geral,
    pontos_fortes, pontos_melhoria, metas, feedback, criado_em
  ) values (
    v_func_id, NEW.lider_id, v_periodo, v_nota,
    NEW.destaque, NEW.dificuldade, NEW.acao_proxima, NEW.comentario, coalesce(NEW.criado_em, now())
  )
  on conflict (funcionario_id, periodo) do update set
    avaliador_id    = excluded.avaliador_id,
    nota_geral      = excluded.nota_geral,
    pontos_fortes   = excluded.pontos_fortes,
    pontos_melhoria = excluded.pontos_melhoria,
    metas           = excluded.metas,
    feedback        = excluded.feedback;
  return NEW;
end $$;

drop trigger if exists trg_espelha_aval_gestao_em_rh on public.gestao_equipe_avaliacoes;
create trigger trg_espelha_aval_gestao_em_rh
after insert or update on public.gestao_equipe_avaliacoes
for each row execute function public.espelha_aval_gestao_em_rh();
