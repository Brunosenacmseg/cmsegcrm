-- Pedido de thaina em /dashboard/melhorias: cards de renovação não vinham
-- com o nº da apólice anterior. Adiciona coluna dedicada e backfill a
-- partir do título e do `obs` ("Apólice X" / "Importado de apólice nº X").
ALTER TABLE public.negocios
  ADD COLUMN IF NOT EXISTS apolice_anterior_numero text;

UPDATE public.negocios
SET apolice_anterior_numero = trim(substring(titulo from '^Ap[oó]lice\s+(.+)$'))
WHERE apolice_anterior_numero IS NULL
  AND titulo ~* '^ap[oó]lice\s+';

UPDATE public.negocios
SET apolice_anterior_numero = trim(substring(obs from 'ap[oó]lice\s*n[ºo]?\.?\s*([A-Za-z0-9._\-]+)'))
WHERE apolice_anterior_numero IS NULL
  AND obs ~* 'ap[oó]lice';

CREATE INDEX IF NOT EXISTS idx_negocios_apolice_anterior_numero
  ON public.negocios(apolice_anterior_numero) WHERE apolice_anterior_numero IS NOT NULL;

-- Pedido de lilian.cruz: reordenar etapas do funil VENDA. A proposta vai
-- pra seguradora, depois faz vistoria e por último agenda o rastreador.
UPDATE public.funis
SET etapas = ARRAY[
  'NOVO LEAD',
  'INTERAÇÃO',
  'ORÇAMENTO ENVIADO/NEGOCIAÇÃO',
  'RETORNO COBRADO',
  'PROPOSTA ENVIADA',
  'PENDENTE RASTREADOR',
  'PROPOSTA EFETIVADA',
  'ENDOSSO EMITIDO',
  'APÓLICE EMITIDA'
]
WHERE nome = 'VENDA' AND tipo = 'venda';
