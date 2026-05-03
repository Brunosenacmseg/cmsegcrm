-- ─── WhatsApp ↔ Negociação ───────────────────────────
-- Vincula opcionalmente uma conversa do WhatsApp (e suas mensagens) a um
-- negócio (negociação) já existente. O vínculo de cliente continua existindo
-- e é independente — uma conversa pode ter cliente sem negócio.

alter table public.whatsapp_mensagens
  add column if not exists negocio_id uuid references public.negocios(id) on delete set null;

create index if not exists whatsapp_mensagens_negocio_idx
  on public.whatsapp_mensagens (negocio_id);
