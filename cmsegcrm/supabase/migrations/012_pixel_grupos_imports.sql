-- ─────────────────────────────────────────────────────────────
-- 012_pixel_grupos_imports.sql
-- A) Meta Pixel ID em meta_config (frontend events)
-- B) Grupos no módulo Mensagens (mensagens_grupos + membros)
-- C) Tracking de importações genéricas (importacoes_dados)
-- ─────────────────────────────────────────────────────────────

-- ─── A) Meta Pixel ID + Conversions API token ───────────────────
alter table public.meta_config
  add column if not exists pixel_id           text,
  add column if not exists conversions_token  text;

-- ─── B) Grupos de mensagens ─────────────────────────────────────
create table if not exists public.mensagens_grupos (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  descricao   text,
  criado_por  uuid references public.users(id),
  criado_em   timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists public.mensagens_grupo_membros (
  grupo_id  uuid not null references public.mensagens_grupos(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  papel     text not null default 'membro' check (papel in ('admin','membro')),
  entrou_em timestamptz default now(),
  primary key (grupo_id, user_id)
);

-- Adiciona grupo_id em mensagens_internas (NULL = mensagem direta 1-a-1).
-- Quando preenchido: para_user_id é NULL e a mensagem vai pro grupo.
alter table public.mensagens_internas
  add column if not exists grupo_id uuid references public.mensagens_grupos(id) on delete cascade;

-- Como grupo_id pode existir, para_user_id precisa ser nullable
do $$ begin
  alter table public.mensagens_internas alter column para_user_id drop not null;
exception when others then null; end$$;

-- Índice pra performance
create index if not exists idx_msg_grupo on public.mensagens_internas(grupo_id, criado_em desc);

-- RLS dos grupos: usuário só vê grupos onde é membro
alter table public.mensagens_grupos        enable row level security;
alter table public.mensagens_grupo_membros enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='mensagens_grupos' and policyname='membro_le_grupo') then
    create policy "membro_le_grupo" on public.mensagens_grupos
      for select using (
        exists (
          select 1 from public.mensagens_grupo_membros
          where grupo_id = mensagens_grupos.id and user_id = auth.uid()
        )
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='mensagens_grupos' and policyname='auth_cria_grupo') then
    create policy "auth_cria_grupo" on public.mensagens_grupos
      for insert with check (auth.role() = 'authenticated' and criado_por = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='mensagens_grupos' and policyname='admin_grupo_atualiza') then
    create policy "admin_grupo_atualiza" on public.mensagens_grupos
      for update using (
        exists (select 1 from public.mensagens_grupo_membros
                where grupo_id = mensagens_grupos.id and user_id = auth.uid() and papel = 'admin')
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='mensagens_grupos' and policyname='admin_grupo_apaga') then
    create policy "admin_grupo_apaga" on public.mensagens_grupos
      for delete using (
        exists (select 1 from public.mensagens_grupo_membros
                where grupo_id = mensagens_grupos.id and user_id = auth.uid() and papel = 'admin')
      );
  end if;
end$$;

-- RLS membros: leitura pra qualquer membro do grupo; escrita só admin do grupo
do $$ begin
  if not exists (select 1 from pg_policies where tablename='mensagens_grupo_membros' and policyname='membro_le_membros') then
    create policy "membro_le_membros" on public.mensagens_grupo_membros
      for select using (
        exists (
          select 1 from public.mensagens_grupo_membros m2
          where m2.grupo_id = mensagens_grupo_membros.grupo_id and m2.user_id = auth.uid()
        )
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='mensagens_grupo_membros' and policyname='criador_adiciona_membros') then
    -- No insert inicial (criação do grupo) o criador adiciona ele mesmo
    -- como admin. Permite quando o user_id sendo inserido é o próprio
    -- auth.uid() OU quando o auth.uid() é admin de algum outro membro
    -- já existente do grupo.
    create policy "criador_adiciona_membros" on public.mensagens_grupo_membros
      for insert with check (
        user_id = auth.uid()
        or exists (
          select 1 from public.mensagens_grupo_membros m2
          where m2.grupo_id = mensagens_grupo_membros.grupo_id
            and m2.user_id = auth.uid()
            and m2.papel = 'admin'
        )
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='mensagens_grupo_membros' and policyname='admin_remove_membros') then
    create policy "admin_remove_membros" on public.mensagens_grupo_membros
      for delete using (
        user_id = auth.uid()
        or exists (
          select 1 from public.mensagens_grupo_membros m2
          where m2.grupo_id = mensagens_grupo_membros.grupo_id
            and m2.user_id = auth.uid()
            and m2.papel = 'admin'
        )
      );
  end if;
end$$;

-- Atualiza policy de mensagens_internas pra suportar grupos:
-- Membros do grupo podem ler todas as mensagens do grupo,
-- e qualquer membro pode escrever.
do $$ begin
  drop policy if exists "participantes leem mensagens" on public.mensagens_internas;
  drop policy if exists "remetente envia mensagens"   on public.mensagens_internas;
end$$;

create policy "le_mensagens_diretas_ou_grupo" on public.mensagens_internas for select using (
  -- Mensagem direta: usuário é remetente ou destinatário
  (grupo_id is null and auth.uid() in (de_user_id, para_user_id))
  or
  -- Mensagem em grupo: usuário é membro
  (grupo_id is not null and exists (
    select 1 from public.mensagens_grupo_membros
    where grupo_id = mensagens_internas.grupo_id and user_id = auth.uid()
  ))
);

create policy "envia_mensagem_direta_ou_grupo" on public.mensagens_internas for insert with check (
  auth.uid() = de_user_id and (
    -- Direta: precisa ter para_user_id
    (grupo_id is null and para_user_id is not null)
    or
    -- Grupo: usuário é membro do grupo
    (grupo_id is not null and exists (
      select 1 from public.mensagens_grupo_membros
      where grupo_id = mensagens_internas.grupo_id and user_id = auth.uid()
    ))
  )
);

-- ─── C) Importações de dados (CSV/XLSX genéricos) ───────────────
-- Tabela de auditoria pra rastrear quem importou o quê e quando.
-- O processamento real é feito server-side em /api/importar/<entidade>.
create table if not exists public.importacoes_dados (
  id              uuid primary key default uuid_generate_v4(),
  entidade        text not null check (entidade in
                    ('clientes','negocios','apolices','propostas','comissoes','tarefas')),
  nome_arquivo    text,
  formato         text check (formato in ('csv','xlsx','pdf')),
  qtd_lidos       int default 0,
  qtd_criados     int default 0,
  qtd_atualizados int default 0,
  qtd_erros       int default 0,
  erros           text[],
  status          text default 'processado' check (status in ('processado','erro','parcial')),
  user_id         uuid references public.users(id),
  iniciado_em     timestamptz default now(),
  concluido_em    timestamptz
);

create index if not exists idx_importacoes_dados_user on public.importacoes_dados(user_id, iniciado_em desc);
alter table public.importacoes_dados enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='importacoes_dados' and policyname='admin_le_importacoes_dados') then
    create policy "admin_le_importacoes_dados" on public.importacoes_dados
      for select using (
        user_id = auth.uid()
        or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='importacoes_dados' and policyname='admin_escreve_importacoes_dados') then
    create policy "admin_escreve_importacoes_dados" on public.importacoes_dados
      for all using (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;
end$$;
