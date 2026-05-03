-- Adiciona campos de comportamento e base de conhecimento aos agentes de IA.

alter table public.ai_agentes
  add column if not exists base_conhecimento text;
