// Gerador do layout de exportação HDI (Arquivos de Emissão).
//
// Cada registro é uma linha com os campos delimitados por ";",
// inclusive um delimitador ao final do registro. Os campos são
// truncados ao tamanho especificado pelo layout — não há padding
// porque o delimitador faz a separação.
//
// O nome do arquivo é Cnnnnnnnnn.txt onde nnnnnnnnn é o código
// SUSEP do corretor com 9 posições à esquerda zeradas.

type ApoliceFull = {
  apolice: any
  cliente: any
  itens: any[]
  acessorios: any[]
  coberturas: any[]   // 05 e 06
  motoristas: any[]   // 07 e 08
  locais: any[]
  clausulas: any[]
}

const DEL = ';'

// trunca string para o tamanho máximo, removendo qualquer ; do conteúdo
function s(v: any, max: number): string {
  if (v === null || v === undefined) return ''
  return String(v).replace(/;/g, ',').slice(0, max)
}

// número formatado SEM separadores de milhar, 2 casas decimais.
// Exemplo: 1234.5 -> "1234.50". Truncado para max.
function n(v: any, max: number): string {
  if (v === null || v === undefined || v === '') return ''
  const num = Number(String(v).replace(',', '.'))
  if (!isFinite(num)) return ''
  return num.toFixed(2).slice(0, max)
}

function nint(v: any, max: number): string {
  if (v === null || v === undefined || v === '') return ''
  const num = parseInt(String(v), 10)
  if (!isFinite(num)) return ''
  return String(num).slice(0, max)
}

// Data ISO (YYYY-MM-DD) -> dd/mm/yyyy
function d(v: any): string {
  if (!v) return ''
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const dt = new Date(v)
  if (isNaN(dt.getTime())) return ''
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const yy = String(dt.getFullYear())
  return `${dd}/${mm}/${yy}`
}

function row(...campos: string[]): string {
  return campos.join(DEL) + DEL
}

// Compõe o "Número do Documento" (21 posições) a partir do
// identificador estruturado. Se a apólice possuir um campo
// numero_documento já no formato esperado, usa-o; caso contrário,
// monta a partir de partes conhecidas (com defaults zerados).
function numeroDocumento(a: any): string {
  if (a.numero_documento) return s(a.numero_documento, 21)
  // EE(2) SSS(3) CCC(3) T(1) DDDDDD(6) EEEEEE(6) = 21
  const empresa  = s(a.codigo_estipulante, 2).padStart(2, '0').slice(0, 2)
  const sucursal = s(a.codigo_unidade, 3).padStart(3, '0').slice(0, 3)
  const cart     = s(a.ramo_codigo || '0', 3).padStart(3, '0').slice(0, 3)
  const tipo     = s(a.tipo_endosso || '0', 1).slice(0, 1) || '0'
  const docNum   = s(a.numero || '', 6).padStart(6, '0').slice(-6)
  const endosso  = s(a.endosso || '0', 6).padStart(6, '0').slice(-6)
  return `${empresa}${sucursal}${cart}${tipo}${docNum}${endosso}`
}

// Registro 01 — APÓLICE
function r01(a: any, numDoc: string): string {
  return row(
    '01',
    s(numDoc, 21),
    s(a.cpf_cnpj_segurado, 18),
    s(a.codigo_estipulante, 9),
    s(a.codigo_unidade, 3),
    s(a.codigo_acordo, 3),
    d(a.emissao),
    d(a.vigencia_ini),
    d(a.vigencia_fim),
    nint(a.qtd_parcelas, 3),
    d(a.data_pagamento_1a),
    n(a.importancia_segurada, 18),
    n(a.premio_liquido, 18),
    n(a.valor_adicional_fracionamento, 18),
    n(a.valor_custo_documento, 18),
    n(a.valor_iof, 18),
    n(a.valor_premio_total ?? a.premio, 18),
    s(a.apolice_anterior, 15),
    s(a.codigo_cia_anterior, 4),
    s(a.tipo_endosso, 1),
    s(a.descricao_endosso, 25),
  )
}

