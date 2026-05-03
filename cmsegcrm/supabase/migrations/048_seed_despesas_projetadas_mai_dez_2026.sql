-- ═══════════════════════════════════════════════════════════════════
-- 048 — Seed de DESPESAS PROJETADAS (Maio a Dezembro/2026)
--
-- Replica a projeção mensal de gastos fornecida pela operação para os
-- meses de 05/2026 até 12/2026. Cada lançamento entra com:
--   • data_vencimento  = dia 10 do mês de competência
--   • data             = mesmo valor (compat com view antiga)
--   • data_pgto        = NULL  (marca como PROJETADO)
--   • competencia      = 'YYYY-MM'
--   • obs              = 'SEED_PROJ_MAI_DEZ_2026' (idempotência)
--
-- Reexecução é segura: o INSERT só ocorre se ainda não houver linha
-- com a mesma (descricao, competencia, valor, obs).
-- ═══════════════════════════════════════════════════════════════════

-- Garante categoria 2.7.01 (não estava no seed 030)
insert into public.financeiro_categorias (codigo, nome, tipo, ordem) values
  ('2.7.01','EMPRESA DE MARKETING - (36.347.807 MICHELLE RODRIGUES DE MORAIS - ME)','despesa',0)
on conflict (codigo) do update set nome = excluded.nome, ativo = true;

