-- ─────────────────────────────────────────────────────────────
-- 014_fix_migrations.sql
-- Corrige erros encontrados ao aplicar 011/012/013 no Supabase.
--
-- Problemas resolvidos:
--   1) 011: FOR rel IN SELECT unnest(...) precisa DECLARE rel text;
--      → reescrito em policies inline (sem loops)
--   2) 012: dependia de meta_config (criada em 011) — agora tudo
--      definido com IF NOT EXISTS, ordem segura
--   3) 013: VIEW financeiro_faturamento_seguradora tinha GROUP BY
--      por alias que o Postgres rejeitou — agora agrupa por
--      expressões explícitas
--
-- IDEMPOTENTE: pode rodar em Supabase virgem OU em base que tinha
-- só partes das migrations anteriores aplicadas. CREATE IF NOT EXISTS
-- + DROP POLICY IF EXISTS antes do CREATE POLICY.
-- ─────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════
-- META ADS (do 011)
-- ═════════════════════════════════════════════════════════════

create table if not exists public.meta_config (
  id              int primary key default 1 check (id = 1),
  access_token    text,
  ad_account_id   text,
  page_id         text,
  app_id          text,
  app_secret      text,
  verify_token    text,
  webhook_subscribed boolean default false,
  expires_at      timestamptz,
  connected_by    uuid references public.users(id),
  configurado_em  timestamptz default now(),
  updated_at      timestamptz default now()
);

create table if not exists public.meta_campanhas (
  id            uuid primary key default uuid_generate_v4(),
  meta_id       text unique not null,
  nome          text not null,
  status        text,
  objetivo      text,
  daily_budget  numeric(12,2),
  inicio        date,
  fim           date,
  criada_em     timestamptz,
  atualizada_em timestamptz default now()
);

create table if not exists public.meta_adsets (
  id           uuid primary key default uuid_generate_v4(),
  meta_id      text unique not null,
  campanha_id  uuid references public.meta_campanhas(id) on delete cascade,
  nome         text not null,
  status       text,
  daily_budget numeric(12,2),
  atualizada_em timestamptz default now()
);

create table if not exists public.meta_ads (
  id        uuid primary key default uuid_generate_v4(),
  meta_id   text unique not null,
  adset_id  uuid references public.meta_adsets(id) on delete cascade,
  nome      text not null,
  status    text,
  formato   text,
  preview_url text,
  atualizado_em timestamptz default now()
);

create table if not exists public.meta_insights (
  id            uuid primary key default uuid_generate_v4(),
  entidade_tipo text not null check (entidade_tipo in ('campanha','adset','ad')),
  entidade_id   text not null,
  data          date  not null,
  impressoes    bigint default 0,
  alcance       bigint default 0,
  cliques       bigint default 0,
  gasto         numeric(12,2) default 0,
  leads         int default 0,
  ctr           numeric(8,4),
  cpc           numeric(8,2),
  cpm           numeric(8,2),
  atualizado_em timestamptz default now(),
  unique (entidade_tipo, entidade_id, data)
);

create index if not exists idx_meta_insights_entidade on public.meta_insights(entidade_tipo, entidade_id);
create index if not exists idx_meta_insights_data     on public.meta_insights(data);

create table if not exists public.meta_leads (
  id            uuid primary key default uuid_generate_v4(),
  meta_lead_id  text unique not null,
  form_id       text,
  ad_id         text,
  adset_id      text,
  campanha_id   text,
  page_id       text,
  campos        jsonb,
  cliente_id    uuid references public.clientes(id) on delete set null,
  negocio_id    uuid references public.negocios(id) on delete set null,
  recebido_em   timestamptz default now(),
  processado_em timestamptz
);

create index if not exists idx_meta_leads_ad      on public.meta_leads(ad_id);
create index if not exists idx_meta_leads_cliente on public.meta_leads(cliente_id);

alter table public.clientes
  add column if not exists meta_campaign_id text,
  add column if not exists meta_adset_id    text,
  add column if not exists meta_ad_id       text,
  add column if not exists meta_lead_id     text,
  add column if not exists meta_form_id     text;

alter table public.negocios
  add column if not exists meta_campaign_id text,
  add column if not exists meta_ad_id       text;

create index if not exists idx_clientes_meta_campaign on public.clientes(meta_campaign_id);
create index if not exists idx_negocios_meta_campaign on public.negocios(meta_campaign_id);