// Registro 02 — CLIENTE
function r02(a: any, c: any, numDoc: string): string {
  return row(
    '02',
    s(numDoc, 21),
    s(c?.nome || a.cliente_nome, 40),
    s(a.segurado_endereco, 40),
    s(a.segurado_numero, 10),
    s(a.segurado_complemento, 20),
    s(a.segurado_bairro, 30),
    s(a.segurado_cep, 9),
    s(a.segurado_cidade, 20),
    s(a.segurado_uf, 2),
    s(a.segurado_telefone, 18),
    s(a.segurado_tipo_pessoa || (c?.tipo === 'PJ' ? 'J' : c?.tipo === 'PF' ? 'F' : ''), 1),
    s(a.cpf_cnpj_segurado, 18),
    s(a.segurado_email, 60),
    s(a.segurado_rg, 18),
    d(a.segurado_rg_data),
    s(a.segurado_rg_orgao, 6),
  )
}

// Registro 03 — ITEM AUTO
function r03(it: any, numDoc: string): string {
  return row(
    '03',
    s(numDoc, 21),
    nint(it.numero_item || 1, 6),
    s(it.marca, 15),
    s(it.modelo, 66),
    nint(it.ano_fabricacao, 4),
    nint(it.ano_modelo, 4),
    s(it.placa, 8),
    s(it.chassi, 20),
    nint(it.num_passageiros, 3),
    s(it.combustivel, 1),
    n(it.bonus_pct, 6),
    nint(it.bonus_nivel, 2),
    s(it.cobertura_codigo, 4),
    s(it.renavam, 11),
    s(it.cep_circulacao, 9),
    s(it.cep_pernoite, 9),
    s(it.regiao_circulacao, 20),
    s(it.codigo_operacao, 2),
    s(it.operacao_item, 20),
    n(it.valor_fipe, 9),
    s(it.descricao_cobertura, 35),
    n(it.desconto_item, 7),
    nint(it.qtd_sinistros, 3),
    s(it.ci_anterior, 18),
    s(it.ci_atual, 18),
  )
}

// Registro 04 — ACESSÓRIO
function r04(ac: any, numDoc: string): string {
  return row(
    '04',
    s(numDoc, 21),
    nint(ac.numero_item || 1, 6),
    s(ac.descricao, 40),
    n(ac.is_segurada, 18),
    n(ac.premio_liquido, 18),
    n(ac.premio_anual, 18),
  )
}

// Registro 05 — COBERTURA BÁSICA
function r05(co: any, numDoc: string): string {
  return row(
    '05',
    s(numDoc, 21),
    nint(co.numero_item || 1, 6),
    s(co.codigo_cobertura, 4),
    n(co.is_segurada, 18),
    n(co.valor_franquia, 18),
    s(co.tipo_franquia, 1),
    n(co.premio_liquido, 18),
    n(co.premio_anual, 18),
  )
}

// Registro 06 — COBERTURAS ADICIONAIS
function r06(co: any, numDoc: string): string {
  return row(
    '06',
    s(numDoc, 21),
    nint(co.numero_item || 1, 6),
    s(co.codigo_cobertura, 4),
    s(co.codigo_cobertura_tabela, 4),
    n(co.is_segurada, 18),
    n(co.valor_franquia, 18),
    s(co.tipo_franquia, 1),
    s(co.descricao, 35),
    n(co.premio_liquido, 18),
    n(co.premio_anual, 18),
  )
}

// Registro 07 — MOTORISTA
function r07(m: any, numDoc: string): string {
  return row(
    '07',
    s(numDoc, 21),
    nint(m.numero_item || 1, 6),
    s(m.codigo_perfil, 3),
    s(m.codigo_motorista, 7),
    s(m.nome, 40),
    d(m.data_nascimento),
    s(m.codigo_fator, 3),
    s(m.codigo_subfator, 4),
    s(m.descricao_fator, 50),
    s(m.descricao_subfator, 50),
  )
}

// Registro 08 — PERFIL DO MOTORISTA
function r08(m: any, numDoc: string): string {
  return row(
    '08',
    s(numDoc, 21),
    nint(m.numero_item || 1, 6),
    s(m.codigo_perfil, 3),
    s(m.codigo_fator, 3),
    s(m.codigo_subfator, 4),
    s(m.descricao_fator, 50),
    s(m.descricao_subfator, 50),
  )
}

