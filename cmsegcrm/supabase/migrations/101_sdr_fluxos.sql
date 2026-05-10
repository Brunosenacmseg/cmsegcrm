-- ─────────────────────────────────────────────────────────────
-- 101_sdr_fluxos.sql
-- Generaliza o SDR SUHAI em um motor de FLUXOS configuráveis.
--
-- Antes:  cron com regras hardcoded (funil="meta+multicanal",
--         agente="Marcelo Cunha SDR", 3 tentativas, 4h úteis).
-- Depois: cada fluxo é uma linha em sdr_fluxos com seu próprio
--         funil, agente, número de tentativas, intervalo, prompt.
--
-- Compat: a tabela negocios_suhai_state ganha fluxo_id; rows
-- existentes (criadas por #185) são linkadas ao fluxo SUHAI seed.
-- ─────────────────────────────────────────────────────────────

-- A) Tabela de fluxos
create table if not exists public.sdr_fluxos (
  id                       uuid primary key default uuid_generate_v4(),
  nome                     text not null,
  descricao                text,
  funil_id                 uuid not null references public.funis(id) on delete cascade,
  agente_id                uuid not null references public.ai_agentes(id) on delete restrict,
  -- Sequência de etapas que serão percorridas em ordem (1ª, 2ª, ... última).
  -- Cada elemento corresponde a um valor possível em negocios.etapa.
  etapas_tentativas        text[] not null,
  -- Etapa pra onde o card vai quando o cliente RESPONDE.
  etapa_interacao          text not null,
  -- Etapa final quando esgotam as tentativas sem resposta.
  etapa_perdido            text not null,
  -- Intervalo de horas úteis entre cada tentativa.
  horas_entre_tentativas   numeric(5,2) not null default 4 check (horas_entre_tentativas > 0 and horas_entre_tentativas <= 168),
  -- Janela de horário útil (BRT). Default 08:30-18:00, todos os dias.
  horario_util_inicio      time not null default '08:30',
  horario_util_fim         time not null default '18:00',
  -- Prompt template usado pelo LLM. Suporta os placeholders:
  --   {{nome}}              → primeiro nome do lead
  --   {{tentativa_n}}       → número da tentativa atual (1, 2, ...)
  --   {{total_tentativas}}  → total configurado no fluxo
  --   {{tipo_tentativa}}    → 'abertura' | 'followup' | 'ultima_tentativa'
  prompt_template          text not null,
  ativo                    boolean not null default true,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),
  created_by               uuid references public.users(id),
  check (array_length(etapas_tentativas, 1) between 1 and 10),
  check (horario_util_inicio < horario_util_fim)
);

-- Garante 1 fluxo ATIVO por funil — múltiplos inativos são ok (versionar).
create unique index if not exists sdr_fluxos_funil_ativo_uq
  on public.sdr_fluxos (funil_id) where ativo = true;

create index if not exists sdr_fluxos_ativo_idx
  on public.sdr_fluxos (ativo, funil_id) where ativo = true;

alter table public.sdr_fluxos enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'sdr_fluxos'
      and policyname = 'admin lê sdr_fluxos'
  ) then
    create policy "admin lê sdr_fluxos" on public.sdr_fluxos for select using (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
    );
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'sdr_fluxos'
      and policyname = 'admin escreve sdr_fluxos'
  ) then
    create policy "admin escreve sdr_fluxos" on public.sdr_fluxos for all using (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
    );
  end if;
end $$;

drop trigger if exists sdr_fluxos_updated_at on public.sdr_fluxos;
create trigger sdr_fluxos_updated_at
  before update on public.sdr_fluxos
  for each row execute procedure update_updated_at();

-- B) Adiciona fluxo_id ao state. Mantém o nome da tabela
-- (negocios_suhai_state) pra não quebrar a PR #185 ainda em revisão —
-- o cron refatorado vai usar a mesma tabela.
alter table public.negocios_suhai_state
  add column if not exists fluxo_id uuid references public.sdr_fluxos(id) on delete cascade;

create index if not exists negocios_suhai_state_fluxo_idx
  on public.negocios_suhai_state (fluxo_id);

-- Estende o check de etapa_sdr pra suportar até 10 tentativas
-- (antes só tinha tentativa_1..3 hardcoded).
do $$ begin
  if exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'negocios_suhai_state' and c.conname like '%etapa_sdr%check%'
  ) then
    alter table public.negocios_suhai_state drop constraint if exists negocios_suhai_state_etapa_sdr_check;
  end if;
end $$;
alter table public.negocios_suhai_state
  add constraint negocios_suhai_state_etapa_sdr_check
  check (etapa_sdr in (
    'pendente',
    'tentativa_1','tentativa_2','tentativa_3','tentativa_4','tentativa_5',
    'tentativa_6','tentativa_7','tentativa_8','tentativa_9','tentativa_10',
    'interagiu','perdido','sem_whatsapp','sem_telefone','backfill_skip','erro'
  ));

-- C) Seed: cria o fluxo "SUHAI SDR" representando a config hardcoded
-- existente. Idempotente — só insere se ainda não existe um fluxo
-- ativo no funil META + MULTICANAL.
insert into public.sdr_fluxos (
  nome, descricao, funil_id, agente_id,
  etapas_tentativas, etapa_interacao, etapa_perdido,
  horas_entre_tentativas, horario_util_inicio, horario_util_fim,
  prompt_template, ativo
)
select 'SUHAI SDR',
       'Aborda automaticamente leads SUHAI vindos do Meta. Faz 1 abertura + 2 followups com 4h úteis entre cada.',
       f.id,
       a.id,
       array['TENTATIVA 1','TENTATIVA 2','TENTATIVA 3']::text[],
       'INTERAÇÃO',
       'PERDIDO',
       4,
       '08:30'::time,
       '18:00'::time,
       'Mande uma mensagem curta para o lead {{nome}} (tentativa {{tentativa_n}} de {{total_tentativas}} — {{tipo_tentativa}}).
- Se for abertura: apresente-se brevemente como Marcelo Cunha da CM Seguros e pergunte sobre o veículo (modelo + ano) que ele quer cotar no SUHAI.
- Se for followup: tom gentil, sem pressão, lembrando que está disponível pra ajudar.
- Se for última tentativa: diga que vai aguardar contato dele quando puder, sem cobrança.
Português BR informal mas profissional. Máx 2 frases.',
       true
from public.funis f
join public.ai_agentes a on a.nome = 'Marcelo Cunha SDR'
where f.nome ilike '%meta%multicanal%'
  and not exists (
    select 1 from public.sdr_fluxos sf where sf.funil_id = f.id and sf.ativo = true
  );

-- D) Backfill: rows existentes em negocios_suhai_state são linkadas
-- ao fluxo SUHAI SDR seed (todas elas vieram desse fluxo).
update public.negocios_suhai_state
set fluxo_id = (select id from public.sdr_fluxos where nome = 'SUHAI SDR' and ativo = true limit 1)
where fluxo_id is null;
