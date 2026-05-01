-- ─────────────────────────────────────────────────────────────
-- 028_cliente_campos_extras.sql
-- Novos campos de cadastro de cliente conforme padrão da corretora.
-- Mantém compatibilidade com os campos existentes (nome, cpf_cnpj,
-- telefone, email, endereço, sexo, estado_civil, nascimento, etc).
-- ─────────────────────────────────────────────────────────────

alter table public.clientes
  -- Datas
  add column if not exists aniversario      text,            -- "DD/MM" comemorativo (diferente de nascimento)
  add column if not exists cliente_desde    date,
  add column if not exists vencimento_cnh   date,

  -- Status / preferências
  add column if not exists ativo            boolean default true,
  add column if not exists receber_email    boolean default true,

  -- Profissional
  add column if not exists profissao        text,
  add column if not exists ramo             text,            -- ramo de atuação profissional
  add column if not exists renda_mensal     numeric(12,2),

  -- Vínculos
  add column if not exists estipulantes     text,            -- nome dos estipulantes (apólices coletivas)
  add column if not exists filial           text,
  add column if not exists parentesco       text,            -- relação com outro cliente (dependente, conjuge...)
  add column if not exists pasta_cliente    text;            -- caminho/url de pasta externa (Drive, OneDrive, etc)

create index if not exists idx_clientes_ativo on public.clientes(ativo) where ativo = true;
create index if not exists idx_clientes_venc_cnh on public.clientes(vencimento_cnh) where vencimento_cnh is not null;
create index if not exists idx_clientes_cliente_desde on public.clientes(cliente_desde);