alter table public.meta_config     enable row level security;
alter table public.meta_campanhas  enable row level security;
alter table public.meta_adsets     enable row level security;
alter table public.meta_ads        enable row level security;
alter table public.meta_insights   enable row level security;
alter table public.meta_leads      enable row level security;

-- POLICIES — sem loop, uma por uma (mais legível e funciona em qualquer postgres)

drop policy if exists "auth_read_meta_campanhas" on public.meta_campanhas;
create policy "auth_read_meta_campanhas" on public.meta_campanhas for select using (auth.role() = 'authenticated');

drop policy if exists "auth_read_meta_adsets" on public.meta_adsets;
create policy "auth_read_meta_adsets" on public.meta_adsets for select using (auth.role() = 'authenticated');

drop policy if exists "auth_read_meta_ads" on public.meta_ads;
create policy "auth_read_meta_ads" on public.meta_ads for select using (auth.role() = 'authenticated');

drop policy if exists "auth_read_meta_insights" on public.meta_insights;
create policy "auth_read_meta_insights" on public.meta_insights for select using (auth.role() = 'authenticated');

drop policy if exists "auth_read_meta_leads" on public.meta_leads;
create policy "auth_read_meta_leads" on public.meta_leads for select using (auth.role() = 'authenticated');

drop policy if exists "admin_read_meta_config" on public.meta_config;
create policy "admin_read_meta_config" on public.meta_config for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "admin_write_meta_config" on public.meta_config;
create policy "admin_write_meta_config" on public.meta_config for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "admin_write_meta_campanhas" on public.meta_campanhas;
create policy "admin_write_meta_campanhas" on public.meta_campanhas for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "admin_write_meta_adsets" on public.meta_adsets;
create policy "admin_write_meta_adsets" on public.meta_adsets for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "admin_write_meta_ads" on public.meta_ads;
create policy "admin_write_meta_ads" on public.meta_ads for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "admin_write_meta_insights" on public.meta_insights;
create policy "admin_write_meta_insights" on public.meta_insights for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "admin_write_meta_leads" on public.meta_leads;
create policy "admin_write_meta_leads" on public.meta_leads for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

create or replace view public.meta_vendas_por_campanha as
select
  n.meta_campaign_id        as campanha_meta_id,
  c.nome                    as campanha_nome,
  count(*) filter (where n.status = 'ganho')        as vendas,
  count(*) filter (where n.status = 'perdido')      as perdas,
  count(*) filter (where n.status = 'em_andamento') as em_andamento,
  coalesce(sum(n.premio) filter (where n.status = 'ganho'), 0) as receita_total,
  coalesce(avg(n.premio) filter (where n.status = 'ganho'), 0) as ticket_medio
from public.negocios n
left join public.meta_campanhas c on c.meta_id = n.meta_campaign_id
where n.meta_campaign_id is not null
group by n.meta_campaign_id, c.nome;

-- ═════════════════════════════════════════════════════════════
-- 012 — Pixel + Grupos + Imports (já cria tudo; só refaz pra garantir)
-- ═════════════════════════════════════════════════════════════

alter table public.meta_config
  add column if not exists pixel_id           text,
  add column if not exists conversions_token  text;

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

alter table public.mensagens_internas
  add column if not exists grupo_id uuid references public.mensagens_grupos(id) on delete cascade;

do $$ begin
  alter table public.mensagens_internas alter column para_user_id drop not null;
exception when others then null; end$$;

create index if not exists idx_msg_grupo on public.mensagens_internas(grupo_id, criado_em desc);

alter table public.mensagens_grupos        enable row level security;
alter table public.mensagens_grupo_membros enable row level security;

drop policy if exists "membro_le_grupo" on public.mensagens_grupos;
create policy "membro_le_grupo" on public.mensagens_grupos for select using (
  exists (
    select 1 from public.mensagens_grupo_membros
    where grupo_id = mensagens_grupos.id and user_id = auth.uid()
  )
);

drop policy if exists "auth_cria_grupo" on public.mensagens_grupos;
create policy "auth_cria_grupo" on public.mensagens_grupos for insert with check (
  auth.role() = 'authenticated' and criado_por = auth.uid()
);

drop policy if exists "admin_grupo_atualiza" on public.mensagens_grupos;
create policy "admin_grupo_atualiza" on public.mensagens_grupos for update using (
  exists (select 1 from public.mensagens_grupo_membros
          where grupo_id = mensagens_grupos.id and user_id = auth.uid() and papel = 'admin')
);

