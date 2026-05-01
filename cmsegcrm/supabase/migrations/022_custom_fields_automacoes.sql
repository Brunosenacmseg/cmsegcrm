-- ─────────────────────────────────────────────────────────────
-- 022_custom_fields_automacoes.sql
-- A) Campos personalizados (definicao + valores em JSON na entidade)
-- B) Motor de Automacoes (triggers + condicoes + acoes)
-- C) Acao "criar_negocio_em_funil" implementa funil reverso
--    (perdido em VENDA -> novo card no funil RECICLADO etc)
-- ─────────────────────────────────────────────────────────────

-- ─── A) CAMPOS PERSONALIZADOS ───────────────────────────────
create table if not exists public.campos_personalizados (
  id          uuid primary key default uuid_generate_v4(),
  entidade    text not null check (entidade in ('negocio','cliente')),
  nome        text not null,                  -- "Modelo do veículo"
  chave       text not null,                  -- "modelo_veiculo" (slug)
  tipo        text not null default 'texto'
              check (tipo in ('texto','numero','data','select','boolean','textarea')),
  opcoes      text[],                          -- usado quando tipo = 'select'
  obrigatorio boolean default false,
  ordem       int default 0,
  ativo       boolean default true,
  criado_por  uuid references public.users(id),
  criado_em   timestamptz default now()
);
create unique index if not exists campos_pers_chave_idx on public.campos_personalizados(entidade, chave);

-- Valores ficam num JSONB direto na entidade (mais simples + flexivel
-- que tabela de valores normalizada — RD CRM faz igual).
alter table public.negocios add column if not exists custom_fields jsonb default '{}'::jsonb;
alter table public.clientes add column if not exists custom_fields jsonb default '{}'::jsonb;

create index if not exists idx_negocios_custom_fields on public.negocios using gin (custom_fields);

-- ─── B) AUTOMAÇÕES ──────────────────────────────────────────
create table if not exists public.automacoes (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  descricao   text,
  ativo       boolean default true,
  -- TRIGGER: o que faz a automacao rodar
  trigger     text not null check (trigger in (
    'negocio_criado',
    'etapa_alterada',
    'status_ganho',
    'status_perdido'
  )),
  -- CONDIÇÕES: filtros opcionais. Uma automacao só dispara se TODOS baterem.
  funil_id    uuid references public.funis(id) on delete cascade,   -- null = qualquer funil
  etapa_filtro text,                                                  -- null = qualquer etapa
  -- AÇÕES: lista de acoes a executar. Cada item:
  --   { tipo: 'criar_negocio_em_funil', funil_id, etapa, copiar:[...] }
  --   { tipo: 'mover_etapa', etapa }
  --   { tipo: 'criar_tarefa', titulo, responsavel_id?, prazo_dias? }
  --   { tipo: 'notificar', user_id, titulo, descricao? }
  --   { tipo: 'set_custom_field', chave, valor }
  acoes       jsonb not null default '[]'::jsonb,
  criado_por  uuid references public.users(id),
  criado_em   timestamptz default now(),
  atualizado_em timestamptz default now()
);
create index if not exists idx_automacoes_trigger on public.automacoes(trigger) where ativo;
create index if not exists idx_automacoes_funil on public.automacoes(funil_id);

-- Log de execução (admin pode debugar e ver o que disparou)
create table if not exists public.automacoes_logs (
  id          uuid primary key default uuid_generate_v4(),
  automacao_id uuid references public.automacoes(id) on delete set null,
  negocio_id  uuid references public.negocios(id) on delete set null,
  trigger     text not null,
  sucesso     boolean default true,
  erro        text,
  acoes_executadas jsonb,
  executado_em timestamptz default now()
);
create index if not exists idx_automacoes_logs_negocio on public.automacoes_logs(negocio_id, executado_em desc);

-- ─── RLS ────────────────────────────────────────────────────
alter table public.campos_personalizados enable row level security;
alter table public.automacoes            enable row level security;
alter table public.automacoes_logs       enable row level security;

drop policy if exists "auth_le_campos_pers" on public.campos_personalizados;
create policy "auth_le_campos_pers" on public.campos_personalizados for select using (auth.role() = 'authenticated');
drop policy if exists "admin_escreve_campos_pers" on public.campos_personalizados;
create policy "admin_escreve_campos_pers" on public.campos_personalizados for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "auth_le_automacoes" on public.automacoes;
create policy "auth_le_automacoes" on public.automacoes for select using (auth.role() = 'authenticated');
drop policy if exists "admin_escreve_automacoes" on public.automacoes;
create policy "admin_escreve_automacoes" on public.automacoes for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "admin_le_automacoes_logs" on public.automacoes_logs;
create policy "admin_le_automacoes_logs" on public.automacoes_logs for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "auth_escreve_automacoes_logs" on public.automacoes_logs;
create policy "auth_escreve_automacoes_logs" on public.automacoes_logs for insert with check (auth.role() = 'authenticated');
