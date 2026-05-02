-- ═════════════════════════════════════════════════════════════════════
-- _RUN_RH.sql — setup completo do módulo RH numa única execução.
--
-- Junta as migrations 043 (tabelas RH + grupos), 044 (RLS revisada +
-- storage rh-documentos) e 045 (consolidação de grupos), na ordem.
-- Idempotente: pode rodar quantas vezes quiser.
--
-- Uso: cole tudo no Supabase SQL Editor → Run.
-- ═════════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- 043 — Tabelas RH
-- ─────────────────────────────────────────────────────────────

create table if not exists public.rh_cargos (
  id           uuid primary key default uuid_generate_v4(),
  nome         text not null,
  descricao    text,
  salario_base numeric(12,2),
  ativo        boolean default true,
  criado_em    timestamptz default now()
);
create unique index if not exists rh_cargos_nome_idx on public.rh_cargos (lower(nome));

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

create table if not exists public.rh_documentos (
  id             uuid primary key default uuid_generate_v4(),
  funcionario_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  tipo           text not null,
  arquivo_url    text not null,
  arquivo_nome   text,
  validade       date,
  enviado_por    uuid references public.users(id),
  enviado_em     timestamptz default now()
);
create index if not exists rh_doc_func_idx on public.rh_documentos (funcionario_id);

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

create table if not exists public.rh_avaliacoes (
  id             uuid primary key default uuid_generate_v4(),
  funcionario_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  avaliador_id   uuid references public.users(id) on delete set null,
  periodo        text not null,
  nota_geral     numeric(3,1) check (nota_geral between 0 and 10),
  pontos_fortes  text,
  pontos_melhoria text,
  metas          text,
  feedback       text,
  criado_em      timestamptz default now()
);
create index if not exists rh_aval_func_idx on public.rh_avaliacoes (funcionario_id, criado_em desc);

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

create table if not exists public.rh_beneficios (
  id             uuid primary key default uuid_generate_v4(),
  funcionario_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  tipo           text not null,
  valor          numeric(12,2),
  inicio         date,
  fim            date,
  obs            text
);
create index if not exists rh_benef_func_idx on public.rh_beneficios (funcionario_id);

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

alter table public.rh_cargos          enable row level security;
alter table public.rh_funcionarios    enable row level security;
alter table public.rh_documentos      enable row level security;
alter table public.rh_ferias          enable row level security;
alter table public.rh_banco_horas     enable row level security;
alter table public.rh_avaliacoes      enable row level security;
alter table public.rh_treinamentos    enable row level security;
alter table public.rh_beneficios      enable row level security;
alter table public.rh_desligamentos   enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 044 — RLS revisada (líder/usuário) + storage rh-documentos
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_admin_or_lider()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid() and u.role in ('admin','lider')
  );
$$;

create or replace function public.is_owner_funcionario(fid uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.rh_funcionarios f
     where f.id = fid and f.user_id = auth.uid()
  );
$$;

-- rh_funcionarios
drop policy if exists "auth_le_rh_funcionarios"      on public.rh_funcionarios;
drop policy if exists "admin_escreve_rh_funcionarios" on public.rh_funcionarios;
drop policy if exists "rh_func_select" on public.rh_funcionarios;
drop policy if exists "rh_func_write"  on public.rh_funcionarios;
create policy "rh_func_select" on public.rh_funcionarios for select
  using (public.is_admin_or_lider() or user_id = auth.uid());
create policy "rh_func_write"  on public.rh_funcionarios for all
  using (public.is_admin_or_lider());

-- Tabelas filhas
do $$
declare
  t text;
  filhas text[] := array[
    'rh_documentos','rh_ferias','rh_banco_horas','rh_avaliacoes',
    'rh_treinamentos','rh_beneficios'
  ];
begin
  foreach t in array filhas loop
    execute format('drop policy if exists "auth_le_%I" on public.%I', t, t);
    execute format('drop policy if exists "admin_escreve_%I" on public.%I', t, t);
    execute format('drop policy if exists "%1$I_select" on public.%1$I', t);
    execute format('drop policy if exists "%1$I_write"  on public.%1$I', t);
    execute format($f$
      create policy "%1$I_select" on public.%1$I for select
        using (public.is_admin_or_lider() or public.is_owner_funcionario(funcionario_id))
    $f$, t);
    execute format($f$
      create policy "%1$I_write" on public.%1$I for all
        using (public.is_admin_or_lider())
    $f$, t);
  end loop;
end $$;

-- rh_cargos
drop policy if exists "auth_le_rh_cargos"        on public.rh_cargos;
drop policy if exists "admin_escreve_rh_cargos"  on public.rh_cargos;
drop policy if exists "rh_cargos_select" on public.rh_cargos;
drop policy if exists "rh_cargos_write"  on public.rh_cargos;
create policy "rh_cargos_select" on public.rh_cargos for select using (auth.role() = 'authenticated');
create policy "rh_cargos_write"  on public.rh_cargos for all   using (public.is_admin_or_lider());

-- rh_desligamentos
drop policy if exists "auth_le_rh_desligamentos"        on public.rh_desligamentos;
drop policy if exists "admin_escreve_rh_desligamentos"  on public.rh_desligamentos;
drop policy if exists "rh_desl_select" on public.rh_desligamentos;
drop policy if exists "rh_desl_write"  on public.rh_desligamentos;
create policy "rh_desl_select" on public.rh_desligamentos for select using (public.is_admin_or_lider());
create policy "rh_desl_write"  on public.rh_desligamentos for all   using (public.is_admin_or_lider());

-- Storage bucket rh-documentos
insert into storage.buckets (id, name, public)
  values ('rh-documentos', 'rh-documentos', false)
  on conflict (id) do nothing;

drop policy if exists "rh_doc_storage_select" on storage.objects;
create policy "rh_doc_storage_select" on storage.objects for select
  using (
    bucket_id = 'rh-documentos'
    and (
      public.is_admin_or_lider()
      or exists (
        select 1 from public.rh_documentos d
         where d.arquivo_url = name
           and public.is_owner_funcionario(d.funcionario_id)
      )
    )
  );

drop policy if exists "rh_doc_storage_write" on storage.objects;
create policy "rh_doc_storage_write" on storage.objects for insert
  with check (bucket_id = 'rh-documentos' and public.is_admin_or_lider());

drop policy if exists "rh_doc_storage_delete" on storage.objects;
create policy "rh_doc_storage_delete" on storage.objects for delete
  using (bucket_id = 'rh-documentos' and public.is_admin_or_lider());

-- ─────────────────────────────────────────────────────────────
-- 045 — Limpa duplicatas de grupos criadas por engano na 043
-- (mensagens_grupos / mensagens_grupo_membros já existem desde a 012)
-- ─────────────────────────────────────────────────────────────

alter table public.mensagens_internas
  drop constraint if exists mensagens_destino_xor;
alter table public.mensagens_internas
  drop column if exists para_grupo_id;

drop table if exists public.grupo_membros    cascade;
drop table if exists public.grupos_mensagens cascade;

do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='mensagens_grupos') then
    drop policy if exists "auth_cria_grupo" on public.mensagens_grupos;
    drop policy if exists "lider_admin_cria_grupo" on public.mensagens_grupos;
    create policy "lider_admin_cria_grupo" on public.mensagens_grupos
      for insert with check (
        auth.uid() = criado_por
        and exists (
          select 1 from public.users u
           where u.id = auth.uid() and u.role in ('admin','lider')
        )
      );
  end if;
end $$;
