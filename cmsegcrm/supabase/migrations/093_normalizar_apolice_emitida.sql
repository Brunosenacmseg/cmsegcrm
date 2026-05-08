-- ─────────────────────────────────────────────────────────────
-- 093_normalizar_apolice_emitida.sql
-- Corrige o funil "META + MULTICANAL", que possuía duas etapas
-- praticamente iguais ("APÓLICE EMITIDA" e "APOLICE EMITIDA"),
-- gerando duas colunas no kanban. Padroniza a grafia para
-- "APÓLICE EMITIDA" (com acento) em todos os funis e migra as
-- negociações que estavam na variante sem acento para a forma
-- canônica.
-- ─────────────────────────────────────────────────────────────

begin;

-- 1) Migra as negociações que estão na grafia "APOLICE EMITIDA"
--    (sem acento) para "APÓLICE EMITIDA" (com acento) antes de
--    remover a variante sem acento do array de etapas.
update public.negocios
   set etapa = 'APÓLICE EMITIDA'
 where etapa = 'APOLICE EMITIDA';

-- 2) Normaliza o array de etapas: substitui "APOLICE EMITIDA"
--    por "APÓLICE EMITIDA" e remove duplicatas preservando a
--    ordem de primeira aparição.
update public.funis f
   set etapas = sub.etapas_norm
  from (
    select
      id,
      array_agg(etapa_norm order by primeiro_idx) as etapas_norm
    from (
      select
        id,
        etapa_norm,
        min(idx) as primeiro_idx
      from (
        select
          f2.id,
          case when e = 'APOLICE EMITIDA' then 'APÓLICE EMITIDA' else e end as etapa_norm,
          idx
        from public.funis f2,
             unnest(f2.etapas) with ordinality as t(e, idx)
      ) expandido
      group by id, etapa_norm
    ) com_ordem
    group by id
  ) sub
 where f.id = sub.id
   and f.etapas is distinct from sub.etapas_norm;

commit;
