-- ─────────────────────────────────────────────────────────────
-- 026_porto_extras.sql
-- Colunas extras em apolices/clientes pra preservar tudo que o
-- Porto Seguro envia nos arquivos de retorno:
--   - apolices.dados_porto jsonb (linha bruta + campos extraídos)
--   - apolices.nome_segurado, cpf_cnpj_segurado, comissao_pct
--     (se ainda não existirem em alguma combinação)
--   - clientes.dados_porto jsonb pra guardar info adicional
-- ─────────────────────────────────────────────────────────────

alter table public.apolices
  add column if not exists nome_segurado    text,
  add column if not exists cpf_cnpj_segurado text,
  add column if not exists dados_porto      jsonb,
  add column if not exists modelo           text,
  add column if not exists ano_modelo       text,
  add column if not exists ano_fabricacao   text,
  add column if not exists chassi           text,
  add column if not exists endosso          text,
  add column if not exists tipo_movimento   text,
  add column if not exists valor_iof        numeric(12,2),
  add column if not exists fonte            text;

create index if not exists idx_apolices_cpf_cnpj_segurado on public.apolices(cpf_cnpj_segurado);
create index if not exists idx_apolices_placa_porto      on public.apolices(placa) where placa is not null;

alter table public.clientes
  add column if not exists dados_porto jsonb;

-- Quando o Porto envia um cliente novo, marcamos fonte = "Porto Seguro"
-- (a coluna fonte já existe em clientes desde 001).
