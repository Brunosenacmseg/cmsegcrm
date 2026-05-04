-- Migration 068: campos extras em seg_stage_inadimplencia pra suportar
-- planilha de inadimplencia da Allianz (Ramo, Item/Adesao, Recibo, Premio,
-- Previsao Cancelamento, Sexo, Parcelas).

alter table public.seg_stage_inadimplencia
  add column if not exists ramo                  text,
  add column if not exists item_adesao           text,
  add column if not exists recibo                text,
  add column if not exists premio                numeric(12,2),
  add column if not exists previsao_cancelamento date,
  add column if not exists sexo                  text,
  add column if not exists parcelas              text;
