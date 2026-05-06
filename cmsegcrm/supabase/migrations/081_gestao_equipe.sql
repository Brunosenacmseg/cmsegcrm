-- ═══════════════════════════════════════════════════════════════════════
-- Migration 081: Módulo Gestão de Equipe (avaliações diárias dos líderes)
--
-- Objetivo: criar uma rotina diária para que cada líder de equipe (ou um
-- administrador) faça uma avaliação rápida, padronizada e versionada de
-- cada um dos seus colaboradores. As avaliações alimentam o módulo
-- "Gestão de Equipe" e são distintas das avaliações trimestrais do RH
-- (rh_avaliacoes), que continuam sendo um registro mais profundo.
--
-- Estrutura:
--   • gestao_equipe_perguntas    → catálogo de critérios (admin edita)
--   • gestao_equipe_avaliacoes   → 1 linha por (líder, colaborador, dia)
--   • gestao_equipe_respostas    → 1 linha por critério respondido
--
-- Permissões (RLS):
--   • Admin: acesso total
--   • Líder (users.role = 'lider' OU equipes.lider_id = uid): pode
--     avaliar qualquer colaborador (admin) ou apenas membros das suas
--     equipes (líder), e ler/editar as próprias avaliações.
--   • Colaborador: pode ler as avaliações em que figura como avaliado
--     (transparência: o RH/CLT moderno costuma exigir feedback contínuo).
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Helpers ───────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid() and u.role = 'admin'
  );
$$;

-- True se o usuário logado é "líder" no sentido organizacional:
-- role explícito 'lider' OU é lider_id de qualquer equipe ativa.
create or replace function public.is_lider()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid() and u.role in ('admin','lider')
  ) or exists (
    select 1 from public.equipes e where e.lider_id = auth.uid()
  );
$$;

-- True se o usuário logado é admin OU lider de alguma equipe que tem
-- `target` como membro. Usado para escopar avaliações por equipe.
create or replace function public.is_lider_de(target uuid)
returns boolean language sql stable as $$
  select public.is_admin() or exists (
    select 1
      from public.equipes e
      join public.equipe_membros em on em.equipe_id = e.id
     where e.lider_id = auth.uid()
       and em.user_id = target
  );
$$;

-- ─── Catálogo de perguntas ─────────────────────────────────────────────
create table if not exists public.gestao_equipe_perguntas (
  id          uuid primary key default uuid_generate_v4(),
  ordem       int  not null default 0,
  chave       text not null unique,
  pergunta    text not null,
  descricao   text,
  tipo        text not null default 'escala'
              check (tipo in ('escala','sim_nao','texto')),
  min_escala  int  not null default 1,
  max_escala  int  not null default 5,
  ativa       boolean not null default true,
  criada_em   timestamptz default now()
);

-- ─── Avaliação (cabeçalho diário) ──────────────────────────────────────
create table if not exists public.gestao_equipe_avaliacoes (
  id              uuid primary key default uuid_generate_v4(),
  data            date not null default current_date,
  colaborador_id  uuid not null references public.users(id) on delete cascade,
  lider_id        uuid not null references public.users(id) on delete cascade,
  equipe_id       uuid references public.equipes(id) on delete set null,
  nota_geral      numeric(3,1),
  humor           text,
  destaque        text,
  dificuldade     text,
  acao_proxima    text,
  comentario      text,
  criado_em       timestamptz default now(),
  atualizado_em   timestamptz default now(),
  unique (data, colaborador_id, lider_id)
);

create index if not exists ix_gestao_aval_data            on public.gestao_equipe_avaliacoes(data);
create index if not exists ix_gestao_aval_colaborador     on public.gestao_equipe_avaliacoes(colaborador_id);
create index if not exists ix_gestao_aval_lider          on public.gestao_equipe_avaliacoes(lider_id);

-- Trigger para manter atualizado_em em sincronia
create or replace function public.tg_gestao_aval_set_updated()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists tg_gestao_aval_updated on public.gestao_equipe_avaliacoes;
create trigger tg_gestao_aval_updated
  before update on public.gestao_equipe_avaliacoes
  for each row execute function public.tg_gestao_aval_set_updated();

-- ─── Respostas por pergunta ────────────────────────────────────────────
create table if not exists public.gestao_equipe_respostas (
  id             uuid primary key default uuid_generate_v4(),
  avaliacao_id   uuid not null references public.gestao_equipe_avaliacoes(id) on delete cascade,
  pergunta_id    uuid not null references public.gestao_equipe_perguntas(id) on delete cascade,
  nota           int,
  resposta_texto text,
  unique (avaliacao_id, pergunta_id)
);

create index if not exists ix_gestao_resp_aval     on public.gestao_equipe_respostas(avaliacao_id);
create index if not exists ix_gestao_resp_pergunta on public.gestao_equipe_respostas(pergunta_id);