drop policy if exists "admin_grupo_apaga" on public.mensagens_grupos;
create policy "admin_grupo_apaga" on public.mensagens_grupos for delete using (
  exists (select 1 from public.mensagens_grupo_membros
          where grupo_id = mensagens_grupos.id and user_id = auth.uid() and papel = 'admin')
);

drop policy if exists "membro_le_membros" on public.mensagens_grupo_membros;
create policy "membro_le_membros" on public.mensagens_grupo_membros for select using (
  exists (
    select 1 from public.mensagens_grupo_membros m2
    where m2.grupo_id = mensagens_grupo_membros.grupo_id and m2.user_id = auth.uid()
  )
);

drop policy if exists "criador_adiciona_membros" on public.mensagens_grupo_membros;
create policy "criador_adiciona_membros" on public.mensagens_grupo_membros for insert with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.mensagens_grupo_membros m2
    where m2.grupo_id = mensagens_grupo_membros.grupo_id
      and m2.user_id = auth.uid()
      and m2.papel = 'admin'
  )
);

drop policy if exists "admin_remove_membros" on public.mensagens_grupo_membros;
create policy "admin_remove_membros" on public.mensagens_grupo_membros for delete using (
  user_id = auth.uid()
  or exists (
    select 1 from public.mensagens_grupo_membros m2
    where m2.grupo_id = mensagens_grupo_membros.grupo_id
      and m2.user_id = auth.uid()
      and m2.papel = 'admin'
  )
);

drop policy if exists "participantes leem mensagens" on public.mensagens_internas;
drop policy if exists "remetente envia mensagens"   on public.mensagens_internas;
drop policy if exists "le_mensagens_diretas_ou_grupo" on public.mensagens_internas;
drop policy if exists "envia_mensagem_direta_ou_grupo" on public.mensagens_internas;

create policy "le_mensagens_diretas_ou_grupo" on public.mensagens_internas for select using (
  (grupo_id is null and auth.uid() in (de_user_id, para_user_id))
  or
  (grupo_id is not null and exists (
    select 1 from public.mensagens_grupo_membros
    where grupo_id = mensagens_internas.grupo_id and user_id = auth.uid()
  ))
);

create policy "envia_mensagem_direta_ou_grupo" on public.mensagens_internas for insert with check (
  auth.uid() = de_user_id and (
    (grupo_id is null and para_user_id is not null)
    or
    (grupo_id is not null and exists (
      select 1 from public.mensagens_grupo_membros
      where grupo_id = mensagens_internas.grupo_id and user_id = auth.uid()
    ))
  )
);

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

drop policy if exists "admin_le_importacoes_dados" on public.importacoes_dados;
create policy "admin_le_importacoes_dados" on public.importacoes_dados for select using (
  user_id = auth.uid()
  or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "admin_escreve_importacoes_dados" on public.importacoes_dados;
create policy "admin_escreve_importacoes_dados" on public.importacoes_dados for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- ═════════════════════════════════════════════════════════════
-- 013 FIX — view do faturamento por seguradora com GROUP BY correto
-- (O resto do 013 — tabelas, função, view DRE — já está OK; só essa view falhava)
-- ═════════════════════════════════════════════════════════════

drop view if exists public.financeiro_faturamento_seguradora;

create or replace view public.financeiro_faturamento_seguradora as
with base as (
  select
    coalesce(cr.seguradora_codigo, fs.codigo)   as codigo,
    coalesce(fs.nome, cr.seguradora, 'Outras')  as seguradora,
    coalesce(cr.competencia, to_char(cr.data_recebimento, 'YYYY-MM')) as competencia,
    cr.valor,
    coalesce(cr.ir_retido, 0)         as ir_retido,
    coalesce(cr.outros_descontos, 0)  as outros_descontos
  from public.comissoes_recebidas cr
  left join public.financeiro_seguradoras fs
    on fs.codigo = cr.seguradora_codigo
    or upper(fs.nome) = upper(cr.seguradora)
  where cr.status = 'recebido'
)
select
  codigo,
  seguradora,
  competencia,
  count(*)                                          as qtd_comissoes,
  coalesce(sum(valor), 0)                           as bruto,
  coalesce(sum(ir_retido), 0)                       as ir_retido,
  coalesce(sum(outros_descontos), 0)                as outros_descontos,
  coalesce(sum(valor - ir_retido - outros_descontos), 0) as liquido
from base
group by codigo, seguradora, competencia
order by competencia desc, codigo;
