-- Migration 057: performance da pagina /dashboard/clientes com 35+ users
-- Indexes para os filtros/busca usados na lista

-- Trigram pra ilike rapida em nome/email/telefone/cpf
create extension if not exists pg_trgm;

create index if not exists idx_clientes_nome_trgm
  on public.clientes using gin (nome gin_trgm_ops);
create index if not exists idx_clientes_cpf_trgm
  on public.clientes using gin (cpf_cnpj gin_trgm_ops) where cpf_cnpj is not null;
create index if not exists idx_clientes_email_trgm
  on public.clientes using gin (email gin_trgm_ops) where email is not null;
create index if not exists idx_clientes_telefone_trgm
  on public.clientes using gin (telefone gin_trgm_ops) where telefone is not null;

-- Index pro filtro por vendedor + ordenacao por nome
create index if not exists idx_clientes_vendedor_nome
  on public.clientes (vendedor_id, nome) where vendedor_id is not null;

-- Indexes adicionais em negocios pra dashboard/relatorios/comissoes
create index if not exists idx_negocios_status_data
  on public.negocios (status, data_fechamento desc) where status is not null;
create index if not exists idx_negocios_vendedor_status
  on public.negocios (vendedor_id, status);
create index if not exists idx_negocios_vencimento
  on public.negocios (vencimento) where vencimento is not null;

-- Stats de tabela atualizada (ANALYZE) pro planner usar os indexes novos
analyze public.clientes;
analyze public.negocios;
analyze public.apolices;