-- ─── RLS ───────────────────────────────────────────────────────────────
alter table public.gestao_equipe_perguntas  enable row level security;
alter table public.gestao_equipe_avaliacoes enable row level security;
alter table public.gestao_equipe_respostas  enable row level security;

-- Perguntas: leitura para qualquer autenticado, escrita só admin
drop policy if exists ge_perg_select on public.gestao_equipe_perguntas;
drop policy if exists ge_perg_write  on public.gestao_equipe_perguntas;
create policy ge_perg_select on public.gestao_equipe_perguntas for select
  using (auth.role() = 'authenticated');
create policy ge_perg_write on public.gestao_equipe_perguntas for all
  using (public.is_admin()) with check (public.is_admin());

-- Avaliações:
--   • leitura: admin / líder responsável / líder do colaborador / o próprio colaborador
--   • inserção: o líder logado, e somente para colaboradores da sua equipe (admin = qualquer)
--   • update : autor da avaliação ou admin
--   • delete : admin
drop policy if exists ge_aval_select on public.gestao_equipe_avaliacoes;
drop policy if exists ge_aval_insert on public.gestao_equipe_avaliacoes;
drop policy if exists ge_aval_update on public.gestao_equipe_avaliacoes;
drop policy if exists ge_aval_delete on public.gestao_equipe_avaliacoes;

create policy ge_aval_select on public.gestao_equipe_avaliacoes for select
  using (
    public.is_admin()
    or lider_id       = auth.uid()
    or colaborador_id = auth.uid()
    or public.is_lider_de(colaborador_id)
  );

create policy ge_aval_insert on public.gestao_equipe_avaliacoes for insert
  with check (
    lider_id = auth.uid()
    and (public.is_admin() or public.is_lider_de(colaborador_id))
  );

create policy ge_aval_update on public.gestao_equipe_avaliacoes for update
  using (public.is_admin() or lider_id = auth.uid())
  with check (public.is_admin() or lider_id = auth.uid());

create policy ge_aval_delete on public.gestao_equipe_avaliacoes for delete
  using (public.is_admin());

-- Respostas: derivam do header (mesmas regras)
drop policy if exists ge_resp_select on public.gestao_equipe_respostas;
drop policy if exists ge_resp_write  on public.gestao_equipe_respostas;

create policy ge_resp_select on public.gestao_equipe_respostas for select
  using (
    exists (
      select 1 from public.gestao_equipe_avaliacoes a
       where a.id = avaliacao_id
         and (
           public.is_admin()
           or a.lider_id       = auth.uid()
           or a.colaborador_id = auth.uid()
           or public.is_lider_de(a.colaborador_id)
         )
    )
  );

create policy ge_resp_write on public.gestao_equipe_respostas for all
  using (
    exists (
      select 1 from public.gestao_equipe_avaliacoes a
       where a.id = avaliacao_id
         and (public.is_admin() or a.lider_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.gestao_equipe_avaliacoes a
       where a.id = avaliacao_id
         and (public.is_admin() or a.lider_id = auth.uid())
    )
  );

-- ─── Seed: modelo de avaliação diária ──────────────────────────────────
insert into public.gestao_equipe_perguntas (ordem, chave, pergunta, descricao, tipo, min_escala, max_escala) values
  (10, 'pontualidade',
       'Pontualidade e presença',
       'O colaborador chegou no horário, cumpriu a jornada e esteve disponível?',
       'escala', 1, 5),
  (20, 'produtividade',
       'Produtividade do dia',
       'Entregou o que estava planejado para hoje (tarefas, ligações, propostas)?',
       'escala', 1, 5),
  (30, 'qualidade',
       'Qualidade do trabalho',
       'Padrão atendido, sem retrabalho ou erros relevantes?',
       'escala', 1, 5),
  (40, 'comunicacao',
       'Comunicação e alinhamento',
       'Manteve a equipe e o líder informados? Respondeu mensagens em tempo hábil?',
       'escala', 1, 5),
  (50, 'atendimento',
       'Atendimento ao cliente',
       'Tom de voz, empatia, agilidade e cordialidade no contato com clientes.',
       'escala', 1, 5),
  (60, 'colaboracao',
       'Trabalho em equipe',
       'Colaborou, ajudou colegas e contribuiu para o bom clima?',
       'escala', 1, 5),
  (70, 'proatividade',
       'Proatividade e iniciativa',
       'Buscou soluções, antecipou problemas e foi além do solicitado?',
       'escala', 1, 5),
  (80, 'postura',
       'Postura e atitude',
       'Foco, disciplina, bom humor e abertura a feedback.',
       'escala', 1, 5),
  (90, 'crm_processos',
       'Cumprimento dos processos no CRM',
       'Atualizou funis, registrou ligações, fechou tarefas pendentes?',
       'sim_nao', 0, 1),
 (100, 'destaque_dia',
       'Destaque do dia',
       'Algo positivo que mereça reconhecimento (campo livre).',
       'texto', 0, 0)
on conflict (chave) do nothing;
