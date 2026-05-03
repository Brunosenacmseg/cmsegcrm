-- ─────────────────────────────────────────────────────────────
-- 066_seg_import_xml.sql
-- Adiciona 'xml' à lista de formatos aceitos pelo import de seguradora.
-- ─────────────────────────────────────────────────────────────

alter table public.seg_importacoes drop constraint if exists seg_importacoes_formato_check;
alter table public.seg_importacoes add constraint seg_importacoes_formato_check
  check (formato in ('xlsx','csv','xml','pdf','ret'));
