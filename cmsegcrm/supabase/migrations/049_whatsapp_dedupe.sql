-- ─── Deduplicação de mensagens do WhatsApp ────────────
-- A Evolution API pode reenviar o mesmo webhook (retry/reentrega), causando
-- mensagens duplicadas. Garantimos unicidade por (instancia_id, evolution_id)
-- quando evolution_id está presente. Antes de criar o índice, removemos
-- duplicatas já existentes mantendo a primeira ocorrência (menor created_at).

with ranked as (
  select id,
         row_number() over (
           partition by instancia_id, evolution_id
           order by created_at asc, id asc
         ) as rn
  from public.whatsapp_mensagens
  where evolution_id is not null
)
delete from public.whatsapp_mensagens m
using ranked r
where m.id = r.id and r.rn > 1;

create unique index if not exists whatsapp_mensagens_evo_unique
  on public.whatsapp_mensagens (instancia_id, evolution_id)
  where evolution_id is not null;
