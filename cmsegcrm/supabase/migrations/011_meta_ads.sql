-- ─────────────────────────────────────────────────────────────
-- 011_meta_ads.sql
-- Integração Meta Ads (Facebook/Instagram):
--   - Recebimento de leads via Webhook (Meta Lead Ads)
--   - Sincronização de campanhas/adsets/ads + insights (gasto,
--     impressões, clicks)
--   - Atribuição de vendas: lead Meta → cliente → negócio ganho → R$
-- ─────────────────────────────────────────────────────────────

-- ─── 1. CONFIG (token, ad_account, app_secret, etc) ──────────
-- Single-row table guardada como key-value pra simplificar.
create table if not exists public.meta_config (
  id              int primary key default 1 check (id = 1),
  access_token    text,
  ad_account_id   text,            -- formato 'act_123456789'
  page_id         text,            -- página do Facebook ligada aos lead forms
  app_id          text,
  app_secret      text,
  verify_token    text,            -- token usado na verificação do webhook
  webhook_subscribed boolean default false,
  expires_at      timestamptz,
  connected_by    uuid references public.users(id),
  configurado_em  timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ─── 2. CAMPANHAS / ADSETS / ADS (estrutura espelhada) ────────
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
  formato   text,                -- single_image, video, carousel, etc
  preview_url text,
  atualizado_em timestamptz default now()
);

-- ─── 3. INSIGHTS (métricas diárias por entidade) ─────────────
-- entidade_tipo: 'campanha' | 'adset' | 'ad'
-- entidade_id: meta_id da entidade
create table if not exists public.meta_insights (
  id            uuid primary key default uuid_generate_v4(),
  entidade_tipo text not null check (entidade_tipo in ('campanha','adset','ad')),
  entidade_id   text not null,        -- meta_id (não FK pra ser flexível)
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

-- ─── 4. LEADS (cada lead que chega via webhook) ──────────────
-- Quando um lead chega, criamos cliente correspondente (ou linkamos
-- com existente por email/telefone) e linkamos negocio.
create table if not exists public.meta_leads (
  id            uuid primary key default uuid_generate_v4(),
  meta_lead_id  text unique not null,
  form_id       text,
  ad_id         text,                  -- meta_id do anúncio
  adset_id      text,
  campanha_id   text,
  page_id       text,
  campos        jsonb,                 -- field_data bruto do Meta
  cliente_id    uuid references public.clientes(id) on delete set null,
  negocio_id    uuid references public.negocios(id) on delete set null,
  recebido_em   timestamptz default now(),
  processado_em timestamptz
);

create index if not exists idx_meta_leads_ad      on public.meta_leads(ad_id);
create index if not exists idx_meta_leads_cliente on public.meta_leads(cliente_id);

-- ─── 5. TRACKING em clientes/negocios ────────────────────────
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

-- ─── 6. RLS ──────────────────────────────────────────────────
alter table public.meta_config     enable row level security;
alter table public.meta_campanhas  enable row level security;
alter table public.meta_adsets     enable row level security;
alter table public.meta_ads        enable row level security;
alter table public.meta_insights   enable row level security;
alter table public.meta_leads      enable row level security;

do $$
begin
  -- Leitura: autenticados (analytics são compartilhados; admin/líder vão filtrar na UI)
  for rel in select unnest(array['meta_campanhas','meta_adsets','meta_ads','meta_insights','meta_leads']) loop
    if not exists (select 1 from pg_policies where tablename=rel and policyname='auth_read_'||rel) then
      execute format('create policy "auth_read_%s" on public.%I for select using (auth.role() = ''authenticated'')', rel, rel);
    end if;
  end loop;

  -- meta_config só admin lê
  if not exists (select 1 from pg_policies where tablename='meta_config' and policyname='admin_read_meta_config') then
    create policy "admin_read_meta_config" on public.meta_config
      for select using (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      );
  end if;

  -- Escrita: só admin (em todas as tabelas Meta)
  for rel in select unnest(array['meta_config','meta_campanhas','meta_adsets','meta_ads','meta_insights','meta_leads']) loop
    if not exists (select 1 from pg_policies where tablename=rel and policyname='admin_write_'||rel) then
      execute format('create policy "admin_write_%s" on public.%I for all using (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = ''admin'')
      )', rel, rel);
    end if;
  end loop;
end$$;

-- ─── 7. VIEW de atribuição (campanha → vendas) ────────────────
-- Soma o prêmio dos negócios ganhos cuja origem é Meta, agrupado por campanha
create or replace view public.meta_vendas_por_campanha as
select
  n.meta_campaign_id        as campanha_meta_id,
  c.nome                    as campanha_nome,
  count(*) filter (where n.status = 'ganho')   as vendas,
  count(*) filter (where n.status = 'perdido') as perdas,
  count(*) filter (where n.status = 'em_andamento') as em_andamento,
  coalesce(sum(n.premio) filter (where n.status = 'ganho'), 0) as receita_total,
  coalesce(avg(n.premio) filter (where n.status = 'ganho'), 0) as ticket_medio
from public.negocios n
left join public.meta_campanhas c on c.meta_id = n.meta_campaign_id
where n.meta_campaign_id is not null
group by n.meta_campaign_id, c.nome;
