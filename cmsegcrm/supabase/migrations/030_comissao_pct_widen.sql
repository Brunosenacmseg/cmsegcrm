-- Alarga comissao_pct (era numeric(5,2) -> max 999.99) pra suportar valores
-- absolutos vindos de imports do RD onde o campo as vezes traz "comissao em R$"
-- ou percentuais > 100. Mantemos compatibilidade total com valores existentes.

alter table public.negocios
  alter column comissao_pct type numeric(8,2);

alter table public.apolices
  alter column comissao_pct type numeric(8,2);