with templates(seq, codigo, descricao, valor, tipo, forma, fornecedor) as (
  values
    ( 1, '4.2.04', 'PAGAMENTO VIVIANE E FERNANDO (VIVIANE PEIXOTO ROCHA LTDA)',                                  45000.00, 'FIXA',     'PIX', 'VIVIANE PEIXOTO ROCHA LTDA'),
    ( 2, '2.1.01', 'PAGAMENTO AMANDA SGARBI (63.927.957 AMANDA ROBERTA SGARBI - ME)',                             5000.00, 'FIXA',     'PIX', 'AMANDA ROBERTA SGARBI - ME'),
    ( 3, '2.1.02', 'PAGAMENTO BRUNO BONS OLHOS (65.220.422 BRUNO HENRIQUE RODRIGUES BONS OLHOS)',                 5000.00, 'FIXA',     'PIX', 'BRUNO HENRIQUE RODRIGUES BONS OLHOS'),
    ( 4, '2.1.03', 'PAGAMENTO ERICKSON (41.852.803 ERICKSON FERNANDO TURQUETTO - ME)',                            5000.00, 'FIXA',     'PIX', 'ERICKSON FERNANDO TURQUETTO - ME'),
    ( 5, '2.1.04', 'PAGAMENTO GUSTAVO ARAUJO (65.220.507 GUSTAVO PEREIRA ARAUJO)',                                5000.00, 'FIXA',     'PIX', 'GUSTAVO PEREIRA ARAUJO'),
    ( 6, '2.1.05', 'PAGAMENTO GUSTAVO PILOTO (G2P NEGOCIOS DIGITAIS LTDA - ME)',                                  8000.00, 'FIXA',     'PIX', 'G2P NEGOCIOS DIGITAIS LTDA - ME'),
    ( 7, '2.1.06', 'PAGAMENTO LILIAN CRUZ (58.449.882 LILIAN MORAIS DA CRUZ - ME)',                               5000.00, 'FIXA',     'PIX', 'LILIAN MORAIS DA CRUZ - ME'),
    ( 8, '2.1.07', 'PAGAMENTO MARY ELLEN (63.107.730 MARY ELLEN ROSA)',                                           8000.00, 'FIXA',     'PIX', 'MARY ELLEN ROSA'),
    ( 9, '2.1.08', 'PAGAMENTO FELIPE SOUSA (57.322.293 FELIPE QUEIROZ DE SOUSA)',                                 6500.00, 'FIXA',     'PIX', 'FELIPE QUEIROZ DE SOUSA'),
    (10, '2.1.09', 'PAGAMENTO MARIA LUISA (60.262.373 MARIA LUISA DURAES NEVES)',                                 3500.00, 'FIXA',     'PIX', 'MARIA LUISA DURAES NEVES'),
    (11, '2.1.10', 'PAGAMENTO DIEGO ASSIS (64.789.141 NATALIE DUARTE PEREIRA)',                                   4600.00, 'FIXA',     'PIX', 'NATALIE DUARTE PEREIRA'),
    (12, '2.1.11', 'PAGAMENTO ROSANGELA DOMINGUEZ (ROSANGELA CUTIER DOMINGUES 69207550172)',                      3600.00, 'FIXA',     'PIX', 'ROSANGELA CUTIER DOMINGUES'),
    (13, '2.1.12', 'PAGAMENTO BERNARDO FERREIRA (64.466.400 BERNARDO FERREIRA SILVA CABRAL)',                     4000.00, 'FIXA',     'PIX', 'BERNARDO FERREIRA SILVA CABRAL'),
    (14, '2.1.13', 'PAGAMENTO RAPHAEL VELOSO (64.408.239 RAPHAEL VELOSO DE GUSMAO SILVA)',                        3600.00, 'FIXA',     'PIX', 'RAPHAEL VELOSO DE GUSMAO SILVA'),
    (15, '2.1.14', 'PAGAMENTO GIOVANA SILVÉRIO (58.371.726 GIOVANA SILVERIO PALMEIRA SANTOS)',                    4000.00, 'FIXA',     'PIX', 'GIOVANA SILVERIO PALMEIRA SANTOS'),
    (16, '2.2.01', 'PAGAMENTO GIOVANNA PICASSO',                                                                 20000.00, 'FIXA',     'PIX', 'GIOVANNA PICASSO'),
    (17, '2.2.02', 'PAGAMENTO GRÉGORI SCHILLING',                                                                 8000.00, 'FIXA',     'PIX', 'GRÉGORI SCHILLING'),
    (18, '2.1.15', 'PAGAMENTO HIGOR',                                                                             2000.00, 'FIXA',     'PIX', 'HIGOR'),
    (19, '4.0.01', 'PAGAMENTO ALICE SAMPAIO',                                                                     6200.00, 'FIXA',     'PIX', 'ALICE SAMPAIO'),
    (20, '4.0.02', 'PAGAMENTO GABRIEL SILVERIO',                                                                 20000.00, 'FIXA',     'PIX', 'GABRIEL SILVERIO'),
    (21, '4.0.03', 'PAGAMENTO GEAN FERREIRA (GF SERVIÇOS COMERCIAIS)',                                            8000.00, 'FIXA',     'PIX', 'GF SERVIÇOS COMERCIAIS'),
    (22, '4.0.04', 'PAGAMENTO WILLIAM BONIFÁCIO (WILLIAM MARCELINO BONIFACIO LTDA)',                             15000.00, 'FIXA',     'PIX', 'WILLIAM MARCELINO BONIFACIO LTDA'),
    (23, '2.3.01', 'PAGAMENTO ADRIELLI OLIVEIRA',                                                                 2100.00, 'FIXA',     'PIX', 'ADRIELLI OLIVEIRA'),
    (24, '2.3.02', 'PAGAMENTO GUILHERME FRANCA',                                                                  1900.00, 'FIXA',     'PIX', 'GUILHERME FRANCA'),
    (25, '2.3.03', 'PAGAMENTO KAREN MARIANO',                                                                     4400.00, 'FIXA',     'PIX', 'KAREN MARIANO'),
    (26, '2.3.04', 'PAGAMENTO LARISSA ARAUJO',                                                                    1900.00, 'FIXA',     'PIX', 'LARISSA ARAUJO'),
    (27, '2.3.05', 'PAGAMENTO NATASHA BORTOLOTTO',                                                                2100.00, 'FIXA',     'PIX', 'NATASHA BORTOLOTTO'),
    (28, '2.3.06', 'PAGAMENTO THAINA NEVES',                                                                      3500.00, 'FIXA',     'PIX', 'THAINA NEVES'),
    (29, '2.3.08', 'PAGAMENTO LIVIA FERNANDA SANTOS',                                                             1900.00, 'FIXA',     'PIX', 'LIVIA FERNANDA SANTOS'),
    (30, '2.3.07', 'PAGAMENTO HELOÍSA SENA',                                                                      4700.00, 'FIXA',     'PIX', 'HELOÍSA SENA'),
    (31, '4.1.01', 'PAGAMENTO BRUNO E BIA',                                                                      60000.00, 'FIXA',     'PIX', 'BRUNO E BIA'),
    (32, NULL,     'BONUS TREINAMENTO',                                                                            300.00, 'VARIÁVEL', 'PIX', NULL),
    (33, '4.0.01', 'FERIAS ALICE BONACCORSI DE SENA SAMPAIO',                                                     2836.06, 'VARIÁVEL', 'PIX', 'ALICE BONACCORSI DE SENA SAMPAIO'),
    (34, '2.4.02', 'SEGURO DE VIDA EMPRESARIAL (ALLIANZ)',                                                         180.82, 'FIXA',     'BOLETO', 'ALLIANZ'),
    (35, '2.4.01', 'CONTROLE DE PONTO - (VR BENEFICIOS SERVI PROC S/A)',                                           199.00, 'FIXA',     'BOLETO', 'VR BENEFICIOS SERVI PROC S/A'),
    (36, '2.4.04', 'VT ADRIELLI - (RAPIDO LUXO CAMPINAS LTDA)',                                                    313.64, 'FIXA',     'BOLETO', 'RAPIDO LUXO CAMPINAS LTDA'),
    (37, '2.4.03', 'VR E VT EMPRESARIAL - CAJU',                                                                 11000.00, 'FIXA',     'BOLETO', 'EMPRESA BRASILEIRA DE BENEFICIOS E PAGAMENTOS - CAJU'),
    (38, '2.4.03', 'VR E VT EMPRESARIAL - CAJU (taxa)',                                                             857.34, 'FIXA',     'BOLETO', 'EMPRESA BRASILEIRA DE BENEFICIOS E PAGAMENTOS - CAJU'),
    (39, '5.4',    'EMPRESTIMO PORTO SEGURO 2',                                                                  15500.00, 'FIXA',     'BOLETO', 'PORTO SEGURO'),
    (40, '4.1.02', 'PLANO DE SAÚDE EMPRESARIAL - (PORTO SEGURO - SEGURO SAUDE S/A)',                              4791.89, 'FIXA',     'BOLETO', 'PORTO SEGURO - SEGURO SAUDE S/A'),
    (41, '4.2.02', 'CONTABILIDADE - (CONTART - ESCRITORIO DE CONTABILIDADE S/S LTDA - ME)',                       1050.00, 'FIXA',     'BOLETO', 'CONTART'),
    (42, '4.3.20', 'CONDOMÍNIO UNIDADE SP - (J SALLUM IMOVEIS SS LTDA)',                                          1294.70, 'FIXA',     'BOLETO', 'J SALLUM IMOVEIS SS LTDA'),
    (43, '4.3.21', 'ENERGIA UNIDADE SP (ENEL)',                                                                    192.34, 'FIXA',     'BOLETO', 'ENEL'),
    (44, '4.3.01', 'ALUGUEL MATRIZ - FALABELLAS IMOBILIARIA',                                                     6600.00, 'FIXA',     'BOLETO', 'FALABELLAS IMOBILIARIA'),
    (45, '4.3.11', 'FAXINA MATRIZ - (MARY HELP JUNDIAI ELOY CHAVES) — semana 1',                                   178.20, 'FIXA',     'BOLETO', 'MARY HELP JUNDIAI ELOY CHAVES'),
    (46, '2.5.03', 'SEGURANÇA E MEDICINA DO TRABALHO - (PROT LIFE CONSULTORIA DE SEGURANCA LTDA)',                 140.00, 'FIXA',     'BOLETO', 'PROT LIFE CONSULTORIA DE SEGURANCA LTDA'),
    (47, '4.3.11', 'FAXINA MATRIZ - (MARY HELP JUNDIAI ELOY CHAVES) — semana 2',                                   178.20, 'FIXA',     'BOLETO', 'MARY HELP JUNDIAI ELOY CHAVES'),
    (48, '4.3.12', 'FAXINA FILIAL - (65.064.515 ROSANGELA MARIA DA SILVA)',                                        480.00, 'FIXA',     'PIX', 'ROSANGELA MARIA DA SILVA'),
    (49, '2.5.09', 'SEGURO PREDIAL - UNIDADE SP - ALLIANZ SEGUROS',                                                 77.79, 'FIXA',     'BOLETO', 'ALLIANZ SEGUROS'),
    (50, '4.2.03', 'CONTROLADORIA - (ED POLI CONSULTORIA E ASSESSORIA EMPRESARIAL LTDA)',                         1500.00, 'FIXA',     'BOLETO', 'ED POLI CONSULTORIA E ASSESSORIA EMPRESARIAL LTDA'),
    (51, '4.3.11', 'FAXINA MATRIZ - (MARY HELP JUNDIAI ELOY CHAVES) — semana 3',                                   178.20, 'FIXA',     'BOLETO', 'MARY HELP JUNDIAI ELOY CHAVES'),
    (52, '2.5.05', 'AQUISIÇÃO DE EQUIPAMENTOS - UNIDADE SP - C PORTO',                                            4285.60, 'VARIÁVEL', 'CARTÃO DE CRÉDITO', 'C PORTO'),
    (53, '2.5.10', 'TÍTULO DE CAPITALIZAÇÃO - UNIDADE SP - C PORTO',                                              1317.73, 'FIXA',     'CARTÃO DE CRÉDITO', 'C PORTO'),
    (54, '2.5.07', 'COMPRA DE CAFÉ - MATRIZ - C PORTO',                                                            236.97, 'VARIÁVEL', 'CARTÃO DE CRÉDITO', 'C PORTO'),
    (55, '2.5.05', 'AQUISIÇÃO DE EQUIPAMENTOS - UNIDADE SP - C PORTO (item 2)',                                    249.90, 'VARIÁVEL', 'CARTÃO DE CRÉDITO', 'C PORTO'),
    (56, '2.5.06', 'COMPRA DE CAFÉ - UNID SP - C PORTO',                                                           207.66, 'VARIÁVEL', 'CARTÃO DE CRÉDITO', 'C PORTO'),
    (57, '2.6.04', 'SISTEMA DE CRM - RD STATION CRM - C PORTO',                                                   2859.17, 'FIXA',     'CARTÃO DE CRÉDITO', 'RD STATION'),
    (58, '2.6.05', 'SISTEMA DE WHATSAPP - RD STATION CONVERSAS - C ITAÚ',                                         4369.00, 'FIXA',     'CARTÃO DE CRÉDITO', 'RD STATION'),
    (59, '2.5.05', 'AQUISIÇÃO DE EQUIPAMENTOS - MATRIZ - C PORTO (item 1)',                                       1814.99, 'VARIÁVEL', 'CARTÃO DE CRÉDITO', 'C PORTO'),
    (60, '2.5.05', 'AQUISIÇÃO DE EQUIPAMENTOS - MATRIZ - C PORTO (item 2)',                                         26.99, 'VARIÁVEL', 'CARTÃO DE CRÉDITO', 'C PORTO'),
    (61, '2.5.05', 'AQUISIÇÃO DE EQUIPAMENTOS - MATRIZ - C PORTO (item 3)',                                        168.97, 'VARIÁVEL', 'CARTÃO DE CRÉDITO', 'C PORTO'),
    (62, '2.5.05', 'AQUISIÇÃO DE EQUIPAMENTOS - MATRIZ - C PORTO (item 4)',                                       1049.99, 'VARIÁVEL', 'CARTÃO DE CRÉDITO', 'C PORTO'),
    (63, '2.7.04', 'TRÁFEGO PAGO - (FACEBOOK SERVICOS ONLINE DO BR)',                                            15000.00, 'VARIÁVEL', 'CARTÃO DE CRÉDITO', 'FACEBOOK'),
    (64, '4.3.10', 'ENERGIA MATRIZ - FALABELLAS IMOBILIARIA',                                                      554.00, 'FIXA',     'BOLETO', 'FALABELLAS IMOBILIARIA'),
    (65, '2.6.02', 'ERP E MULTICÁLCULO - (AGGER INFORMÁTICA LTDA)',                                               2194.49, 'FIXA',     'BOLETO', 'AGGER INFORMÁTICA LTDA'),
    (66, '2.6.06', 'SISTEMA DE WHATSAPP - BOTCONVERSA - C ITAU',                                                    89.93, 'FIXA',     'CARTÃO DE CRÉDITO', 'BOTCONVERSA'),
    (67, '2.5.04', 'AQUISIÇÃO DE EQUIPAMENTOS - MATRIZ - C ITAU (item 1)',                                         541.74, 'VARIÁVEL', 'CARTÃO DE CRÉDITO', 'C ITAU'),
    (68, '2.5.04', 'AQUISIÇÃO DE EQUIPAMENTOS - MATRIZ - C ITAU (item 2)',                                         620.88, 'VARIÁVEL', 'CARTÃO DE CRÉDITO', 'C ITAU'),
    (69, '4.3.22', 'IPTU UNIDADE SP',                                                                              552.95, 'FIXA',     'BOLETO', 'PREFEITURA SP'),
    (70, '4.3.11', 'FAXINA MATRIZ - (MARY HELP JUNDIAI ELOY CHAVES) — semana 4',                                   178.20, 'FIXA',     'BOLETO', 'MARY HELP JUNDIAI ELOY CHAVES'),
    (71, '4.3.02', 'ASSINATURA ELETRÔNICA - (AUTENTIQUE LTDA)',                                                     99.00, 'FIXA',     'CARTÃO DE CRÉDITO', 'AUTENTIQUE LTDA'),
    (72, '4.3.14', 'SISTEMA DE INTEGRAÇÃO - (IUGU INSTITUIÇÃO DE PAGAMENTOS S/A)',                                 209.00, 'FIXA',     'BOLETO', 'IUGU'),
    (73, '4.3.19', 'ALUGUEL UNIDADE SP - (PAISANO PARTICIP EMPREEND LTDA)',                                       2900.00, 'FIXA',     'BOLETO', 'PAISANO PARTICIP EMPREEND LTDA'),
    (74, '2.5.08', 'ESTADIA SP',                                                                                  3500.00, 'VARIÁVEL', 'PIX', NULL),
    (75, '4.3.15', 'INTERNET MATRIZ - (CLARO S/A)',                                                                299.90, 'FIXA',     'BOLETO', 'CLARO S/A'),
    (76, '4.3.17', 'SISTEMA DE TELEFONIA - (GOTO COMUNICAÇÃO UNIFICADA DO BRASIL)',                              1600.00, 'FIXA',     'BOLETO', 'GOTO'),
    (77, '4.3.18', 'SISTEMA DE TELEFONIA - (VIVO S/A)',                                                          1500.00, 'FIXA',     'BOLETO', 'VIVO S/A'),
    (78, '4.3.16', 'SISTEMA DE TELEFONIA - (CLARO S/A)',                                                            45.22, 'FIXA',     'BOLETO', 'CLARO S/A'),
    (79, '4.3.23', 'INTERNET UNIDADE SP - (VIVO S/A)',                                                              91.12, 'FIXA',     'BOLETO', 'VIVO S/A'),
    (80, '2.6.03', 'ERP E MULTICÁLCULO - (QUIVER DESENVOLVIMENTO E TECNOLOGIA LTDA)',                             1740.51, 'FIXA',     'BOLETO', 'QUIVER DESENVOLVIMENTO E TECNOLOGIA LTDA'),
    (81, NULL,     'JORNADA EXTINTORES',                                                                           120.00, 'VARIÁVEL', 'BOLETO', NULL),
    (82, NULL,     'BOLO WILLIAM',                                                                                  59.79, 'VARIÁVEL', 'PIX', NULL),
    (83, '2.7.02', 'EMPRESA DE MARKETING - (41.170.857 JOAO VICTOR DA COSTA ALVES - ME)',                          950.00, 'FIXA',     'PIX', 'JOAO VICTOR DA COSTA ALVES - ME'),
    (84, '2.7.03', 'EMPRESA DE MARKETING - (LL SERVICOS DE MARKETING DIRETO)',                                    2000.00, 'FIXA',     'PIX', 'LL SERVICOS DE MARKETING DIRETO'),
    (85, NULL,     'TAXA FISCALIZAÇÃO MATRIZ',                                                                     948.35, 'FIXA',     'BOLETO', NULL),
    (86, NULL,     'TAXA FISCALIZAÇÃO FILIAL',                                                                     138.76, 'FIXA',     'BOLETO', NULL),
    (87, NULL,     'MARY REGINA DE SOUZA - 015387058000107 - RH',                                                 1272.00, 'FIXA',     'PIX', 'MARY REGINA DE SOUZA'),
    (88, '2.7.01', 'EMPRESA DE MARKETING - (36.347.807 MICHELLE RODRIGUES DE MORAIS - ME)',                       1200.00, 'FIXA',     'PIX', 'MICHELLE RODRIGUES DE MORAIS - ME'),
    (89, '4.3.13', 'SISTEMA DE EMAIL/SITE - ON CORRETOR',                                                          154.12, 'FIXA',     'BOLETO', 'ON CORRETOR'),
    (90, '2.0.06', 'GUIA DE FGTS',                                                                                5758.90, 'FIXA',     'BOLETO', 'RECEITA FEDERAL'),
    (91, '2.0.01', 'GUIA DE TRIBUTOS FEDERAIS',                                                                  22297.97, 'FIXA',     'BOLETO', 'RECEITA FEDERAL'),
    (92, '2.0.02', 'GUIA PIS',                                                                                    2149.30, 'FIXA',     'BOLETO', 'RECEITA FEDERAL'),
    (93, '2.0.03', 'GUIA ISS',                                                                                    7668.79, 'FIXA',     'BOLETO', 'PREFEITURA'),
    (94, '2.0.04', 'GUIA COFINS',                                                                                 9919.85, 'FIXA',     'BOLETO', 'RECEITA FEDERAL'),
    (95, '2.0.05', 'IMPOSTO DESCONTADO DA COMISSÃO',                                                              5594.54, 'FIXA',     'BOLETO', 'RECEITA FEDERAL'),
    (96, '2.0.08', 'IRPJ - LUCRO PRESUMIDO',                                                                     63281.18, 'FIXA',     'BOLETO', 'RECEITA FEDERAL'),
    (97, '2.0.09', 'CSLL - DEMAIS',                                                                              29918.77, 'FIXA',     'BOLETO', 'RECEITA FEDERAL')
),
months(competencia, dt) as (
  values
    ('2026-05', date '2026-05-10'),
    ('2026-06', date '2026-06-10'),
    ('2026-07', date '2026-07-10'),
    ('2026-08', date '2026-08-10'),
    ('2026-09', date '2026-09-10'),
    ('2026-10', date '2026-10-10'),
    ('2026-11', date '2026-11-10'),
    ('2026-12', date '2026-12-10')
),
expanded as (
  select
    t.codigo,
    t.descricao,
    t.valor,
    t.tipo,
    t.forma,
    t.fornecedor,
    m.competencia,
    m.dt
  from templates t
  cross join months m
)
insert into public.financeiro_despesas (
  categoria_id, descricao, valor, data, data_vencimento, data_pgto,
  competencia, tipo_despesa, condicao, forma_pagto, fornecedor, obs
)
select
  c.id,
  e.descricao,
  e.valor,
  e.dt,
  e.dt,
  null::date,
  e.competencia,
  e.tipo,
  'MENSAL',
  e.forma,
  e.fornecedor,
  'SEED_PROJ_MAI_DEZ_2026'
from expanded e
left join public.financeiro_categorias c on c.codigo = e.codigo
where not exists (
  select 1
  from public.financeiro_despesas d
  where d.descricao  = e.descricao
    and d.competencia = e.competencia
    and d.valor       = e.valor
    and d.obs         = 'SEED_PROJ_MAI_DEZ_2026'
);