// Registro 12 — DADOS DO CORRETOR
function r12(a: any, numDoc: string): string {
  return row(
    '12',
    s(numDoc, 21),
    s(a.ramo_codigo, 2),
    s(a.tipo_corretor, 1),
    s(a.susep_corretor, 14),
    s(a.tipo_inspetor, 1),
    s(a.susep_inspetor, 14),
    s(a.tipo_interno, 1),
    s(a.susep_interno, 14),
    n(a.comissao_total_pct, 6),
  )
}

// Registro 13 — LOCAL
function r13(l: any, numDoc: string): string {
  return row(
    '13',
    s(numDoc, 21),
    s(l.numero_documento_conjugado, 21),
    s(l.codigo_modalidade, 2),
    s(l.local_codigo, 6),
    n(l.premio_local, 18),
    s(l.endereco, 40),
    s(l.complemento, 20),
    s(l.cidade, 20),
    s(l.uf, 2),
    s(l.cep, 9),
    s(l.codigo_municipio, 3),
    s(l.codigo_atividade, 8),
    s(l.descricao_atividade, 100),
    s(l.codigo_construcao, 9),
    s(l.descricao_construcao, 40),
    s(l.codigo_bem_segurado, 3),
    s(l.descricao_bem_segurado, 20),
    s(l.codigo_plano, 4),
    s(l.descricao_plano, 30),
    nint(l.codigo_cliente, 9),
    s(l.agravacao_desconto, 7),
    s(l.pro_rata, 1),
    s(l.tipo_risco, 1),
    s(l.codigo_identificacao_doc, 17),
    s(l.pct_agravo_desconto, 10),
  )
}

// Registro 14 — CLÁUSULAS
function r14(cl: any, numDoc: string): string {
  return row(
    '14',
    s(numDoc, 21),
    s(cl.numero_documento_conjugado, 21),
    s(cl.codigo_ramo, 2),
    s(cl.codigo_modalidade, 2),
    s(cl.local_codigo, 6),
    s(cl.item, 6),
    s(cl.descricao_item_pre, 40),
    s(cl.codigo_clausula, 4),
    s(cl.descricao_clausula, 40),
    n(cl.is_segurada, 18),
    s(cl.codigo_franquia, 14),
    s(cl.descricao_franquia, 80),
    n(cl.valor_franquia, 18),
    n(cl.premio_liquido, 18),
    '',                               // espaço disponível
    n(cl.premio_anual, 18),
    n(cl.valor_risco, 18),
    s(cl.cobertura_basica, 1),
  )
}

// Monta o conteúdo completo do arquivo para uma OU mais apólices.
export function montarArquivoHDI(apolices: ApoliceFull[]): string {
  const linhas: string[] = []
  for (const a of apolices) {
    const numDoc = numeroDocumento(a.apolice)
    linhas.push(r01(a.apolice, numDoc))
    linhas.push(r02(a.apolice, a.cliente, numDoc))
    for (const it of a.itens || [])      linhas.push(r03(it, numDoc))
    for (const ac of a.acessorios || []) linhas.push(r04(ac, numDoc))
    for (const co of a.coberturas || []) {
      if (co.tipo_registro === '06') linhas.push(r06(co, numDoc))
      else                            linhas.push(r05(co, numDoc))
    }
    for (const m of a.motoristas || []) {
      if (m.tipo_registro === '08') linhas.push(r08(m, numDoc))
      else                          linhas.push(r07(m, numDoc))
    }
    linhas.push(r12(a.apolice, numDoc))
    for (const l of a.locais || [])    linhas.push(r13(l, numDoc))
    for (const cl of a.clausulas || []) linhas.push(r14(cl, numDoc))
  }
  return linhas.join('\r\n') + '\r\n'
}

export function nomeArquivoHDI(susep: string): string {
  const code = String(susep || '').replace(/\D/g, '').padStart(9, '0').slice(-9)
  return `C${code}.txt`
}
