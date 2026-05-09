-- Pedido de bruno.bonsolhos em /dashboard/melhorias: o funil VENDA exibia
-- duas colunas "APÓLICE EMITIDA" porque 2 cards estavam com a etapa sem
-- acento ("APOLICE EMITIDA") enquanto a etapa oficial em funis.etapas
-- tem o acento ("APÓLICE EMITIDA"). O kanban renderiza qualquer valor
-- distinto de etapa, então o resultado eram duas colunas com o mesmo
-- nome aparente.
--
-- Fix genérico: para qualquer card cuja etapa, depois de remover acentos
-- e padronizar caixa, bate com uma das etapas oficiais do funil mas não
-- bate exatamente, atualiza o valor para a etapa oficial. Cobre o caso
-- atual e qualquer mismatch parecido que apareça no futuro.
WITH oficial AS (
  SELECT
    f.id AS funil_id,
    e AS etapa_oficial,
    upper(translate(e, 'ÁÀÃÂÉÈÊÍÓÔÕÚÜÇáàãâéèêíóôõúüç', 'AAAAEEEIOOOUUCAAAAEEEIOOOUUC')) AS chave
  FROM public.funis f, unnest(f.etapas) e
)
UPDATE public.negocios n
SET etapa = o.etapa_oficial,
    updated_at = now()
FROM oficial o
WHERE n.funil_id = o.funil_id
  AND n.etapa <> o.etapa_oficial
  AND upper(translate(n.etapa, 'ÁÀÃÂÉÈÊÍÓÔÕÚÜÇáàãâéèêíóôõúüç', 'AAAAEEEIOOOUUCAAAAEEEIOOOUUC')) = o.chave;
