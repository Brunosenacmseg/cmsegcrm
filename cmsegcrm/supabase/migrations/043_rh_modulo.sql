-- ─────────────────────────────────────────────────────────────
-- 043_rh_modulo.sql
-- Módulo RH: funcionários, documentos, férias, banco de horas,
-- avaliações, treinamentos, benefícios, cargos/salários,
-- desligamentos.
-- ─────────────────────────────────────────────────────────────

-- ─── Cargos ─────────────────────────────────────────────────
create table if not exists public.rh_cargos (
  id           uuid primary key default uuid_generate_v4(),
  nome         text not null,
  descricao    text,
  salario_base numeric(12,2),
  ativo        boolean default true,
  criado_em    timestamptz default now()
);
create unique index if not exists rh_cargos_nome_idx on public.rh_cargos (lower(nome));

-- ─── Funcionários ───────────────────────────────────────────
create table if not exists public.rh_funcionarios (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references public.users(id) on delete set null,
  nome            text not null,
  cpf             text,
  rg              text,
  email           text,
  telefone        text,
  data_nascimento date,
  data_admissao   date,
  data_demissao   date,
  cargo_id        uuid references public.rh_cargos(id) on delete set null,
  salario         numeric(12,2),
  status          text not null default 'ativo' check (status in ('ativo','ferias','afastado','desligado')),
  endereco        text,
  cidade          text,
  estado          text,
  cep             text,
  banco           text,
  agencia         text,
  conta           text,
  pix             text,
  contato_emerg_nome text,
  contato_emerg_fone text,
  foto_url        text,
  obs             text,
  criado_em       timestamptz default now(),
  atualizado_em   timestamptz default now()
);
create unique index if not exists rh_func_cpf_idx   on public.rh_funcionarios (cpf) where cpf is not null;
create index if not exists rh_func_status_idx       on public.rh_funcionarios (status);
create index if not exists rh_func_aniversario_idx  on public.rh_funcionarios (extract(month from data_nascimento), extract(day from data_nascimento));

-- ─── Documentos ─────────────────────────────────────────────
create table if not exists public.rh_documentos (
  id             uuid primary key default uuid_generate_v4(),
  funcionario_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  tipo           text not null,    -- RG, CPF, CTPS, contrato, comprovante_residencia, etc
  arquivo_url    text not null,
  arquivo_nome   text,
  validade       date,
  enviado_por    uuid references public.users(id),
  enviado_em     timestamptz default now()
);
create index if not exists rh_doc_func_idx on public.rh_documentos (funcionario_id);

-- ─── Férias ─────────────────────────────────────────────────
create table if not exists public.rh_ferias (
  id             uuid primary key default uuid_generate_v4(),
  funcionario_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  inicio         date not null,
  fim            date not null,
  dias           int generated always as ((fim - inicio) + 1) stored,
  status         text not null default 'solicitada' check (status in ('solicitada','aprovada','recusada','cancelada','gozada')),
  solicitado_em  timestamptz default now(),
  aprovado_por   uuid references public.users(id),
  aprovado_em    timestamptz,
  obs            text
);
create index if not exists rh_ferias_func_idx on public.rh_ferias (funcionario_id, inicio desc);

-- ─── Banco de horas ─────────────────────────────────────────
create table if not exists public.rh_banco_horas (
  id             uuid primary key default uuid_generate_v4(),
  funcionario_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  data           date not null,
  entrada        time,
  saida_almoco   time,
  retorno_almoco time,
  saida          time,
  horas_trab     numeric(5,2),
  horas_extras   numeric(5,2) default 0,
  horas_devidas  numeric(5,2) default 0,
  obs            text,
  criado_em      timestamptz default now()
);
create unique index if not exists rh_bh_func_data_idx on public.rh_banco_horas (funcionario_id, data);

-- ─── Avaliações de desempenho ───────────────────────────────
create table if not exists public.rh_avaliacoes (
  id             uuid primary key default uuid_generate_v4(),
  funcionario_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  avaliador_id   uuid references public.users(id) on delete set null,
  periodo        text not null,            -- ex: "2025-Q4"
  nota_geral     numeric(3,1) check (nota_geral between 0 and 10),
  pontos_fortes  text,
  pontos_melhoria text,
  metas          text,
  feedback       text,
  criado_em      timestamptz default now()
);
create index if not exists rh_aval_func_idx on public.rh_avaliacoes (funcionario_id, criado_em desc);

-- ─── Treinamentos ───────────────────────────────────────────
create table if not exists public.rh_treinamentos (
  id             uuid primary key default uuid_generate_v4(),
  funcionario_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  titulo         text not null,
  instituicao    text,
  carga_horaria  int,
  data_inicio    date,
  data_fim       date,
  status         text default 'em_andamento' check (status in ('previsto','em_andamento','concluido','cancelado')),
  certificado_url text,
  obs            text,
  criado_em      timestamptz default now()
);
create index if not exists rh_trein_func_idx on public.rh_treinamentos (funcionario_id, data_inicio desc);

-- ─── Benefícios ─────────────────────────────────────────────
create table if not exists public.rh_beneficios (
  id             uuid primary key default uuid_generate_v4(),
  funcionario_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  tipo           text not null,            -- VR, VT, plano de saúde, plano odonto, etc
  valor          numeric(12,2),
  inicio         date,
  fim            date,
  obs            text
);
create index if not exists rh_benef_func_idx on public.rh_beneficios (funcionario_id);

