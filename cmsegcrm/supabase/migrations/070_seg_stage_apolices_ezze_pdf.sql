-- ─────────────────────────────────────────────────────────────
-- 070_seg_stage_apolices_ezze_pdf.sql
-- Adiciona colunas dedicadas em seg_stage_apolices para todos os campos
-- extraídos do PDF da Ezze (Auto Individual e RC Transporte).
-- Os campos das seções "Canais de Atendimento", "Informações Importantes",
-- "Disposições Gerais", "Emissão da Apólice" e rodapé NÃO são capturados —
-- são informativos e não fazem parte do contrato.
-- ─────────────────────────────────────────────────────────────

alter table public.seg_stage_apolices
  -- Cabeçalho da apólice
  add column if not exists endosso              text,
  add column if not exists proposta             text,
  add column if not exists versao               text,
  add column if not exists rule_id              text,
  add column if not exists codigo_ci            text,
  add column if not exists tipo_seguro          text,
  add column if not exists classe_bonus         int,
  add column if not exists data_emissao         date,
  add column if not exists tipo_apolice         text,
  -- Segurado (extras além de cliente_nome/cpf_cnpj que já existem)
  add column if not exists segurado_nome_social text,
  add column if not exists segurado_email       text,
  add column if not exists segurado_telefone    text,
  add column if not exists segurado_cep         text,
  add column if not exists segurado_cidade      text,
  add column if not exists segurado_uf          text,
  add column if not exists segurado_estado_civil text,
  add column if not exists segurado_endereco    text,
  -- Corretor
  add column if not exists corretor_nome        text,
  add column if not exists corretor_cnpj        text,
  add column if not exists corretor_susep       text,
  add column if not exists corretor_email       text,
  add column if not exists corretor_telefone    text,
  add column if not exists filial_ezze          text,
  -- Questionário de Avaliação de Risco (Auto)
  add column if not exists utilizacao_veiculo   text,
  add column if not exists principal_condutor   text,
  add column if not exists condutor_nome        text,
  add column if not exists condutor_cpf         text,
  add column if not exists condutor_estado_civil text,
  add column if not exists condutor_cobertura_jovem text, -- "Sim"/"Não" — faixa 18–24
  -- Dados do Veículo (extras além de placa que já existe)
  add column if not exists marca                text,
  add column if not exists modelo               text,
  add column if not exists ano_modelo           text,
  add column if not exists cod_fipe             text,
  add column if not exists chassi               text,
  add column if not exists zero_km              text,         -- "Sim"/"Não"
  add column if not exists blindagem            text,
  add column if not exists tipo_franquia_casco  text,
  add column if not exists vistoria_previa      text,
  add column if not exists rastreador_obrigatorio text,
  add column if not exists nr_passageiros       int,
  add column if not exists tipo_veiculo         text,
  -- Prêmio
  add column if not exists premio_liquido       numeric(14,2),
  add column if not exists adicional_fracionamento numeric(14,2),
  add column if not exists custo_apolice        numeric(14,2),
  add column if not exists iof                  numeric(14,2),
  add column if not exists premio_total         numeric(14,2),
  -- Pagamento
  add column if not exists forma_pagamento      text,
  add column if not exists parcelas             jsonb,        -- [{numero, valor, juros, adicional_pct, iof, vencimento}]
  -- Tabelas detalhadas
  add column if not exists coberturas           jsonb,        -- [{nome, valor_is, premio}]
  add column if not exists servicos             jsonb,        -- {assistencia_24h, danos_vidros, carro_reserva, pequenos_reparos}
  add column if not exists franquias            jsonb,        -- {compreensiva, danos_corporais, danos_materiais, vidros: [...]}
  -- RC Transporte (campos extras)
  add column if not exists ramo_codigo          text,
  add column if not exists sucursal             text,
  add column if not exists faturamento          text,
  add column if not exists item_veiculo         int,
  -- Debug
  add column if not exists layout_pdf           text,
  add column if not exists pdf_texto_bruto      text;

comment on column public.seg_stage_apolices.parcelas is 'Array de parcelas do plano de pagamento (Ezze PDF). Cada item: {numero, valor, juros, adicional_pct, iof, vencimento}.';
comment on column public.seg_stage_apolices.coberturas is 'Array de coberturas contratadas (Ezze PDF). Cada item: {nome, valor_is, premio}.';
comment on column public.seg_stage_apolices.franquias is 'Estrutura de franquias por cobertura (Ezze PDF Auto).';
comment on column public.seg_stage_apolices.servicos is 'Estrutura de serviços contratados (Ezze PDF Auto).';
comment on column public.seg_stage_apolices.pdf_texto_bruto is 'Texto bruto extraído do PDF (truncado em 6KB) — útil para debug quando alguma extração falhar.';
