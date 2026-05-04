-- ─────────────────────────────────────────────────────────────
-- 075_seg_stage_comissoes_completar.sql
-- Adiciona TODOS os campos de extrato de comissão das 12 seguradoras
-- (Allianz, Bradesco, Ezze, HDI, Justos, Kovr, Mapfre, Porto, Suhai, Tokio,
-- Yelum, Zurich) que apareciam apenas no `dados jsonb` e merecem coluna
-- dedicada para filtros/relatórios financeiros.
-- ─────────────────────────────────────────────────────────────

alter table public.seg_stage_comissoes
  -- ── Identificação do extrato (cabeçalho) ──────────────────────
  add column if not exists numero_extrato        text,            -- "Extrato nº 1234"
  add column if not exists numero_recibo         text,            -- Ezze, Kovr: "RECIBO Nº 2026/N"
  add column if not exists data_extrato          date,            -- data de processamento do extrato
  add column if not exists numero_fatura         text,            -- Bradesco
  add column if not exists protocolo             text,
  add column if not exists ordem_pagamento       text,            -- Porto
  -- ── Identificação adicional da apólice/proposta ──────────────
  add column if not exists endosso               text,
  add column if not exists bilhete               text,            -- Tokio: "Apolice/Bilhete"
  add column if not exists numero_contrato       text,            -- Bradesco: "Nº Contrato/Formulário"
  add column if not exists certificado           text,            -- Bradesco: certificado/proposta
  add column if not exists numero_formulario_venda text,
  add column if not exists subfatura             text,
  -- ── Tipo de lançamento (positivo/negativo) ────────────────────
  add column if not exists tipo_lancamento       text,            -- "TP. LANÇ" Bradesco
  add column if not exists tipo_lancamento_codigo text,           -- "8", "69", "45" etc.
  add column if not exists descricao_lancamento  text,            -- "PAGTO COMISSÃO", "RECUPERAÇÃO"
  add column if not exists tipo_pagamento        text,            -- Suhai: "Pagto Comissão", "Cancelamento", "Adiantamento"
  add column if not exists tipo_comissao         text,            -- Tokio: "COMISSAO", "COMISSAO ANTECIPADA"
  add column if not exists motivo_recuperacao    text,            -- Yelum
  -- ── Marca/seguradora (para extratos consolidados — Porto) ─────
  add column if not exists marca_seguradora      text,            -- "Porto", "Itaú", "Azul"
  add column if not exists ramo_codigo           text,
  add column if not exists ramo_descricao        text,
  add column if not exists carteira              text,            -- Zurich: "CARTEIRA"
  add column if not exists negocio               text,            -- Tokio
  add column if not exists sub_codigo            text,            -- Zurich: "SUB COD"
  add column if not exists sucursal              text,
  add column if not exists filial                text,
  add column if not exists inspetoria            text,
  add column if not exists agencia_producao      text,            -- Mapfre
  add column if not exists susep_producao        text,            -- Porto: "Susep Produção"
  add column if not exists susep_favorecida      text,            -- Porto: "Susep Favorecida"
  -- ── Códigos internos / classificação ──────────────────────────
  add column if not exists cnpj_filial           text,            -- Allianz
  add column if not exists nat                   text,            -- Zurich: natureza (AC, AR, CC, etc.)
  add column if not exists tipo_zurich           text,            -- Zurich: tipo (CO, AD, CS, etc.)
  -- ── Valores financeiros (linha) ───────────────────────────────
  add column if not exists premio_liquido        numeric(14,2),
  add column if not exists premio_taxa           numeric(14,2),   -- Porto: separação prêmio vs. taxa
  add column if not exists comissao_bruta        numeric(14,2),
  add column if not exists comissao_liquida      numeric(14,2),
  add column if not exists adiantamento          numeric(14,2),
  add column if not exists desconto_adiantamento numeric(14,2),
  add column if not exists abatimento            numeric(14,2),
  add column if not exists recuperacao           numeric(14,2),
  add column if not exists outros_creditos_debitos numeric(14,2),
  add column if not exists rce                   numeric(14,2),
  -- ── Impostos retidos por linha ───────────────────────────────
  add column if not exists irrf                  numeric(14,2),
  add column if not exists iss                   numeric(14,2),
  add column if not exists inss                  numeric(14,2),
  add column if not exists pis                   numeric(14,2),
  add column if not exists cofins                numeric(14,2),
  add column if not exists csll                  numeric(14,2),
  add column if not exists pis_cofins_csll       numeric(14,2),   -- agregado (Tokio, Suhai, Ezze)
  add column if not exists aliquota_iss          numeric(8,4),
  add column if not exists aliquota_irrf         numeric(8,4),
  add column if not exists aliquota_inss         numeric(8,4),
  -- ── Totais consolidados do extrato (denormalizados) ──────────
  add column if not exists total_bruto           numeric(14,2),
  add column if not exists total_liquido         numeric(14,2),
  add column if not exists total_descontos       numeric(14,2),
  add column if not exists total_irrf            numeric(14,2),
  add column if not exists total_iss             numeric(14,2),
  add column if not exists total_inss            numeric(14,2),
  add column if not exists base_tributaria       numeric(14,2),
  add column if not exists base_irpj             numeric(14,2),
  add column if not exists saldo_recuperar       numeric(14,2),
  add column if not exists saldo_atual           numeric(14,2),
  add column if not exists valor_emissao_nf      numeric(14,2),
  -- ── Forma de crédito (cabeçalho) ─────────────────────────────
  add column if not exists forma_credito         text,
  add column if not exists tipo_credito          text,
  add column if not exists banco                 text,
  add column if not exists agencia               text,
  add column if not exists conta_corrente        text,
  add column if not exists doc_numero            text,            -- Yelum: "DOC Nº"
  add column if not exists data_credito          date,
  -- ── Corretor (denormalizado p/ relatórios) ───────────────────
  add column if not exists corretor_nome         text,
  add column if not exists corretor_cnpj         text,
  add column if not exists corretor_susep        text,
  add column if not exists corretor_endereco     text,
  add column if not exists corretor_inscricao_inss text,
  add column if not exists corretor_inscricao_municipio text,
  add column if not exists cnpj_emissao_nf       text,
  -- ── Adicionais ───────────────────────────────────────────────
  add column if not exists supervisor_codigo     text,            -- Zurich: COD. SUP.
  add column if not exists supervisor_nome       text,            -- Zurich: Nome SUP
  add column if not exists antecipada            text,            -- Allianz: S/N
  add column if not exists periodo_inicio        date,            -- Allianz: REFERENTE À DD/MM a DD/MM
  add column if not exists periodo_fim           date,
  add column if not exists data_baixa            date,            -- Mapfre
  -- ── Debug ────────────────────────────────────────────────────
  add column if not exists seguradora_origem     text,
  add column if not exists layout_pdf            text,
  add column if not exists pdf_texto_bruto       text;

comment on column public.seg_stage_comissoes.tipo_lancamento is
  'Tipo de lançamento financeiro: "PAGTO COMISSÃO", "RECUPERAÇÃO", "CANCELAMENTO", "ADIANTAMENTO", "RESTITUIÇÃO". Identifica se a linha é crédito ou débito.';
comment on column public.seg_stage_comissoes.tipo_lancamento_codigo is
  'Código numérico do tipo de lançamento (Bradesco usa 8, Porto usa 69/45/72/46/106/107/203, etc.). Para mapeamento em consolidações.';
comment on column public.seg_stage_comissoes.marca_seguradora is
  'Marca específica dentro do extrato (Porto envia extratos consolidados com marcas Porto, Itaú e Azul juntas).';
comment on column public.seg_stage_comissoes.nat is
  'Natureza do movimento Zurich: AC=Aceite, AR=Antecipação, CM=Comissão, CP=Cobrança Premio, CC=Cancelamento, CN=Cancelamento Negativo, RC=Recuperação Cancelamento, SC=Sub-Comissão, SR=Sub-Recuperação, RI=Restituição.';
comment on column public.seg_stage_comissoes.tipo_zurich is
  'Tipo de comissão Zurich: AD=Adiantamento, AG/AL=Agente/Aluguel, CA=Cancelamento, CO=Corretagem, CS=Cobrança, FN=Faturado.';
