-- ═══════════════════════════════════════════════════════════════════
-- Migration 028 — WhatsApp: mídia e transcrição de áudio
-- ═══════════════════════════════════════════════════════════════════
-- Adiciona colunas para armazenar a referência da mídia (path no Storage),
-- mimetype, nome do arquivo, duração (para áudio) e a transcrição.
-- Os arquivos ficam no bucket "cmsegcrm" sob a pasta "whatsapp/".

alter table public.whatsapp_mensagens
  add column if not exists midia_url        text,
  add column if not exists midia_mimetype   text,
  add column if not exists midia_nome       text,
  add column if not exists midia_duracao    int,
  add column if not exists transcricao      text;

-- Permite os novos tipos de mensagem
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name='whatsapp_mensagens' and column_name='tipo'
  ) then
    -- nada a fazer; tipo é text livre
    null;
  end if;
end $$;
