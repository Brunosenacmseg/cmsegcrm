-- ─────────────────────────────────────────────────────────────
-- 029_negocios_campos_extras.sql
-- Campos extras pra suportar todas as colunas de export do RD
-- Station CRM. O que nao virar coluna estruturada vai pra
-- negocios.custom_fields jsonb (ja existe desde 022).
-- ─────────────────────────────────────────────────────────────

alter table public.negocios
  -- Valores
  add column if not exists valor_unico            numeric(12,2),
  add column if not exists valor_recorrente       numeric(12,2),
  -- Empresa / contato (PJ)
  add column if not exists empresa                text,
  add column if not exists cargo_contato          text,
  -- Marketing / origem
  add column if not exists campanha               text,
  add column if not exists fonte_origem           text,
  -- Datas de contato e atividade
  add column if not exists data_primeiro_contato  timestamptz,
  add column if not exists data_ultimo_contato    timestamptz,
  add column if not exists previsao_fechamento    date,
  add column if not exists data_proxima_tarefa    timestamptz,
  -- Status / fluxo
  add column if not exists pausada                boolean default false,
  add column if not exists anotacao_motivo_perda  text,
  -- Seguros / produto
  add column if not exists seguradora_atual       text,
  add column if not exists vigencia_seguro_ini    date,
  add column if not exists vigencia_seguro_fim    date,
  add column if not exists tipo_seguro            text,
  add column if not exists operadora              text,
  -- Auto / veiculo
  add column if not exists placa_veiculo          text,
  add column if not exists modelo_veiculo         text,
  add column if not exists rastreador             text,
  -- PJ específico
  add column if not exists tipo_cnpj              text,
  add column if not exists funcionario_clt        text,
  -- Saúde / plano
  add column if not exists particular             boolean,
  add column if not exists possui_plano           boolean,
  add column if not exists plano_atual            text,
  add column if not exists motivo_troca_plano     text,
  add column if not exists mensalidade_atual      numeric(12,2),
  add column if not exists idade_beneficiarios    text,
  add column if not exists possui_hospital_pref   boolean,
  add column if not exists qual_hospital          text,
  -- Documentos / endereço duplicado
  add column if not exists cpf_2                  text,
  add column if not exists cep_negocio            text,
  add column if not exists email_negocio          text,
  -- Comissão (numerica direta, alem do comissao_pct existente)
  add column if not exists comissao_valor         numeric(12,2);

create index if not exists idx_negocios_empresa     on public.negocios(empresa)     where empresa is not null;
create index if not exists idx_negocios_placa       on public.negocios(placa_veiculo) where placa_veiculo is not null;
create index if not exists idx_negocios_pausada     on public.negocios(pausada)     where pausada = true;
create index if not exists idx_negocios_data_prox_t on public.negocios(data_proxima_tarefa) where data_proxima_tarefa is not null;

-- custom_fields jsonb ja existe desde 022. Sera usado para qualquer
-- coluna que o usuario suba e nao bata com nenhum campo conhecido.
