-- Migration 067: campos extras em seg_stage_sinistros pra suportar
-- planilha de sinistros da Allianz (Ramo, Sexo, Item, Item/Adesao).

alter table public.seg_stage_sinistros
  add column if not exists ramo        text,
  add column if not exists sexo        text,
  add column if not exists item        text,
  add column if not exists item_adesao text;
