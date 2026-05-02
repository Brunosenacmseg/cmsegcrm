-- ─────────────────────────────────────────────────────────────
-- 034_seed_campos_personalizados_cards.sql
-- Seed dos campos personalizados padrão dos cards (negocios)
-- Idempotente via ON CONFLICT (entidade, chave)
-- ─────────────────────────────────────────────────────────────

insert into public.campos_personalizados (entidade, nome, chave, tipo, opcoes, ordem) values
  ('negocio', 'Data de nascimento',              'data_nascimento',             'data',     null, 10),
  ('negocio', 'Seguradora',                      'seguradora',                  'texto',    null, 20),
  ('negocio', 'Vigência do seguro',              'vigencia_seguro',             'data',     null, 30),
  ('negocio', 'E-mail',                          'email',                       'texto',    null, 40),
  ('negocio', 'Comissão',                        'comissao',                    'numero',   null, 50),
  ('negocio', 'Particular?',                     'particular',                  'boolean',  null, 60),
  ('negocio', 'Rastreador',                      'rastreador',                  'boolean',  null, 70),
  ('negocio', 'CPF',                             'cpf',                         'texto',    null, 80),
  ('negocio', 'Placa',                           'placa',                       'texto',    null, 90),
  ('negocio', 'Modelo do veículo',               'modelo_veiculo',              'texto',    null, 100),
  ('negocio', 'CPF 2',                           'cpf_2',                       'texto',    null, 110),
  ('negocio', 'CEP',                             'cep',                         'texto',    null, 120),
  ('negocio', 'Tipo do seguro',                  'tipo_seguro',                 'select',   array['Auto','Vida','Residencial','Empresarial','Viagem','Outros'], 130),
  ('negocio', 'Operadora',                       'operadora',                   'texto',    null, 140),
  ('negocio', 'Tipo de CNPJ',                    'tipo_cnpj',                   'texto',    null, 150),
  ('negocio', 'Funcionário CLT',                 'funcionario_clt',             'boolean',  null, 160),
  ('negocio', 'Profissão',                       'profissao',                   'texto',    null, 170),
  ('negocio', 'Possui plano',                    'possui_plano',                'boolean',  null, 180),
  ('negocio', 'Plano atual',                     'plano_atual',                 'texto',    null, 190),
  ('negocio', 'Motivo troca de plano',           'motivo_troca_plano',          'textarea', null, 200),
  ('negocio', 'Cidade',                          'cidade',                      'texto',    null, 210),
  ('negocio', 'Mensalidade atual',               'mensalidade_atual',           'numero',   null, 220),
  ('negocio', 'Idade dos beneficiários',         'idade_beneficiarios',         'texto',    null, 230),
  ('negocio', 'Possui hospital de preferência',  'possui_hospital_preferencia', 'boolean',  null, 240),
  ('negocio', 'Qual hospital',                   'qual_hospital',               'texto',    null, 250)
on conflict (entidade, chave) do update set
  nome   = excluded.nome,
  tipo   = excluded.tipo,
  opcoes = excluded.opcoes,
  ordem  = excluded.ordem,
  ativo  = true;
