-- ─── Marcação de mensagens apagadas no WhatsApp ───────
-- Quando o contato (ou o próprio usuário) apaga uma mensagem no WhatsApp,
-- a Evolution envia messages.delete / messages.update revoke. Em vez de
-- remover a linha, marcamos como apagada e preservamos o conteúdo original
-- para auditoria/histórico.

alter table public.whatsapp_mensagens
  add column if not exists deletada boolean not null default false,
  add column if not exists deletada_em timestamptz;
