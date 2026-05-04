-- ─────────────────────────────────────────────────────────────
-- 072_seg_stage_apolices_universal_pdf.sql
-- Adiciona colunas universais usadas pelos parsers de PDF de TODAS as
-- seguradoras (Tokio, Allianz, Bradesco, HDI, Justos, Mapfre, Novo, Pier,
-- Suhai, Kovr, Yelum, Youse, Zurich, Porto/Azul e Darwin), além de manter
-- compatibilidade com o parser Ezze já existente (migration 070).
--
-- Os parsers já populam `dados jsonb` com a linha bruta — então qualquer
-- campo que não vire coluna explícita ainda fica acessível via SQL/JSON.
-- ─────────────────────────────────────────────────────────────

alter table public.seg_stage_apolices
  -- Identificação de origem: id curto (ex. 'tokio', 'allianz') do parser
  -- que produziu a linha. Útil quando o usuário cadastrou várias seguradoras
  -- e queremos rastrear de qual parser veio cada linha.
  add column if not exists seguradora_origem text,
  -- Processo SUSEP: identificador regulatório do produto (formato XXXXX.XXXXXX/AAAA-XX).
  add column if not exists processo_susep    text,
  -- CEP de pernoite — quase todos os parsers extraem; útil para cotações.
  add column if not exists cep_pernoite      text,
  -- Características adicionais do veículo
  add column if not exists combustivel       text,
  add column if not exists kit_gas           text,
  add column if not exists cor               text,
  add column if not exists renavam           text,
  -- Dados pessoais (Bradesco, Mapfre, Suhai, Zurich, Yelum)
  add column if not exists data_nascimento   date,
  add column if not exists sexo              text,
  -- Pagamento
  add column if not exists cartao_mascarado  text,
  add column if not exists titular_cartao    text,
  add column if not exists qtd_parcelas      int,
  add column if not exists valor_parcela     numeric(14,2),
  add column if not exists juros             numeric(14,2),
  add column if not exists taxas             numeric(14,2),
  add column if not exists periodicidade     text,
  -- Vigência mensal/24m (Youse, Novo Mensal)
  add column if not exists vigencia_meses    int,
  add column if not exists premio_liquido_mensal numeric(14,2),
  add column if not exists premio_total_mensal   numeric(14,2),
  add column if not exists iof_mensal            numeric(14,2),
  add column if not exists proximo_vencimento    date,
  -- Sub-prêmios por seção (Bradesco, Zurich)
  add column if not exists premio_auto       numeric(14,2),
  add column if not exists premio_rcf        numeric(14,2),
  add column if not exists premio_app        numeric(14,2),
  add column if not exists premio_rcv        numeric(14,2),
  add column if not exists taxa_juros        numeric(14,2),
  -- Endereço estendido
  add column if not exists segurado_bairro   text,
  -- Item / endosso composto (Bradesco)
  add column if not exists item              text,
  -- Ramo descritivo (vs ramo_codigo numérico já existente)
  add column if not exists ramo              text,
  -- Garagem (Pier)
  add column if not exists garagem           text,
  -- Custeio (Pier)
  add column if not exists custeio           text,
  -- Identificadores extras de cadastro do corretor
  add column if not exists corretor_cpd          text,
  add column if not exists corretor_cod_interno  text,
  -- Protocolo eletrônico (Suhai, Youse)
  add column if not exists protocolo         text,
  -- Nº de contrato (Yelum)
  add column if not exists contrato          text;

comment on column public.seg_stage_apolices.seguradora_origem is
  'ID curto da seguradora detectada pelo parser (tokio, allianz, bradesco, hdi, etc.). Permite distinguir registros quando a mesma seguradora cadastrada agrega múltiplos parsers (por exemplo Porto + Azul mesmo grupo).';
comment on column public.seg_stage_apolices.processo_susep is
  'Nº de processo SUSEP do produto (formato XXXXX.XXXXXX/AAAA-XX). Identifica regulatoriamente qual o produto contratado.';
comment on column public.seg_stage_apolices.vigencia_meses is
  'Duração da vigência em meses. 12 (anual padrão), 24 (Youse) ou 1 (Novo Seguros mensal).';
comment on column public.seg_stage_apolices.premio_liquido_mensal is
  'Apenas Youse / planos com cobrança mensal: valor mensal do prêmio líquido. O `premio_total` continua sendo o total da vigência.';
