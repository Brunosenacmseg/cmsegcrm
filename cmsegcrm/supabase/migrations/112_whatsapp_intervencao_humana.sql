-- ─────────────────────────────────────────────────────────────
-- 112_whatsapp_intervencao_humana.sql
-- Permite que o agente IA marque uma conversa como precisando de
-- intervenção humana. Quando isso acontece, o agente NÃO envia
-- mensagem ao cliente — apenas registra um aviso no CRM e pausa
-- o agente nessa conversa até um operador atender.
-- ─────────────────────────────────────────────────────────────

alter table public.whatsapp_conversa_agentes
  add column if not exists intervencao_solicitada boolean not null default false;

alter table public.whatsapp_conversa_agentes
  add column if not exists intervencao_solicitada_em timestamptz;

create index if not exists whatsapp_conversa_agentes_intervencao_idx
  on public.whatsapp_conversa_agentes (instancia_id, intervencao_solicitada)
  where intervencao_solicitada = true;
