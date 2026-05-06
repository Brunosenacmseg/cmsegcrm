-- ─────────────────────────────────────────────────────────────
-- 083_integrador.sql
-- Módulo "Integrador" — permite plugar qualquer ferramenta externa
-- ao CRM mesmo sem integração nativa.
--
-- Cobre:
--   1) Conexões nomeadas (configurações guardadas pelo usuário)
--   2) API Keys (autenticação para a API REST pública /api/integrador/v1/*)
--   3) Webhooks de entrada (URL única por conexão -> /api/integrador/in/[token])
--   4) Webhooks de saída (CRM dispara POST quando eventos acontecem)
--   5) Logs de eventos (auditoria de tudo que entra e sai)
--
-- Permissão: qualquer usuário autenticado pode criar suas próprias
-- integrações (RLS por owner_id). Admin enxerga todas.
-- ─────────────────────────────────────────────────────────────

-- ─── 1) CONEXÕES ──────────────────────────────────────────────
create table if not exists public.integracoes_conexoes (
  id            uuid primary key default uuid_generate_v4(),
  nome          text not null,
  descricao     text,
  ativo         boolean not null default true,
  -- "tag" livre para identificar a ferramenta externa
  -- (typeform, zapier, make, n8n, rdstation, planilha, custom, ...)
  ferramenta    text,
  owner_id      uuid not null references public.users(id) on delete cascade,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists integracoes_conexoes_owner_idx on public.integracoes_conexoes(owner_id);

-- ─── 2) API KEYS ──────────────────────────────────────────────
-- Cada conexão pode ter 1+ keys. O hash é guardado, NUNCA o token bruto.
create table if not exists public.integracoes_api_keys (
  id            uuid primary key default uuid_generate_v4(),
  conexao_id    uuid not null references public.integracoes_conexoes(id) on delete cascade,
  nome          text not null,                       -- "Produção", "Staging", ...
  prefixo       text not null,                       -- 8 primeiros chars (display)
  token_hash    text not null unique,                -- sha256(token completo)
  escopos       text[] not null default array['read','write']::text[],
  ativa         boolean not null default true,
  ultimo_uso    timestamptz,
  criada_em     timestamptz not null default now(),
  expira_em     timestamptz
);
create index if not exists integracoes_api_keys_conexao_idx on public.integracoes_api_keys(conexao_id);
create index if not exists integracoes_api_keys_hash_idx on public.integracoes_api_keys(token_hash);

-- ─── 3) WEBHOOKS DE ENTRADA ──────────────────────────────────
-- Cada webhook tem um token na URL: POST /api/integrador/in/[token]
-- entidade_alvo define o que o payload vai criar no CRM.
-- mapa_campos é um JSON {campo_destino: "caminho.no.payload"} (dot-notation)
create table if not exists public.integracoes_webhooks_in (
  id              uuid primary key default uuid_generate_v4(),
  conexao_id      uuid not null references public.integracoes_conexoes(id) on delete cascade,
  nome            text not null,
  token           text not null unique,                       -- usado na URL
  entidade_alvo   text not null check (entidade_alvo in ('negocio','cliente','tarefa','nota')),
  funil_id        uuid references public.funis(id),           -- só para entidade=negocio
  etapa_inicial   text,                                       -- só para entidade=negocio
  responsavel_id  uuid references public.users(id),
  mapa_campos     jsonb not null default '{}'::jsonb,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);
create index if not exists integracoes_wh_in_conexao_idx on public.integracoes_webhooks_in(conexao_id);

-- ─── 4) WEBHOOKS DE SAÍDA ────────────────────────────────────
-- O CRM dispara POST quando os eventos selecionados ocorrem.
-- secret é usado para assinar o payload (header X-Cm-Signature).
create table if not exists public.integracoes_webhooks_out (
  id            uuid primary key default uuid_generate_v4(),
  conexao_id    uuid not null references public.integracoes_conexoes(id) on delete cascade,
  nome          text not null,
  url           text not null,
  secret        text,                                          -- assinatura HMAC
  eventos       text[] not null default array[]::text[],       -- ex: negocio.criado, negocio.ganho, etapa.alterada, cliente.criado, tarefa.criada
  ativo         boolean not null default true,
  ultimo_envio  timestamptz,
  ultimo_status int,
  criado_em     timestamptz not null default now()
);
create index if not exists integracoes_wh_out_conexao_idx on public.integracoes_webhooks_out(conexao_id);
create index if not exists integracoes_wh_out_eventos_idx on public.integracoes_webhooks_out using gin(eventos);

-- ─── 5) LOGS ─────────────────────────────────────────────────
create table if not exists public.integracoes_logs (
  id            uuid primary key default uuid_generate_v4(),
  conexao_id    uuid references public.integracoes_conexoes(id) on delete set null,
  direcao       text not null check (direcao in ('in','out')),
  recurso       text,                                          -- "webhook_in:<id>", "api:negocios", "webhook_out:<id>"
  evento        text,                                          -- ex: negocio.criado
  status        text not null default 'ok' check (status in ('ok','erro')),
  http_status   int,
  payload       jsonb,
  resposta      jsonb,
  erro          text,
  criado_em     timestamptz not null default now()
);
create index if not exists integracoes_logs_conexao_idx on public.integracoes_logs(conexao_id, criado_em desc);
create index if not exists integracoes_logs_direcao_idx on public.integracoes_logs(direcao, criado_em desc);

-- ─── RLS ─────────────────────────────────────────────────────
alter table public.integracoes_conexoes    enable row level security;
alter table public.integracoes_api_keys    enable row level security;
alter table public.integracoes_webhooks_in enable row level security;
alter table public.integracoes_webhooks_out enable row level security;
alter table public.integracoes_logs        enable row level security;

-- helper inline: dono OU admin
-- conexões
drop policy if exists integ_conexoes_select on public.integracoes_conexoes;
create policy integ_conexoes_select on public.integracoes_conexoes
  for select using (
    owner_id = auth.uid()
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );
drop policy if exists integ_conexoes_modify on public.integracoes_conexoes;
create policy integ_conexoes_modify on public.integracoes_conexoes
  for all using (
    owner_id = auth.uid()
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  ) with check (
    owner_id = auth.uid()
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- api_keys, webhooks_in, webhooks_out herdam pela conexão dona
drop policy if exists integ_keys_all on public.integracoes_api_keys;
create policy integ_keys_all on public.integracoes_api_keys
  for all using (
    exists (
      select 1 from public.integracoes_conexoes c
      where c.id = conexao_id
        and (c.owner_id = auth.uid()
             or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
    )
  ) with check (
    exists (
      select 1 from public.integracoes_conexoes c
      where c.id = conexao_id
        and (c.owner_id = auth.uid()
             or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
    )
  );

drop policy if exists integ_wh_in_all on public.integracoes_webhooks_in;
create policy integ_wh_in_all on public.integracoes_webhooks_in
  for all using (
    exists (
      select 1 from public.integracoes_conexoes c
      where c.id = conexao_id
        and (c.owner_id = auth.uid()
             or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
    )
  ) with check (
    exists (
      select 1 from public.integracoes_conexoes c
      where c.id = conexao_id
        and (c.owner_id = auth.uid()
             or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
    )
  );

drop policy if exists integ_wh_out_all on public.integracoes_webhooks_out;
create policy integ_wh_out_all on public.integracoes_webhooks_out
  for all using (
    exists (
      select 1 from public.integracoes_conexoes c
      where c.id = conexao_id
        and (c.owner_id = auth.uid()
             or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
    )
  ) with check (
    exists (
      select 1 from public.integracoes_conexoes c
      where c.id = conexao_id
        and (c.owner_id = auth.uid()
             or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
    )
  );

drop policy if exists integ_logs_select on public.integracoes_logs;
create policy integ_logs_select on public.integracoes_logs
  for select using (
    conexao_id is null
    or exists (
      select 1 from public.integracoes_conexoes c
      where c.id = conexao_id
        and (c.owner_id = auth.uid()
             or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
    )
  );
-- inserts em logs vêm sempre via service role (rotas /api). Não precisa de policy de insert.

-- ─── 6) FILA DE EVENTOS PENDENTES ────────────────────────────
-- Triggers gravam aqui quando entidades do CRM mudam (criadas via UI/Supabase
-- direto, sem passar pela API REST do Integrador). Um cron interno processa
-- e dispara os webhooks de saída.
create table if not exists public.integracoes_eventos_pendentes (
  id            bigserial primary key,
  evento        text not null,
  payload       jsonb not null,
  tentativas    int not null default 0,
  processado_em timestamptz,
  criado_em     timestamptz not null default now()
);
create index if not exists integ_eventos_pendentes_idx
  on public.integracoes_eventos_pendentes(processado_em, criado_em)
  where processado_em is null;

alter table public.integracoes_eventos_pendentes enable row level security;
-- só admin lê a fila pelo dashboard (debug)
drop policy if exists integ_eventos_admin_select on public.integracoes_eventos_pendentes;
create policy integ_eventos_admin_select on public.integracoes_eventos_pendentes
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ─── 7) FUNÇÕES DE TRIGGER ───────────────────────────────────
create or replace function public.integrador_enq(p_evento text, p_payload jsonb)
returns void language plpgsql as $$
begin
  -- Só enfileira se houver algum webhook de saída ativo escutando o evento.
  -- Evita lixo na fila quando ninguém está escutando.
  if exists (
    select 1 from public.integracoes_webhooks_out
    where ativo = true and p_evento = any(eventos)
  ) then
    insert into public.integracoes_eventos_pendentes(evento, payload)
    values (p_evento, p_payload);
  end if;
end;
$$;

create or replace function public.integrador_trg_negocios()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.integrador_enq('negocio.criado', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.etapa is distinct from old.etapa then
      perform public.integrador_enq(
        'negocio.etapa_alterada',
        jsonb_build_object('id', new.id, 'anterior', old.etapa, 'atual', new.etapa, 'negocio', to_jsonb(new))
      );
      if lower(coalesce(new.etapa,'')) like '%ganho%' then
        perform public.integrador_enq('negocio.ganho', to_jsonb(new));
      elsif lower(coalesce(new.etapa,'')) like '%perdido%' then
        perform public.integrador_enq('negocio.perdido', to_jsonb(new));
      end if;
    else
      perform public.integrador_enq('negocio.atualizado', to_jsonb(new));
    end if;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_integrador_negocios on public.negocios;
create trigger trg_integrador_negocios
  after insert or update on public.negocios
  for each row execute procedure public.integrador_trg_negocios();

create or replace function public.integrador_trg_clientes()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.integrador_enq('cliente.criado', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    perform public.integrador_enq('cliente.atualizado', to_jsonb(new));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_integrador_clientes on public.clientes;
create trigger trg_integrador_clientes
  after insert or update on public.clientes
  for each row execute procedure public.integrador_trg_clientes();

create or replace function public.integrador_trg_tarefas()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.integrador_enq('tarefa.criada', to_jsonb(new));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status = 'concluida' then
    perform public.integrador_enq('tarefa.concluida', to_jsonb(new));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_integrador_tarefas on public.tarefas;
create trigger trg_integrador_tarefas
  after insert or update on public.tarefas
  for each row execute procedure public.integrador_trg_tarefas();

create or replace function public.integrador_trg_historico()
returns trigger language plpgsql as $$
begin
  perform public.integrador_enq('nota.criada', to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists trg_integrador_historico on public.historico;
create trigger trg_integrador_historico
  after insert on public.historico
  for each row execute procedure public.integrador_trg_historico();

-- search_path imutável em todas as funções (advisor function_search_path_mutable)
alter function public.integrador_enq(text, jsonb)  set search_path = public;
alter function public.integrador_trg_negocios()    set search_path = public;
alter function public.integrador_trg_clientes()    set search_path = public;
alter function public.integrador_trg_tarefas()     set search_path = public;
alter function public.integrador_trg_historico()   set search_path = public;
