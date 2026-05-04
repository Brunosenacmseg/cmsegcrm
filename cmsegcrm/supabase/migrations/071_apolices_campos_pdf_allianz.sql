-- ─────────────────────────────────────────────────────────────
-- 071_apolices_campos_pdf_allianz.sql
-- Adiciona em public.apolices os campos que aparecem nas apólices
-- Allianz importadas via PDF e que ainda não tinham coluna dedicada.
-- Os relacionamentos detalhados (itens auto, coberturas, motoristas,
-- locais, cláusulas) reaproveitam as tabelas já criadas em 052
-- (HDI integração) — também usadas pela importação Allianz.
-- ─────────────────────────────────────────────────────────────

alter table public.apolices
  -- ── Auto / veículo (snapshot rápido; detalhe vai em apolice_itens_auto)
  add column if not exists chassi                       text,
  add column if not exists ano_modelo                   text,
  add column if not exists cod_fipe                     text,
  add column if not exists categoria_risco              text,
  add column if not exists finalidade_uso               text,
  add column if not exists kit_gas                      boolean,
  add column if not exists classe_bonus                 int,
  add column if not exists zero_km                      boolean,
  add column if not exists cep_pernoite                 text,
  add column if not exists veiculo_descricao            text,
  add column if not exists veiculo_igual_anterior       boolean,
  add column if not exists fim_vigencia_anterior        date,
  add column if not exists seguradora_anterior          text,
  add column if not exists condutor_principal           jsonb,

  -- ── PME / Residência / Empresa
  add column if not exists tipo_residencia              text,
  add column if not exists tipo_construcao              text,
  add column if not exists tipo_contratacao             text,    -- Edif.+Conteúdo, Prédio/Conteúdo
  add column if not exists telhado_isopainel            boolean,
  add column if not exists objeto_seguro                text,
  add column if not exists valor_em_risco               numeric(14,2),
  add column if not exists limite_maximo_garantia       numeric(14,2),
  add column if not exists valor_de_novo                boolean,
  add column if not exists atividade_local              text,
  add column if not exists local_segurado               jsonb,

  -- ── Vida
  add column if not exists profissao                    text,
  add column if not exists esporte_radical              text,
  add column if not exists pacote_contratado            text,
  add column if not exists num_empregados               int,
  add column if not exists num_socios                   int,
  add column if not exists num_segurados                int,
  add column if not exists capital_total_segurado       numeric(14,2),
  add column if not exists capital_total_empregados     numeric(14,2),
  add column if not exists capital_total_socios         numeric(14,2),

  -- ── Vigência (vida individual tem multi-ano + anual)
  add column if not exists vigencia_tipo                text,            -- 'anual' / '5 anos' / 'plurianual'
  add column if not exists vigencia_anual_ini           date,
  add column if not exists vigencia_anual_fim           date,

  -- ── Pagamento detalhado
  add column if not exists taxa_juros_mensal            numeric(8,4),
  add column if not exists valor_juros                  numeric(14,2),
  add column if not exists custo_apolice                numeric(14,2),
  add column if not exists cartao_final                 text,            -- 4 últimos dígitos
  add column if not exists forma_pagamento_descricao    text,            -- string completa
  add column if not exists franquia_tipo                text,            -- 'Isenção de franquia', 'Reduzida', etc.
  add column if not exists franquia_valor               numeric(14,2),

  -- ── Listas estruturadas (snapshots do PDF)
  add column if not exists assistencias                 jsonb default '[]'::jsonb,
  add column if not exists parcelas_pdf                 jsonb default '[]'::jsonb,
  add column if not exists dados_pdf                    jsonb,

  -- ── Metadados de processo
  add column if not exists versao_tabela                text,
  add column if not exists condicoes_gerais             text,
  add column if not exists cod_ci                       text,
  add column if not exists grupo_codigo                 text,
  add column if not exists tipo_seguro_descricao        text,           -- 'Renovação de outra seguradora sem sinistro', 'Seguro Novo'...
  add column if not exists pdf_importado_em             timestamptz;

create index if not exists idx_apolices_chassi      on public.apolices(chassi);
create index if not exists idx_apolices_pdf_dt      on public.apolices(pdf_importado_em);
create index if not exists idx_apolices_dados_pdf   on public.apolices using gin (dados_pdf);
