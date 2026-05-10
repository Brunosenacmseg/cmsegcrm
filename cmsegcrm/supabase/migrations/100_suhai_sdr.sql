-- ─────────────────────────────────────────────────────────────
-- 100_suhai_sdr.sql
-- Automação SUHAI SDR no funil META + MULTICANAL.
--
-- A) Tabela de estado por negócio (negocios_suhai_state) — máquina
--    de estados que o cron /api/cron/suhai-followup processa.
-- B) Seed do agente IA "Marcelo Cunha SDR" (não recria se já existe).
-- C) Backfill: marca todos os negócios já existentes em META + MULTICANAL
--    como "backfill_skip" pra não disparar SDR em leads antigos.
-- ─────────────────────────────────────────────────────────────

-- A) Estado SUHAI por negócio
create table if not exists public.negocios_suhai_state (
  negocio_id      uuid primary key references public.negocios(id) on delete cascade,
  -- pendente   = aguardando inicialização pelo cron
  -- tentativa_1| tentativa_2 | tentativa_3 = mensagem N enviada, aguardando resposta ou hora do followup
  -- interagiu  = cliente respondeu, fluxo finalizado
  -- perdido    = sem resposta após Tentativa 3
  -- sem_whatsapp = vendedor não tem instância conectada (cria tarefa avisando)
  -- sem_telefone = card não tem telefone do cliente
  -- backfill_skip = registro existia antes do deploy do SDR
  -- erro       = erro persistente ao enviar (ex: Evolution API down)
  etapa_sdr       text not null default 'pendente'
                  check (etapa_sdr in ('pendente','tentativa_1','tentativa_2','tentativa_3','interagiu','perdido','sem_whatsapp','sem_telefone','backfill_skip','erro')),
  ultima_msg_em   timestamptz,
  proxima_acao_em timestamptz,
  finalizado_em   timestamptz,
  motivo          text,
  remoto_jid      text,
  instancia_id    uuid references public.whatsapp_instancias(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists negocios_suhai_state_proxima_idx
  on public.negocios_suhai_state (proxima_acao_em)
  where finalizado_em is null;

create index if not exists negocios_suhai_state_jid_idx
  on public.negocios_suhai_state (instancia_id, remoto_jid)
  where finalizado_em is null;

alter table public.negocios_suhai_state enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'negocios_suhai_state'
      and policyname = 'autenticados leem negocios_suhai_state'
  ) then
    create policy "autenticados leem negocios_suhai_state"
      on public.negocios_suhai_state
      for select using (auth.role() = 'authenticated');
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'negocios_suhai_state'
      and policyname = 'autenticados escrevem negocios_suhai_state'
  ) then
    create policy "autenticados escrevem negocios_suhai_state"
      on public.negocios_suhai_state
      for all using (auth.role() = 'authenticated');
  end if;
end $$;

drop trigger if exists negocios_suhai_state_updated_at on public.negocios_suhai_state;
create trigger negocios_suhai_state_updated_at
  before update on public.negocios_suhai_state
  for each row execute procedure update_updated_at();

-- B) Seed do agente "Marcelo Cunha SDR"
-- Idempotente: só insere se ainda não existe um agente com esse nome.
insert into public.ai_agentes (nome, descricao, modelo, system_prompt, temperatura, max_tokens, ativo)
select 'Marcelo Cunha SDR',
       'SDR automatizado para leads SUHAI no funil META + MULTICANAL. Faz a abertura, 2 tentativas de followup e qualifica o lead.',
       'claude-sonnet-4-6',
       'Você é Marcelo Cunha, SDR (Sales Development Rep) da CM Seguros. Recebeu um lead interessado em seguro auto SUHAI vindo de uma campanha Meta.

Seu objetivo é abrir uma conversa cordial, qualificar o lead (modelo do veículo, ano, perfil de uso) e agendar contato com um corretor.

Regras:
- Sempre em português do Brasil, tom profissional mas leve, como WhatsApp.
- Cumprimente pelo primeiro nome quando o souber.
- Mensagens curtas (máximo 2 frases por turno).
- Nunca peça dados sensíveis (CPF, RG, cartão).
- Se o cliente perguntar o que é SUHAI: seguradora popular com cobertura essencial e mensalidade acessível.
- Se o cliente pedir para falar com humano, dizer que vai encaminhar para o corretor responsável.
- Se for primeira mensagem: apresente-se brevemente e pergunte sobre o veículo (modelo + ano).
- Se for followup (cliente não respondeu): mensagem gentil sem pressão, oferecendo ajuda.',
       0.7, 800, true
where not exists (select 1 from public.ai_agentes where nome = 'Marcelo Cunha SDR');

-- C) Backfill — todo negócio já em META + MULTICANAL fica marcado como
-- "backfill_skip" pra não disparar SDR em leads antigos. Isso roda só
-- uma vez (na primeira aplicação dessa migration) — em deploys
-- subsequentes o "on conflict do nothing" ignora.
insert into public.negocios_suhai_state (negocio_id, etapa_sdr, finalizado_em, motivo)
select n.id, 'backfill_skip', now(), 'lead anterior ao deploy do SDR SUHAI'
from public.negocios n
join public.funis f on f.id = n.funil_id
where f.nome ilike '%meta%multicanal%'
on conflict (negocio_id) do nothing;