-- ─── Desligamentos ──────────────────────────────────────────
create table if not exists public.rh_desligamentos (
  id             uuid primary key default uuid_generate_v4(),
  funcionario_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  data           date not null,
  tipo           text not null check (tipo in ('demissao_sem_justa_causa','demissao_justa_causa','pedido_demissao','acordo','aposentadoria','fim_contrato')),
  motivo         text,
  acerto_valor   numeric(12,2),
  exame_demissional boolean default false,
  registrado_por uuid references public.users(id),
  registrado_em  timestamptz default now()
);
create index if not exists rh_desl_func_idx on public.rh_desligamentos (funcionario_id);

-- ─── RLS ────────────────────────────────────────────────────
alter table public.rh_cargos          enable row level security;
alter table public.rh_funcionarios    enable row level security;
alter table public.rh_documentos      enable row level security;
alter table public.rh_ferias          enable row level security;
alter table public.rh_banco_horas     enable row level security;
alter table public.rh_avaliacoes      enable row level security;
alter table public.rh_treinamentos    enable row level security;
alter table public.rh_beneficios      enable row level security;
alter table public.rh_desligamentos   enable row level security;

-- Leitura: autenticados leem (funcionário pode ver os próprios dados)
-- Escrita: admin (RH gerencia)
do $$ begin
  perform 1;
exception when others then null;
end $$;

-- Helper: cria policies padrão (admin total + auth read)
create or replace function public._rh_policies(tbl regclass)
returns void language plpgsql as $$
declare t text := tbl::text;
begin
  execute format('drop policy if exists "auth_le_%I" on %s', t, tbl);
  execute format('create policy "auth_le_%I" on %s for select using (auth.role() = ''authenticated'')', t, tbl);
  execute format('drop policy if exists "admin_escreve_%I" on %s', t, tbl);
  execute format('create policy "admin_escreve_%I" on %s for all using (exists(select 1 from public.users u where u.id = auth.uid() and u.role = ''admin''))', t, tbl);
end $$;

select public._rh_policies('public.rh_cargos');
select public._rh_policies('public.rh_funcionarios');
select public._rh_policies('public.rh_documentos');
select public._rh_policies('public.rh_ferias');
select public._rh_policies('public.rh_banco_horas');
select public._rh_policies('public.rh_avaliacoes');
select public._rh_policies('public.rh_treinamentos');
select public._rh_policies('public.rh_beneficios');
select public._rh_policies('public.rh_desligamentos');

-- ═══════════════════════════════════════════════════════════
-- GRUPOS DE MENSAGENS INTERNAS
-- Líderes podem criar grupos. O grupo aparece na lista de
-- conversas como se fosse um "usuário" (mas com membros).
-- ═══════════════════════════════════════════════════════════
create table if not exists public.grupos_mensagens (
  id            uuid primary key default uuid_generate_v4(),
  nome          text not null,
  descricao     text,
  emoji         text default '👥',
  criado_por    uuid not null references public.users(id) on delete cascade,
  criado_em     timestamptz default now()
);

create table if not exists public.grupo_membros (
  grupo_id   uuid not null references public.grupos_mensagens(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  papel      text default 'membro' check (papel in ('admin','membro')),
  entrou_em  timestamptz default now(),
  primary key (grupo_id, user_id)
);
create index if not exists grupo_membros_user_idx on public.grupo_membros (user_id);

-- Adiciona suporte a "destinatário grupo" em mensagens_internas
alter table public.mensagens_internas
  add column if not exists para_grupo_id uuid references public.grupos_mensagens(id) on delete cascade;
alter table public.mensagens_internas
  alter column para_user_id drop not null;
create index if not exists mensagens_grupo_idx on public.mensagens_internas (para_grupo_id, criado_em desc);

-- Constraint: ou para_user_id ou para_grupo_id (xor)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mensagens_destino_xor') then
    alter table public.mensagens_internas
      add constraint mensagens_destino_xor
      check ((para_user_id is not null)::int + (para_grupo_id is not null)::int = 1);
  end if;
end $$;

alter table public.grupos_mensagens enable row level security;
alter table public.grupo_membros    enable row level security;

-- Grupos: leitura para membros + criador. Criação só por líder/admin.
drop policy if exists "membros_leem_grupo" on public.grupos_mensagens;
create policy "membros_leem_grupo" on public.grupos_mensagens
  for select using (
    auth.uid() = criado_por
    or exists (select 1 from public.grupo_membros m where m.grupo_id = id and m.user_id = auth.uid())
  );

drop policy if exists "lider_cria_grupo" on public.grupos_mensagens;
create policy "lider_cria_grupo" on public.grupos_mensagens
  for insert with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','lider'))
    and auth.uid() = criado_por
  );

drop policy if exists "criador_atualiza_grupo" on public.grupos_mensagens;
create policy "criador_atualiza_grupo" on public.grupos_mensagens
  for update using (
    auth.uid() = criado_por
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

drop policy if exists "criador_deleta_grupo" on public.grupos_mensagens;
create policy "criador_deleta_grupo" on public.grupos_mensagens
  for delete using (
    auth.uid() = criado_por
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- Membros: leitura por membros do mesmo grupo; gerenciamento pelo criador/admin
drop policy if exists "membros_leem_membros" on public.grupo_membros;
create policy "membros_leem_membros" on public.grupo_membros
  for select using (
    exists (select 1 from public.grupo_membros m where m.grupo_id = grupo_id and m.user_id = auth.uid())
    or exists (select 1 from public.grupos_mensagens g where g.id = grupo_id and g.criado_por = auth.uid())
  );

drop policy if exists "criador_gerencia_membros" on public.grupo_membros;
create policy "criador_gerencia_membros" on public.grupo_membros
  for all using (
    exists (select 1 from public.grupos_mensagens g where g.id = grupo_id and g.criado_por = auth.uid())
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );
