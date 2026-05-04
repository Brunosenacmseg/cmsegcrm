-- ─────────────────────────────────────────────────────────────
-- 073_seg_stage_apolices_completar.sql
-- Adiciona TODOS os campos restantes que aparecem nos layouts de apólice
-- das 16 seguradoras (Allianz, Azul, Bradesco, Darwin, Ezze, HDI, Justos,
-- Kovr, Mapfre, Novo, Pier, Porto, Suhai, Tokio, Yelum, Youse, Zurich).
--
-- Complementa as migrations 070 (Ezze) e 072 (universais).
-- Tudo que não couber em coluna explícita continua acessível em `dados jsonb`.
-- ─────────────────────────────────────────────────────────────

alter table public.seg_stage_apolices
  -- ── Documentos pessoais (Bradesco, Mapfre, Suhai, Zurich) ─────
  add column if not exists segurado_doc_identidade   text,
  add column if not exists segurado_doc_orgao_exp    text,
  add column if not exists segurado_doc_data_exp     date,
  add column if not exists segurado_naturalidade     text,
  add column if not exists segurado_nacionalidade    text,
  add column if not exists segurado_profissao        text,
  add column if not exists segurado_renda            numeric(14,2),
  add column if not exists segurado_atividade        text,
  add column if not exists segurado_pais_nascimento  text,
  add column if not exists segurado_numero           text,
  add column if not exists segurado_complemento      text,
  add column if not exists segurado_telefone2        text,
  add column if not exists segurado_email2           text,
  -- ── Proprietário do veículo (quando ≠ segurado) ───────────────
  add column if not exists proprietario_nome         text,
  add column if not exists proprietario_cpf_cnpj     text,
  add column if not exists proprietario_tipo_pessoa  text,
  add column if not exists proprietario_vinculo      text,  -- "Próprio", "Cônjuge", etc.
  add column if not exists proprietario_data_nasc    date,
  -- ── Beneficiário (Bradesco, Porto/Azul) ───────────────────────
  add column if not exists beneficiario              text,
  -- ── Veículo: campos avançados ─────────────────────────────────
  add column if not exists tipo_utilizacao           text,  -- "Particular", "Comercial", "Aluguel"
  add column if not exists categoria_tarifaria       text,
  add column if not exists categoria_risco           text,
  add column if not exists nr_portas                 int,
  add column if not exists nr_eixos                  int,
  add column if not exists carroceria                text,
  add column if not exists tipo_semireboque          text,
  add column if not exists chassi_remarcado          text,  -- Sim/Não
  add column if not exists isento_fiscal             text,
  add column if not exists tipo_isencao              text,
  add column if not exists pcd                       text,  -- Pessoa com Deficiência
  add column if not exists cambio_automatico         text,
  add column if not exists pernoite_garagem          text,  -- Sim/Não
  add column if not exists ano_fabricacao            text,
  add column if not exists data_saida_concessionaria date,
  add column if not exists nota_fiscal               text,
  add column if not exists tabela_referencia         text,
  add column if not exists tabela_substituta         text,
  add column if not exists fator_ajuste              numeric(8,4),
  add column if not exists modalidade               text,
  -- ── Acessórios e dispositivos ─────────────────────────────────
  add column if not exists dispositivo_antifurto    text,
  add column if not exists tipo_instalacao_antif    text,
  add column if not exists rastreador               text,
  add column if not exists acessorios               text,
  add column if not exists valor_acessorios         numeric(14,2),
  -- ── Condutor: campos completos ────────────────────────────────
  add column if not exists condutor_data_nasc       date,
  add column if not exists condutor_idade           int,
  add column if not exists condutor_sexo            text,
  add column if not exists condutor_vinculo         text,
  add column if not exists tipo_residencia          text,
  add column if not exists residentes_18_24         text,  -- Sim/Não
  add column if not exists sexo_residentes         text,
  -- ── Risco: campos extras ──────────────────────────────────────
  add column if not exists cep_circulacao           text,
  add column if not exists garagem_trabalho         text,
  add column if not exists garagem_escola           text,
  add column if not exists km_anual                 int,
  -- ── Histórico do seguro anterior ──────────────────────────────
  add column if not exists seguradora_anterior      text,
  add column if not exists apolice_anterior         text,
  add column if not exists item_anterior            text,
  add column if not exists fim_vigencia_anterior    date,
  add column if not exists cpf_apolice_anterior     text,
  add column if not exists sinistro_ult_vigencia    text,
  add column if not exists tipo_seguro_anterior     text,
  add column if not exists bonus_unico              text,
  add column if not exists renovacao_seguradora     text,
  -- ── Estrutura financeira detalhada ────────────────────────────
  add column if not exists encargos                 numeric(14,2),
  add column if not exists descontos                numeric(14,2),
  add column if not exists bonificacao              numeric(14,2),
  add column if not exists subtotal                 numeric(14,2),
  add column if not exists premio_residencial       numeric(14,2),  -- Bradesco
  add column if not exists premio_acessorios        numeric(14,2),
  add column if not exists premio_blindagem         numeric(14,2),
  add column if not exists premio_kit_gas           numeric(14,2),
  -- ── Coberturas / serviços / cláusulas (jsonb extras) ──────────
  add column if not exists clausulas                jsonb,            -- Lista de cláusulas com código + descrição
  add column if not exists assistencias             jsonb,            -- Serviços de assistência 24h
  add column if not exists coberturas_adicionais    jsonb,            -- Coberturas opcionais contratadas
  add column if not exists descontos_aplicados      jsonb,            -- Lista de descontos aplicados
  -- ── Dados bancários (cartão / débito) ─────────────────────────
  add column if not exists banco_pagto              text,
  add column if not exists agencia_pagto            text,
  add column if not exists conta_pagto              text,
  add column if not exists cpf_titular_pagto        text,
  add column if not exists bandeira_cartao          text,
  add column if not exists validade_cartao          text,
  add column if not exists tid_cartao               text,
  add column if not exists gestor_cartao            text,
  add column if not exists dia_vencimento           int,
  -- ── Corretor: campos extras ───────────────────────────────────
  add column if not exists corretor_endereco        text,
  add column if not exists corretor_bairro          text,
  add column if not exists corretor_cidade          text,
  add column if not exists corretor_uf              text,
  add column if not exists corretor_cep             text,
  add column if not exists corretor_inspetoria      text,
  add column if not exists corretor_filial          text,
  add column if not exists corretor_codigo          text,
  add column if not exists corretor_participacao    numeric(8,4),
  add column if not exists corretor_lider           text,
  add column if not exists corretor_susep_oficial   text,
  -- ── Sucursal/inspetoria/seguradora ────────────────────────────
  add column if not exists sucursal_codigo          text,
  add column if not exists sucursal_nome            text,
  add column if not exists ramo_descricao           text,
  -- ── Operação ──────────────────────────────────────────────────
  add column if not exists tipo_operacao            text,  -- "Emissão", "Renovação", "Endosso"
  add column if not exists congenere                text,
  add column if not exists status_operacao          text,
  -- ── Nome social, dados de contato extras (Allianz/Justos/Pier) ─
  add column if not exists nome_social              text;

comment on column public.seg_stage_apolices.proprietario_nome is
  'Nome do proprietário do veículo quando diferente do segurado (comum em apólices em nome de empresa, dependentes, etc.). Usado por Bradesco, Mapfre, HDI.';
comment on column public.seg_stage_apolices.clausulas is
  'Array de cláusulas contratadas (Bradesco, Zurich, Mapfre). Cada item: {codigo, descricao}.';
comment on column public.seg_stage_apolices.assistencias is
  'Array de serviços de assistência 24h listados na apólice (Allianz, Mapfre, Justos, Porto, Tokio, etc.). Cada item: {nome, descricao, limite}.';
comment on column public.seg_stage_apolices.coberturas_adicionais is
  'Coberturas opcionais (Vidros, Carro Reserva, Pequenos Reparos, Blindagem, etc.) com seus prêmios e franquias específicas.';
