-- ─────────────────────────────────────────────────────────────
-- 111_rh_avaliacoes_link_gestao.sql
-- Liga rh_avaliacoes (espelho) à avaliação original em
-- gestao_equipe_avaliacoes, para a UI conseguir abrir cada
-- tópico (perguntas/respostas) a partir do módulo RH.
-- ─────────────────────────────────────────────────────────────

alter table public.rh_avaliacoes
  add column if not exists gestao_avaliacao_id uuid references public.gestao_equipe_avaliacoes(id) on delete set null;

create index if not exists rh_avaliacoes_gestao_avaliacao_id_idx on public.rh_avaliacoes(gestao_avaliacao_id);

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
    pontos_fortes, pontos_melhoria, metas, feedback, criado_em, gestao_avaliacao_id
  ) values (
    v_func_id, NEW.lider_id, v_periodo, v_nota,
    NEW.destaque, NEW.dificuldade, NEW.acao_proxima, NEW.comentario, coalesce(NEW.criado_em, now()), NEW.id
  )
  on conflict (funcionario_id, periodo) do update set
    avaliador_id        = excluded.avaliador_id,
    nota_geral          = excluded.nota_geral,
    pontos_fortes       = excluded.pontos_fortes,
    pontos_melhoria     = excluded.pontos_melhoria,
    metas               = excluded.metas,
    feedback            = excluded.feedback,
    gestao_avaliacao_id = excluded.gestao_avaliacao_id;
  return NEW;
end $$;

update public.rh_avaliacoes r
set gestao_avaliacao_id = g.id
from public.gestao_equipe_avaliacoes g
join public.rh_funcionarios f on f.user_id = g.colaborador_id
where r.funcionario_id = f.id
  and r.gestao_avaliacao_id is null
  and r.periodo = 'Semana de ' || to_char(g.data, 'DD/MM/YYYY') || ' a ' || to_char(g.data + 6, 'DD/MM/YYYY');
