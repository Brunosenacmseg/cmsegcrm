// Parser de PDFs de apólices Allianz — extração completa.
//
// Suporta os 5 produtos do portal:
//   - Auto (Automóvel)        Ramo 31
//   - Empresa PME             Ramo 18
//   - Residência              Ramo 14
//   - Vida Coletivo (Global)  Ramo 93
//   - Vida Individual         Ramo 91
//
// Estratégia: extrai o texto bruto via `unpdf` (pdf.js serverless) e
// aplica regex tolerantes a quebra de linha. Nunca falha — campos não
// encontrados retornam null; campos da página de informações
// importantes / canais de atendimento / glossário / SUSEP / rodapé
// são ignorados. Retorna `warnings[]` quando algo bate fora do
// esperado (parcelas faltando, total de coberturas zerado, etc.).

import { extractText, getDocumentProxy } from 'unpdf'

export type AllianzProduto =
  | 'auto'
  | 'pme'
  | 'residencia'
  | 'vida_coletivo'
  | 'vida_individual'
  | 'desconhecido'

export const ALLIANZ_RAMO_NOME: Record<string, AllianzProduto> = {
  '31': 'auto',
  '18': 'pme',
  '14': 'residencia',
  '93': 'vida_coletivo',
  '91': 'vida_individual',
}

export type ParcelaPDF = {
  parcela: number
  vencimento: string | null    // YYYY-MM-DD ou null se "à vista"
  vencimento_label: string | null  // 'à vista' | 'DD/MM/YYYY' (preserva original)
  valor: number | null
}

export type CoberturaPDF = {
  nome: string
  lmi_texto: string | null      // "100% FIPE", "Plano 3", "7 Dias", "R$ 100.000,00"
  lmi_valor: number | null      // valor numérico extraído quando aplicável
  premio: number | null
  franquia_pct: number | null
  franquia_minima: number | null
  capital: number | null        // só Vida (capital segurado da cobertura)
}

export type ClausulaPDF = {
  codigo: string | null
  descricao: string
}

export type AssistenciaPDF = {
  nome: string                  // "Assistência 24h", "Assistência Residencial", "Pronto Atendimento Virtual"...
  plano: string | null          // "Plano 3", "VIP", null
  servicos: string[]            // lista de serviços oferecidos
}

export type CondutorPDF = {
  nome: string | null
  cpf: string | null
  idade: number | null
  estado_civil: string | null
  ampliar_18_25: boolean | null   // "Deseja ampliar a cobertura ... 18 a 25 anos"
  residencia: string | null       // "Apartamento" / "Casa"
}

export type LocalSeguradoPDF = {
  endereco: string | null
  cep: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
}

export type EnderecoSplit = {
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
}

export type AllianzPDFExtraido = {
  produto: AllianzProduto
  ramo: string | null

  // identificadores
  numero_apolice: string | null
  numero_proposta: string | null
  numero_endosso: string | null
  cod_ci: string | null
  versao_tabela: string | null
  condicoes_gerais: string | null
  grupo_codigo: string | null
  tipo_seguro_descricao: string | null

  // datas
  emissao: string | null
  vigencia_ini: string | null
  vigencia_fim: string | null
  vigencia_tipo: string | null         // 'anual' / '5 anos' / 'plurianual'
  vigencia_anual_ini: string | null    // só Vida Individual (multi-ano)
  vigencia_anual_fim: string | null

  // segurado / cliente
  cliente_nome: string | null
  cliente_nome_social: string | null
  cpf_cnpj: string | null
  email: string | null
  telefone: string | null
  endereco: EnderecoSplit              // dividido em partes

  // pagamento
  premio_liquido: number | null
  premio_total: number | null
  iof: number | null
  taxa_juros_mensal: number | null
  valor_juros: number | null
  custo_apolice: number | null
  forma_pagamento: string | null       // 'Boleto Bancário', 'Cartão de Crédito'...
  forma_pagamento_descricao: string | null
  qtd_parcelas: number | null
  cartao_final: string | null
  parcelas: ParcelaPDF[]

  // franquia
  franquia_tipo: string | null
  franquia_valor: number | null

  // Auto
  veiculo: string | null
  placa: string | null
  chassi: string | null
  ano_modelo: string | null
  cod_fipe: string | null
  categoria_risco: string | null
  finalidade_uso: string | null
  kit_gas: boolean | null
  classe_bonus: number | null
  zero_km: boolean | null
  cep_pernoite: string | null
  apolice_anterior: string | null
  seguradora_anterior: string | null
  veiculo_igual_anterior: boolean | null
  fim_vigencia_anterior: string | null
  condutor_principal: CondutorPDF | null

  // PME / Residência / Empresa
  tipo_residencia: string | null
  tipo_construcao: string | null
  tipo_contratacao: string | null
  telhado_isopainel: boolean | null
  objeto_seguro: string | null
  valor_em_risco: number | null
  limite_maximo_garantia: number | null
  valor_de_novo: boolean | null
  atividade_local: string | null
  local_segurado: LocalSeguradoPDF | null

  // Vida
  profissao: string | null
  esporte_radical: string | null
  pacote_contratado: string | null
  num_empregados: number | null
  num_socios: number | null
  num_segurados: number | null
  capital_total_segurado: number | null
  capital_total_empregados: number | null
  capital_total_socios: number | null

  // Tabelas
  coberturas: CoberturaPDF[]
  clausulas: ClausulaPDF[]
  assistencias: AssistenciaPDF[]

  // Texto bruto (truncado) e avisos
  texto_bruto: string
  warnings: string[]
}

// ───────────────────────── helpers genéricos ─────────────────────────
const TRUNC_TEXTO = 80_000

function onlyDigits(s: string | null | undefined): string | null {
  if (!s) return null
  const d = String(s).replace(/\D/g, '')
  return d || null
}

function brToIsoDate(s: string | null | undefined): string | null {
  if (!s) return null
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function brToNum(s: string | null | undefined): number | null {
  if (s == null) return null
  const t = String(s).trim().replace(/[R$\s]/g, '')
  if (!t) return null
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(norm)
  return isFinite(n) ? n : null
}

function pick(text: string, regex: RegExp): string | null {
  const m = text.match(regex)
  return m ? (m[1] || '').trim() : null
}

function pickAny(text: string, regexes: RegExp[]): string | null {
  for (const r of regexes) {
    const v = pick(text, r)
    if (v) return v
  }
  return null
}

function parseSimNao(s: string | null | undefined): boolean | null {
  if (!s) return null
  const t = s.trim().toLowerCase()
  if (/^s(im)?\b/.test(t)) return true
  if (/^n[ãa]o\b/.test(t)) return false
  return null
}

// ───────────────────────── extração de texto ─────────────────────────
export async function extrairTextoPDF(buffer: Buffer | ArrayBuffer | Uint8Array): Promise<string> {
  const u8: Uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const pdf = await getDocumentProxy(u8)
  const result = await extractText(pdf, { mergePages: true })
  return typeof result.text === 'string' ? result.text : (result.text as string[]).join('\n')
}

// ───────────────────────── detecção de produto ───────────────────────
export function detectarProduto(texto: string): AllianzProduto {
  const upper = texto.toUpperCase()
  const ramo = upper.match(/RAMO[:\s]*(\d{2})\b/)
  if (ramo && ALLIANZ_RAMO_NOME[ramo[1]]) return ALLIANZ_RAMO_NOME[ramo[1]]
  if (/VIDA\s+INDIVIDUAL/.test(upper) && /PACOTE\s+CONTRATADO/.test(upper)) return 'vida_individual'
  if (/VIDA\s+GLOBAL\s+TRADICIONAL/.test(upper) || /CAPITAL\s+TOTAL\s+SEGURADO/.test(upper)) return 'vida_coletivo'
  if (/AUTOM[ÓO]VEL/.test(upper) && /CHASSI/.test(upper)) return 'auto'
  if (/EMPRESA\s+PME/.test(upper) || /ALLIANZ\s+EMPRESA/.test(upper)) return 'pme'
  if (/ALLIANZ\s+RESID[ÊE]NCIA/.test(upper) || /TIPO\s+DE\s+RESID[ÊE]NCIA/.test(upper)) return 'residencia'
  return 'desconhecido'
}

// ───────────────────────── address split ─────────────────────────────
function splitEndereco(raw: string | null): EnderecoSplit {
  const empty: EnderecoSplit = {
    logradouro: null, numero: null, complemento: null,
    bairro: null, cidade: null, uf: null, cep: null,
  }
  if (!raw) return empty

  const cepMatch = raw.match(/(\d{5}-?\d{3})/)
  const cep = cepMatch ? cepMatch[1].replace('-', '').replace(/(\d{5})(\d{3})/, '$1-$2') : null

  // padrão "AV NOVE DE JULHO, 2975 - ANHANGABAU - JUNDIAÍ/SÃO PAULO - 13208-056"
  const cidUf = raw.match(/-\s*([A-ZÀ-Úa-zà-ú\s]+)\/([A-ZÀ-Ú\s]+)\s*-\s*\d{5}/)
  const cidade = cidUf ? cidUf[1].trim() : null
  const uf     = cidUf ? cidUf[2].trim().slice(0, 2) : null

  // bairro fica entre o logradouro/numero e a cidade/uf
  const partes = raw.split(/\s*-\s*/)
  let logradouro: string | null = null
  let numero: string | null = null
  let complemento: string | null = null
  let bairro: string | null = null
  if (partes.length) {
    // primeira parte: "AV NOVE DE JULHO, 2975, APT 31 ACQUA"
    const head = partes[0]
    const m = head.match(/^(.*?),\s*([\dA-Z]+(?:[A-Z])?)(?:,\s*(.+))?$/)
    if (m) {
      logradouro = m[1].trim()
      numero = m[2].trim()
      complemento = m[3]?.trim() || null
    } else {
      logradouro = head.trim()
    }
    // segunda parte: bairro
    if (partes.length >= 2) bairro = partes[1].trim() || null
  }
  return { logradouro, numero, complemento, bairro, cidade, uf, cep }
}

// ───────────────────────── parser principal ──────────────────────────
export async function parseAllianzPDF(buffer: Buffer | ArrayBuffer | Uint8Array): Promise<AllianzPDFExtraido> {
  const texto = await extrairTextoPDF(buffer)
  return parseAllianzTexto(texto)
}

export function parseAllianzTexto(texto: string): AllianzPDFExtraido {
  const t = texto.replace(/\r/g, '')
  const warnings: string[] = []
  const produto = detectarProduto(t)
  if (produto === 'desconhecido') warnings.push('Produto Allianz não identificado a partir do texto do PDF.')

  const base: AllianzPDFExtraido = baseExtrato(t, produto, warnings)

  // Aplica os parsers específicos por produto
  switch (produto) {
    case 'auto':            parseAuto(t, base, warnings); break
    case 'pme':             parsePME(t, base, warnings); break
    case 'residencia':      parseResidencia(t, base, warnings); break
    case 'vida_coletivo':   parseVidaColetivo(t, base, warnings); break
    case 'vida_individual': parseVidaIndividual(t, base, warnings); break
  }

  // Cláusulas e assistências são genéricas — buscamos depois dos parsers
  base.clausulas = extrairClausulas(t)
  if (!base.assistencias.length) base.assistencias = extrairAssistencias(t)

  // Validação cruzada: parcelas vs qtd_parcelas
  if (base.qtd_parcelas && base.parcelas.length && base.parcelas.length !== base.qtd_parcelas) {
    warnings.push(`Detectadas ${base.parcelas.length} parcelas no texto, mas o PDF informa ${base.qtd_parcelas}.`)
  }

  base.texto_bruto = texto.length > TRUNC_TEXTO ? texto.slice(0, TRUNC_TEXTO) + '\n[...TRUNCADO...]' : texto
  base.warnings = warnings
  return base
}

// ─────── monta o objeto base com campos comuns a todos os produtos ───────
function baseExtrato(t: string, produto: AllianzProduto, warnings: string[]): AllianzPDFExtraido {
  const ramo = pick(t, /Ramo[:\s]*(\d{2})\b/i)

  const numero_apolice = pickAny(t, [
    /N[ºo]\.?\s*da\s*Ap[óo]lice[:\s]*([0-9A-Z]+)/i,
    /Ap[óo]lice\s*N[ºo]\.?[:\s]*([0-9A-Z]+)/i,
    /N[ºo]\.?\s*Ap[óo]lice[:\s]*([0-9A-Z]+)/i,
  ])
  const numero_proposta = pickAny(t, [
    /N[ºo]\.?\s*da\s*Proposta[:\s]*([0-9]+)/i,
    /Proposta\s*N[ºo]\.?[:\s]*([0-9]+)/i,
    /N[ºo]\.?\s*Proposta[:\s]*([0-9]+)/i,
  ])
  const numero_endosso = pickAny(t, [
    /N[ºo]\.?\s*do\s*Endosso[:\s]*([0-9]+)/i,
    /N[ºo]\.?\s*Endosso[:\s]*([0-9]+)/i,
  ])
  const cod_ci = pick(t, /C[óo]d\.?\s*CI[:\s]*([0-9]+)/i)
  const versao_tabela = pickAny(t, [
    /Vers[ãa]o\s*da\s*tabela[:\s]*([\d./]+)/i,
    /Vers[ãa]o[:\s]*([\d./]+)/i,
  ])
  const condicoes_gerais = pick(t, /Condi[çc][õo]es\s*[Gg]erais[:\s]*(\d{1,2}\/\d{4})/i)
  const grupo_codigo = pick(t, /Grupo[:\s]*(\d{2,3})\b/i)
  const tipo_seguro_descricao = pickAny(t, [
    /Tipo\s*de\s*Seguro[:\s]*([^\n]+?)(?=\s+(?:Ap[óo]lice|Proposta|Ve[íi]culo|Pacote|Ramo|Produto|N[ºo]|$))/i,
    /TIPO\s*DE\s*SEGURO[:\s]*([^\n]+?)(?=\s+(?:VIG[ÊE]NCIA|RAMO|PRODUTO|$))/i,
  ])

  // datas
  const emissao = brToIsoDate(pick(t, /(?:Data\s+de\s+)?Emiss[ãa]o[:\s]*(\d{2}\/\d{2}\/\d{4})/i))

  let vigencia_ini: string | null = null
  let vigencia_fim: string | null = null
  const vig = t.match(/Vig[êe]ncia[^\n]{0,80}?(\d{2}\/\d{2}\/\d{4})[^\n]{0,40}?(\d{2}\/\d{2}\/\d{4})/i)
  if (vig) { vigencia_ini = brToIsoDate(vig[1]); vigencia_fim = brToIsoDate(vig[2]) }

  // Vida Individual tem "VIGÊNCIA DO CONTRATO" e "VIGÊNCIA ANUAL"
  let vigencia_anual_ini: string | null = null
  let vigencia_anual_fim: string | null = null
  let vigencia_tipo: string | null = null
  const vigContrato = t.match(/VIG[ÊE]NCIA\s+DO\s+CONTRATO[:\s]+das\s+24H\s+de\s+(\d{2}\/\d{2}\/\d{4})\s+[àa]s\s+24H\s+de\s+(\d{2}\/\d{2}\/\d{4})/i)
  const vigAnual = t.match(/VIG[ÊE]NCIA\s+ANUAL[:\s]+das\s+24H\s+de\s+(\d{2}\/\d{2}\/\d{4})\s+[àa]s\s+24H\s+de\s+(\d{2}\/\d{2}\/\d{4})/i)
  if (vigContrato) {
    vigencia_ini = brToIsoDate(vigContrato[1])
    vigencia_fim = brToIsoDate(vigContrato[2])
    if (vigAnual) {
      vigencia_anual_ini = brToIsoDate(vigAnual[1])
      vigencia_anual_fim = brToIsoDate(vigAnual[2])
      const yearsIni = Number(vigContrato[1].slice(-4))
      const yearsFim = Number(vigContrato[2].slice(-4))
      const yrs = yearsFim - yearsIni
      vigencia_tipo = yrs > 1 ? `${yrs} anos` : 'anual'
    }
  } else if (vig) {
    vigencia_tipo = 'anual'
  }

  // segurado / cliente
  const cpf_cnpj = onlyDigits(pickAny(t, [
    /CPF\/CNPJ[:\s]*([\d.\/-]{11,18})/i,
    /CNPJ[:\s]*([\d.\/-]{14,18})/i,
    /\bCPF[:\s]*([\d.\/-]{11,14})/i,
  ]))
  const cliente_nome = pickAny(t, [
    /Ol[áa]\s+([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,80}?)\s*[,\n]/,
    /Segurado[:\s]+([^\n]+?)(?=\s+(?:CPF|CNPJ|Nome\s+Social|N[ºo]|ENDERE|TEL|$))/i,
    /SEGURADO[:\s]+([^\n]+?)(?=\s+(?:CPF|CNPJ|ENDERE[ÇC]O|$))/i,
    /Nome[:\s]+([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,80}?)(?=\s+(?:CPF|CNPJ|TEL|E-?MAIL|$))/,
  ])
  const cliente_nome_social = pick(t, /Nome\s+Social[:\s]+([^\n]+?)(?=\s+(?:CPF|CNPJ|N[ºo]|$))/i)
  const email = pick(t, /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/)
  const telefone = (() => {
    const m = t.match(/Tel(?:efone)?[:\s]*\(?(\d{2})\)?\s*9?\d{4}[-\s]?\d{4}/i)
    if (m) return m[0].replace(/^Tel(?:efone)?[:\s]*/i, '').replace(/\s+/g, ' ').trim()
    const m2 = t.match(/\(?(\d{2})\)?\s*9?\d{4}[-\s]?\d{4}/)
    return m2 ? m2[0].replace(/\s+/g, ' ').trim() : null
  })()
  const enderecoStr = pickAny(t, [
    /Endere[çc]o[:\s]+([^\n]+?\d{5}-?\d{3}[^\n]*?)(?=\s+(?:Bairro|Cidade|INFORMA[ÇC]|CONDUTOR|Tel|E-?mail|$))/i,
    /Endere[çc]o[:\s]+([^\n]+)/i,
  ])
  const endereco = splitEndereco(enderecoStr)

  // pagamento
  const premio_liquido = brToNum(pickAny(t, [
    /Pr[êe]mio\s*L[íi]quido[^\n]*?([\d.,]+)/i,
    /Pre[çc]o\s*l[íi]quido[^\n]*?([\d.,]+)/i,
  ]))
  const premio_total = brToNum(pickAny(t, [
    /Pr[êe]mio\s*Total[^\n]*?([\d.,]+)/i,
    /Pre[çc]o\s*Total[^\n]*?([\d.,]+)/i,
    /Total\s*a\s*[Pp]agar[^\n]*?([\d.,]+)/i,
  ]))
  const iof = brToNum(pick(t, /IOF[:\s()R$]*([\d.,]+)/i))
  const taxa_juros_mensal = brToNum(pickAny(t, [
    /Taxa\s*mensal\s*juros[:\s%R$()]*([\d.,]+)/i,
    /Tx\.?\s*mensal\s*juros[:\s%R$()]*([\d.,]+)/i,
  ]))
  const valor_juros = brToNum(pick(t, /Valor\s*juros[:\s()R$]*([\d.,]+)/i))
  const custo_apolice = brToNum(pick(t, /Custo\s*da\s*Ap[óo]lice[:\s()R$]*([\d.,]+)/i))
  const forma_pagamento = pickAny(t, [
    /Forma\s*de\s*[Pp]agamento[:\s]*([^\n]+?)(?=\s+(?:N[ºo]|Pr[êe]mio|Pre[çc]o|Taxa|Valor|[ÍI]ndice|Cart[ãa]o|Custo|$))/i,
    /(Boleto\s+Banc[áa]rio|Cart[ãa]o\s+de\s+Cr[ée]dito|D[ée]bito\s+(?:em\s+conta|autom[áa]tico))/i,
  ])
  const forma_pagamento_descricao = pick(t, /(Boleto\s+Banc[áa]rio\s+em\s+\d+\s+parcelas|Cart[ãa]o\s+de\s+Cr[ée]dito\s+em\s+\d+\s+parcelas)/i)
  const cartao_final = pick(t, /Cart[ãa]o[:\s]*[\d*]+(\d{4})/i) || pick(t, /N[ºo]?\.?\s*(?:do\s+)?Cart[ãa]o[:\s]*[\d*]+(\d{4})/i)
  const qtd_parcelas = (() => {
    const x = pickAny(t, [
      /N[ºo]\s*de\s*[Pp]arcelas[:\s]*(\d{1,2})/i,
      /em\s+(\d{1,2})\s+parcelas/i,
      /Boleto\s+Banc[áa]rio\s+em\s+(\d{1,2})\s+parcelas/i,
      /Cart[ãa]o\s+de\s+Cr[ée]dito\s+em\s+(\d{1,2})\s+parcelas/i,
    ])
    const n = x ? parseInt(x, 10) : NaN
    return isFinite(n) && n > 0 && n <= 60 ? n : null
  })()

  const parcelas = extrairParcelas(t)

  // franquia
  const franquia_tipo = pickAny(t, [
    /FRANQUIA[\s\S]{0,200}?Franquia[\s\S]{0,40}?(Isen[çc][ãa]o\s+de\s+franquia|Reduzida|Normal|Majorada)/i,
    /(Isen[çc][ãa]o\s+de\s+franquia)/i,
  ])
  const franquia_valor = brToNum(pickAny(t, [
    /Isen[çc][ãa]o\s+de\s+franquia[\s\S]{0,40}?([\d.,]+)/i,
    /Franquia[\s\S]{0,40}?Valor\s*\(R\$\)[\s\S]{0,20}?([\d.,]+)/i,
  ]))

  return {
    produto, ramo,
    numero_apolice, numero_proposta, numero_endosso,
    cod_ci, versao_tabela, condicoes_gerais, grupo_codigo, tipo_seguro_descricao,
    emissao, vigencia_ini, vigencia_fim,
    vigencia_tipo, vigencia_anual_ini, vigencia_anual_fim,
    cliente_nome, cliente_nome_social, cpf_cnpj, email, telefone, endereco,
    premio_liquido, premio_total, iof, taxa_juros_mensal, valor_juros, custo_apolice,
    forma_pagamento, forma_pagamento_descricao, qtd_parcelas, cartao_final, parcelas,
    franquia_tipo, franquia_valor,
    // produto-específicos: começam null e os parsers preenchem
    veiculo: null, placa: null, chassi: null, ano_modelo: null, cod_fipe: null,
    categoria_risco: null, finalidade_uso: null, kit_gas: null, classe_bonus: null,
    zero_km: null, cep_pernoite: null,
    apolice_anterior: null, seguradora_anterior: null,
    veiculo_igual_anterior: null, fim_vigencia_anterior: null,
    condutor_principal: null,
    tipo_residencia: null, tipo_construcao: null, tipo_contratacao: null,
    telhado_isopainel: null, objeto_seguro: null,
    valor_em_risco: null, limite_maximo_garantia: null, valor_de_novo: null,
    atividade_local: null, local_segurado: null,
    profissao: null, esporte_radical: null, pacote_contratado: null,
    num_empregados: null, num_socios: null, num_segurados: null,
    capital_total_segurado: null, capital_total_empregados: null, capital_total_socios: null,
    coberturas: [], clausulas: [], assistencias: [],
    texto_bruto: '', warnings: [],
  }
}

// ─────── extração de parcelas (formato comum a todos os produtos) ───────
function extrairParcelas(t: string): ParcelaPDF[] {
  const list: ParcelaPDF[] = []
  // (a) "<N> DD/MM/YYYY <valor>" — tolerante a espaçamento variável
  const reData = /(?<![.\d])(\d{1,2})\s+(\d{2}\/\d{2}\/\d{4})\s+R?\$?\s*([\d.,]+)/g
  let m: RegExpExecArray | null
  while ((m = reData.exec(t)) !== null) {
    const p = parseInt(m[1], 10)
    const v = brToIsoDate(m[2])
    const val = brToNum(m[3])
    if (p >= 1 && p <= 60 && val != null && val > 0 && val < 1_000_000) {
      list.push({ parcela: p, vencimento: v, vencimento_label: m[2], valor: val })
    }
  }
  // (b) "<N> à vista <valor>"
  const reVista = /(?<![.\d])(\d{1,2})\s+[àa]\s+vista\s+R?\$?\s*([\d.,]+)/gi
  while ((m = reVista.exec(t)) !== null) {
    const p = parseInt(m[1], 10)
    const val = brToNum(m[2])
    if (p >= 1 && p <= 60 && val != null && val > 0) {
      list.push({ parcela: p, vencimento: null, vencimento_label: 'à vista', valor: val })
    }
  }
  // dedup
  const seen = new Set<string>()
  return list
    .filter(p => {
      const k = `${p.parcela}|${p.vencimento_label}|${p.valor}`
      if (seen.has(k)) return false
      seen.add(k); return true
    })
    .sort((a, b) => a.parcela - b.parcela)
}

// ─────── extração de cláusulas (formato genérico Allianz) ───────
function extrairClausulas(t: string): ClausulaPDF[] {
  const out: ClausulaPDF[] = []
  // procura bloco "CLÁUSULAS" e itera linhas até "INFORMAÇÕES" / "PROCESSO SUSEP" / etc.
  const bloco = t.match(/CL[ÁA]USULAS\s*([\s\S]{0,4000}?)(?:INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES|PROCESSO\s+SUSEP|GLOSS[ÁA]RIO|PRIVACIDADE|RATIFICAM-SE|$)/i)
  const src = bloco ? bloco[1] : t
  const re = /(?:^|\n)\s*(\d{3,4})\s*[-–]\s*([^\n]{4,200}?)(?=\s*(?:\n|$))/g
  let m: RegExpExecArray | null
  const seen = new Set<string>()
  while ((m = re.exec(src)) !== null) {
    const codigo = m[1]
    const desc = m[2].trim().replace(/\s+/g, ' ')
    if (seen.has(codigo)) continue
    seen.add(codigo)
    out.push({ codigo, descricao: desc })
  }
  return out
}

// ─────── extração de assistências (genérico — busca por blocos) ───────
function extrairAssistencias(t: string): AssistenciaPDF[] {
  const out: AssistenciaPDF[] = []

  // Padrão: "ASSISTÊNCIA 24H" (cabeçalho) seguido de "PLANO X" e linhas de serviços
  const re = /(ASSIST[ÊE]NCIA\s+(?:24[Hh]?(?:\s+PLANO\s+\w+)?|RESIDENCIAL|VIP|FUNERAL\s+(?:FAMILIAR|AMPLIADA)|VIDROS[\s\S]{0,40}))[\s\S]{0,40}?(?:Servi[çc]os|PLANO\s+\d+|PLANO\s+VIP)?/gi
  const m = re.exec(t)
  if (m) out.push({ nome: 'Assistência 24h', plano: pick(t, /PLANO\s+(\w+)/i), servicos: [] })

  if (/Pronto\s+Atendimento\s+Virtual/i.test(t)) {
    out.push({ nome: 'Pronto Atendimento Virtual', plano: null, servicos: [] })
  }
  if (/Funeral\s+Familiar/i.test(t)) {
    out.push({ nome: 'Funeral Familiar', plano: null, servicos: [] })
  }
  return out
}

// ───────────────────────── parser AUTO ──────────────────────────
function parseAuto(t: string, b: AllianzPDFExtraido, _w: string[]) {
  b.veiculo = pickAny(t, [
    /Ve[íi]culo[:\s]+([^\n]+?)(?=\s+(?:C[óo]d\.?\s*FIPE|FIPE|Placa|Chassi|Vers[ãa]o|Emiss[ãa]o|Ramo|Produto|$))/i,
  ])
  b.placa = pick(t, /Placa[:\s]+([A-Z0-9]{6,8})/i)
  b.chassi = pick(t, /Chassi[:\s]+([A-Z0-9]{15,20})/i)
  b.ano_modelo = pick(t, /Ano\s*\/?\s*Modelo[:\s]*([\d\/]+)/i)
  b.cod_fipe = pick(t, /C[óo]d\.?\s*FIPE[:\s]*([\d-]+)/i)
  b.categoria_risco = pickAny(t, [
    /Categoria\s*de\s*Risco[:\s]+([^\n]+?)(?=\s+(?:Finalidade|Grupo|CEP|$))/i,
  ])
  b.finalidade_uso = pickAny(t, [
    /Finalidade\s*de\s*Uso[:\s]+([^\n]+?)(?=\s+(?:CEP|Categoria|Grupo|$))/i,
  ])
  b.cep_pernoite = pick(t, /CEP\s*Pernoite[:\s]*(\d{5}-?\d{3})/i)
  b.kit_gas = parseSimNao(pick(t, /Kit\s*g[áa]s[:\s]+(Sim|N[ãa]o|NA?[ÃA]o)/i))
  b.zero_km = parseSimNao(pick(t, /Zero\s*Km[:\s]+(Sim|N[ãa]o|NA?[ÃA]o)/i))
  const bonus = pick(t, /Classe\s*B[ôo]nus[:\s]*(\d{1,2})/i)
  b.classe_bonus = bonus ? parseInt(bonus, 10) : null

  b.apolice_anterior = pick(t, /N[ºo]\.?\s*Ap[óo]lice\s*Anterior[:\s]*([0-9A-Z]+)/i)
  b.seguradora_anterior = pickAny(t, [
    /Seguradora\s*Anterior[:\s]*\d*\s*-?\s*([^\n]+?)(?=\s+(?:Fim|V[ée]iculo|C[óo]d|CIA|$))/i,
    /Seguradora\s*Anterior[:\s]+([^\n]+)/i,
  ])
  b.veiculo_igual_anterior = parseSimNao(pick(t, /Ve[íi]culo\s*Igual\s*ao\s*Anterior[:\s]+(Sim|N[ãa]o)/i))
  b.fim_vigencia_anterior = brToIsoDate(pick(t, /Fim\s*da\s*vig[êe]ncia\s*anterior[:\s]*(\d{2}\/\d{2}\/\d{4})/i))

  // condutor principal
  b.condutor_principal = parseCondutor(t)

  // coberturas (Auto)
  b.coberturas = parseCoberturasAuto(t)

  // assistência: lemos o plano pra preencher a lista
  const planoAssist = pick(t, /PLANO\s+(\d+)\s+Servi[çc]os/i)
  if (planoAssist) {
    b.assistencias = [{ nome: 'Assistência 24h', plano: `Plano ${planoAssist}`, servicos: extrairServicosAssist24Auto(t) }]
  }
}

function parseCondutor(t: string): CondutorPDF | null {
  const bloco = t.match(/INFORMA[ÇC][ÕO]ES\s+DO\s+CONDUTOR\s+PRINCIPAL\s*([\s\S]{0,1500}?)(?:INFORMA[ÇC][ÕO]ES\s+DO\s+SEGURO|OFERTA\s+ESCOLHIDA|$)/i)
  if (!bloco) return null
  const src = bloco[1]
  return {
    nome: pick(src, /Nome[:\s]+([^\n]+?)(?=\s+(?:CPF|Idade|$))/i),
    cpf: onlyDigits(pick(src, /CPF[:\s]*([\d.\/-]+)/i)),
    idade: (() => { const x = pick(src, /Idade[:\s]*(\d{1,3})/i); return x ? parseInt(x, 10) : null })(),
    estado_civil: pick(src, /Estado\s*Civil[:\s]+([^\n]+?)(?=\s+(?:Deseja|Idade|O\s+principal|$))/i),
    ampliar_18_25: parseSimNao(pick(src, /18\s*[aà]\s*25\s*anos[:\s]+(Sim|N[ãa]o)/i)),
    residencia: pick(src, /reside\s+em[:\s]+([^\n]+?)(?=\s+(?:$|INFORMA))/i),
  }
}

function extrairServicosAssist24Auto(t: string): string[] {
  const m = t.match(/PLANO\s+\d+\s*Servi[çc]os([\s\S]{0,800}?)(?:As\s+informa[çc][õo]es|ASSIST[ÊE]NCIA\s+RESIDENCIAL|CARRO\s+RESERVA|ASSIST[ÊE]NCIA\s+A\s+VIDROS)/i)
  if (!m) return []
  return m[1].split(/\n/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 100).slice(0, 30)
}

// Lista de coberturas conhecidas para AUTO (na ordem que aparece no PDF)
const COBERTURAS_AUTO = [
  'Casco - Básica Compreensiva - Colisão, Incêndio, Roubo e Furto',
  'Casco - Básica Compreensiva',
  'RCF* - Danos Materiais',
  'RCF* - Danos Corporais',
  'RCF* - Danos Morais e Estéticos',
  'APP* - Morte',
  'APP* - Invalidez Permanente',
  'RCF* - Gastos com Defesa',
  'Assistência 24 hs',
  'Assistência 24h',
  'Vidros',
  'Carro Reserva',
]

function parseCoberturasAuto(t: string): CoberturaPDF[] {
  // Para Auto, LMI pode ser "100% FIPE", "R$ N", "Plano N" ou "N Dias".
  // Padrão por linha: NOME ... (LMI) ... R$ premio
  const out: CoberturaPDF[] = []
  for (const nome of COBERTURAS_AUTO) {
    const escNome = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(escNome + '\\s+(R\\$\\s*[\\d.,]+|\\d{1,3}%\\s*FIPE\\s*\\*?|Plano\\s+\\d+|\\d{1,3}\\s*Dias)\\s+R\\$\\s*([\\d.,]+)', 'i')
    const m = re.exec(t)
    if (!m) continue
    const lmi_texto = m[1].trim()
    const lmi_valor = lmi_texto.startsWith('R$') ? brToNum(lmi_texto) : null
    out.push({
      nome: nome.replace(/^\s+|\s+$/g, ''),
      lmi_texto,
      lmi_valor,
      premio: brToNum(m[2]),
      franquia_pct: null, franquia_minima: null, capital: null,
    })
  }
  return out
}

// ───────────────────────── parser PME ──────────────────────────
function parsePME(t: string, b: AllianzPDFExtraido, _w: string[]) {
  b.local_segurado = parseLocalSegurado(t)
  b.atividade_local = pickAny(t, [
    /Atividade[:\s]+([^\n]+?)(?=\s+(?:Tipo|Produto|Ramo|$))/i,
  ])
  b.tipo_construcao = pickAny(t, [
    /Tipo\s*de\s*constru[çc][ãa]o[:\s]+([^\n]+?)(?=\s+(?:Tipo|Produto|Vers[ãa]o|$))/i,
  ])
  b.tipo_contratacao = pickAny(t, [
    /Tipo\s*de\s*contrata[çc][ãa]o[:\s]+([^\n]+?)(?=\s+(?:Limite|Versão|$))/i,
  ])
  b.objeto_seguro = pickAny(t, [
    /Objeto\s*do\s*Seguro[:\s]+([^\n]+?)(?=\s+(?:Condi[çc][õo]es|Vers[ãa]o|Vig[êe]ncia|$))/i,
  ])
  b.telhado_isopainel = parseSimNao(pick(t, /Telhado\/?Cobertura\s+em\s+Isopainel[:\s]+(Sim|N[ãa]o|NA?O)/i))
  b.limite_maximo_garantia = brToNum(pickAny(t, [
    /Limite\s*M[áa]ximo\s*de\s*Garantia[\s\S]{0,40}?([\d.,]+)/i,
  ]))
  b.valor_em_risco = brToNum(pickAny(t, [
    /VALOR\s*EM\s*RISCO[\s\S]{0,80}?Danos\s*Materiais[:\s]*([\d.,]+)/i,
  ]))
  b.valor_de_novo = parseSimNao(pick(t, /Valor\s*de\s*Novo[:\s]+(Sim|N[ãa]o)/i))

  b.coberturas = parseCoberturasPME(t)
}

const COBERTURAS_PME = [
  'Danos Elétricos',
  'Incêndio e Complementares',
  'Quebra de Vidros e Anúncios Luminosos e Mármores',
  'Quebra de Vidros',
  'Responsabilidade Civil',
  'Roubo',
  'Gastos com Defesa',
  'Vendaval',
  'Lucros Cessantes',
]

function parseCoberturasPME(t: string): CoberturaPDF[] {
  const out: CoberturaPDF[] = []
  // Layout: NOME LMI Prêmio (Franquia % e R$ — que normalmente vem em branco)
  for (const nome of COBERTURAS_PME) {
    const esc = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(esc + '\\s+([\\d.,]+)\\s+([\\d.,]+)(?:\\s+([\\d.,]+))?(?:\\s+([\\d.,]+))?', 'i')
    const m = re.exec(t)
    if (!m) continue
    out.push({
      nome,
      lmi_texto: `R$ ${m[1]}`,
      lmi_valor: brToNum(m[1]),
      premio: brToNum(m[2]),
      franquia_pct: m[3] ? brToNum(m[3]) : null,
      franquia_minima: m[4] ? brToNum(m[4]) : null,
      capital: null,
    })
  }
  return out
}

// ───────────────────────── parser RESIDÊNCIA ──────────────────────────
function parseResidencia(t: string, b: AllianzPDFExtraido, _w: string[]) {
  b.local_segurado = parseLocalSegurado(t)
  b.tipo_residencia = pickAny(t, [
    /Tipo\s*de\s*resid[êe]ncia[:\s]+([^\n]+?)(?=\s+(?:Tipo|Produto|Limite|$))/i,
  ])
  b.tipo_contratacao = pickAny(t, [
    /Tipo\s*de\s*contrata[çc][ãa]o[:\s]+([^\n]+?)(?=\s+(?:Limite|Vers[ãa]o|H[áa]\s+Telhado|$))/i,
  ])
  b.telhado_isopainel = parseSimNao(pick(t, /H[áa]\s*Telhado\s*de\s*Isopainel[?:\s]+(Sim|N[ãa]o|NA?O)/i))
  b.limite_maximo_garantia = brToNum(pickAny(t, [
    /Limite\s*m[áa]ximo\s*de\s*garantia[\s\S]{0,40}?R\$\s*([\d.,]+)/i,
    /Limite\s*M[áa]ximo\s*de\s*Garantia[\s\S]{0,40}?([\d.,]+)/i,
  ]))

  b.coberturas = parseCoberturasResidencia(t)
}

const COBERTURAS_RESIDENCIA = [
  'Incend / Raio / Expl / Fumaça / Q.Aero',
  'Incend/Raio/Expl/Fumaça/Q.Aero',
  'Incêndio',
  'Danos Elétricos',
  'RC Familiar',
  'Vendaval, Furacão, Ciclone, Tornado e Granizo',
  'Vendaval',
  'Perda e Pagamento de Aluguel',
  'Roubo/Furto Qualif. de Bens',
  'Quebra de Vidros / Mármores / Granitos',
  'Quebra de Vidros',
  'Despesas Extraordinárias',
  'Equipamentos Eletrônicos',
  'Roubo/furto Qualif. De bens fora local segurado',
  'Ruptura de Tanques e Tubulações',
  'Tumultos, greves e lockouts',
  'Jóias e obras de arte',
  'Assistência 24h',
]

function parseCoberturasResidencia(t: string): CoberturaPDF[] {
  const out: CoberturaPDF[] = []
  for (const nome of COBERTURAS_RESIDENCIA) {
    const esc = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Padrão: NOME [LMI=R$ valor | "VIP"] R$ premio (Participação Obrigatória opcional: "10% dos prejuízos com mínimo de R$ N")
    const re = new RegExp(
      esc +
      '\\s+(R\\$\\s*[\\d.,]+|VIP|Plano\\s+\\w+)\\s+R\\$\\s*([\\d.,]+)' +
      '(?:\\s+(\\d{1,3})%\\s*dos\\s*preju[íi]zos\\s*com\\s*m[íi]nimo\\s*de\\s*R\\$\\s*([\\d.,]+))?',
      'i'
    )
    const m = re.exec(t)
    if (!m) continue
    out.push({
      nome,
      lmi_texto: m[1].trim(),
      lmi_valor: m[1].startsWith('R$') ? brToNum(m[1]) : null,
      premio: brToNum(m[2]),
      franquia_pct: m[3] ? Number(m[3]) : null,
      franquia_minima: m[4] ? brToNum(m[4]) : null,
      capital: null,
    })
  }
  return out
}

// ───────────────────────── parser VIDA COLETIVO ──────────────────────────
function parseVidaColetivo(t: string, b: AllianzPDFExtraido, _w: string[]) {
  // CNPJ do segurado (estipulante) já foi extraído como cpf_cnpj
  // Local de cobrança / endereço da empresa pode ser usado como local_segurado
  b.num_empregados = (() => { const x = pick(t, /N[ºo]\s*Empregados[:\s]*(\d+)/i); return x ? parseInt(x, 10) : null })()
  b.num_socios = (() => { const x = pick(t, /N[ºo]\s*S[óo]cios[:\s]*(\d+)/i); return x ? parseInt(x, 10) : null })()
  b.num_segurados = (() => { const x = pick(t, /N[ºo]\s*Total\s*Segurados[:\s]*(\d+)/i); return x ? parseInt(x, 10) : null })()
  b.capital_total_empregados = brToNum(pick(t, /Capital\s*Total\s*de\s*Empregados[:\s]*([\d.,]+)/i))
  b.capital_total_socios = brToNum(pick(t, /Capital\s*Total\s*de\s*S[óo]cios[:\s]*([\d.,]+)/i))
  b.capital_total_segurado = brToNum(pickAny(t, [
    /Capital\s*Total\s*Segurado[:\s]*([\d.,]+)/i,
  ]))

  b.coberturas = parseCoberturasVidaColetivo(t)

  // assistência funeral familiar
  const funeral = pick(t, /Funeral\s+Familiar\s+R\$\s*([\d.,]+)/i)
  if (funeral) {
    b.assistencias = [{ nome: 'Funeral Familiar', plano: `R$ ${funeral}`, servicos: [] }]
  }
}

const COBERTURAS_VIDA_COLETIVO = [
  'Morte Titular',
  'IPA - Invalidez Permanente por Acidente',
  'IEA - Indenização Especial por Acidente',
  'IFPD - Invalidez Funcional Permanente por doença',
  'IFPD - Invalidez Funcional Permanente Total por Doença',
  'RT - Rescisão Trabalhista',
  'DCF - Doenças Congênitas de Filhos',
  'Auxílio Funeral',
  'Auxílio Cesta Básica',
]

function parseCoberturasVidaColetivo(t: string): CoberturaPDF[] {
  const out: CoberturaPDF[] = []
  for (const nome of COBERTURAS_VIDA_COLETIVO) {
    const esc = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // formato: NOME CAPITAL PREMIO (sem R$, e capital pode ter virgula)
    const re = new RegExp(esc + '\\s+([\\d.,]+)\\s+([\\d.,]+)', 'i')
    const m = re.exec(t)
    if (!m) continue
    const cap = brToNum(m[1])
    const prem = brToNum(m[2])
    if (cap == null && prem == null) continue
    out.push({
      nome,
      lmi_texto: cap != null ? `R$ ${m[1]}` : null,
      lmi_valor: cap,
      capital: cap,
      premio: prem,
      franquia_pct: null, franquia_minima: null,
    })
  }
  return out
}

// ───────────────────────── parser VIDA INDIVIDUAL ──────────────────────────
function parseVidaIndividual(t: string, b: AllianzPDFExtraido, _w: string[]) {
  b.profissao = pickAny(t, [
    /PROFISS[ÃA]O[:\s]+([^\n]+?)(?=\s+(?:ESPORTE|PACOTE|VIG[ÊE]NCIA|RAMO|$))/i,
    /Profiss[ãa]o[:\s]+([^\n]+?)(?=\s+(?:Esporte|Pacote|Vig[êe]ncia|$))/i,
  ])
  b.esporte_radical = pickAny(t, [
    /ESPORTE\s+RADICAL[:\s]+([^\n]+?)(?=\s+(?:PACOTE|COBERTURAS|$))/i,
    /Esporte\s+radical[:\s]+([^\n]+?)(?=\s+(?:Pacote|Coberturas|$))/i,
  ])
  b.pacote_contratado = pickAny(t, [
    /PACOTE\s+CONTRATADO[:\s]+([^\n]+?)(?=\s+(?:PROFISS|ESPORTE|VIG[ÊE]NCIA|$))/i,
    /Pacote\s+contratado[:\s]+([^\n]+?)(?=\s+(?:Profiss|Esporte|Vig[êe]ncia|$))/i,
  ])
  b.coberturas = parseCoberturasVidaIndividual(t)

  if (/Pronto\s+Atendimento\s+Virtual/i.test(t)) {
    b.assistencias.push({ nome: 'Pronto Atendimento Virtual', plano: null, servicos: [] })
  }
}

const COBERTURAS_VIDA_INDIVIDUAL = [
  'Morte',
  'IEA - Indenização Especial por Morte Acidental',
  'IPA - Invalidez Permanente Total ou Parcial por Acidente',
  'DC - Diagnóstico de câncer',
  'DC - Diagnóstico de Câncer',
  'DIT - Diária por Incapacidade Temp. (até 180 diárias)',
  'DIT - Diária por Incapacidade Temp.',
  'IFPD - Invalidez Funcional Permanente Total por Doença',
  'Doenças Graves',
]

function parseCoberturasVidaIndividual(t: string): CoberturaPDF[] {
  const out: CoberturaPDF[] = []
  for (const nome of COBERTURAS_VIDA_INDIVIDUAL) {
    const esc = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(esc + '\\s+R\\$\\s*([\\d.,]+)\\s+R\\$\\s*([\\d.,]+)', 'i')
    const m = re.exec(t)
    if (!m) continue
    const cap = brToNum(m[1])
    out.push({
      nome,
      lmi_texto: `R$ ${m[1]}`,
      lmi_valor: cap,
      capital: cap,
      premio: brToNum(m[2]),
      franquia_pct: null, franquia_minima: null,
    })
  }
  return out
}

// ─────── local segurado (PME / Residência) ───────
function parseLocalSegurado(t: string): LocalSeguradoPDF | null {
  const raw = pickAny(t, [
    /Endere[çc]o\s*do\s*local\s*segurado[:\s]+([^\n]+)/i,
  ])
  if (!raw) return null
  const split = splitEndereco(raw)
  return {
    endereco: raw.trim(),
    cep: split.cep,
    bairro: split.bairro,
    cidade: split.cidade,
    uf: split.uf,
  }
}

// ─────────────────────── mapeamento para o CRM ───────────────────────

/**
 * Devolve o payload pronto para insert/upsert em `apolices`.
 * `cliente_id` precisa ser resolvido fora.
 */
export function mapApolicePayload(d: AllianzPDFExtraido, cliente_id: string): Record<string, any> {
  return {
    cliente_id,
    numero: d.numero_apolice,
    proposta: d.numero_proposta,
    proposta_endosso: d.numero_endosso,
    seguradora: 'Allianz',
    ramo: produtoLabel(d.produto),
    ramo_codigo: d.ramo,
    produto: produtoLabel(d.produto),
    emissao: d.emissao,
    vigencia_ini: d.vigencia_ini,
    vigencia_fim: d.vigencia_fim,
    vigencia_tipo: d.vigencia_tipo,
    vigencia_anual_ini: d.vigencia_anual_ini,
    vigencia_anual_fim: d.vigencia_anual_fim,
    premio: d.premio_total,
    premio_liquido: d.premio_liquido,
    valor_iof: d.iof,
    valor_premio_total: d.premio_total,
    taxa_juros_mensal: d.taxa_juros_mensal,
    valor_juros: d.valor_juros,
    custo_apolice: d.custo_apolice,
    qtd_parcelas: d.qtd_parcelas,
    tipo_pagamento: d.forma_pagamento,
    forma_pagamento_descricao: d.forma_pagamento_descricao,
    cartao_final: d.cartao_final,
    placa: d.placa,
    chassi: d.chassi,
    ano_modelo: d.ano_modelo,
    cod_fipe: d.cod_fipe,
    categoria_risco: d.categoria_risco,
    finalidade_uso: d.finalidade_uso,
    kit_gas: d.kit_gas,
    classe_bonus: d.classe_bonus,
    zero_km: d.zero_km,
    cep_pernoite: d.cep_pernoite,
    veiculo_descricao: d.veiculo,
    veiculo_igual_anterior: d.veiculo_igual_anterior,
    fim_vigencia_anterior: d.fim_vigencia_anterior,
    seguradora_anterior: d.seguradora_anterior,
    apolice_anterior: d.apolice_anterior,
    condutor_principal: d.condutor_principal,
    tipo_residencia: d.tipo_residencia,
    tipo_construcao: d.tipo_construcao,
    tipo_contratacao: d.tipo_contratacao,
    telhado_isopainel: d.telhado_isopainel,
    objeto_seguro: d.objeto_seguro,
    valor_em_risco: d.valor_em_risco,
    limite_maximo_garantia: d.limite_maximo_garantia,
    valor_de_novo: d.valor_de_novo,
    atividade_local: d.atividade_local,
    local_segurado: d.local_segurado,
    profissao: d.profissao,
    esporte_radical: d.esporte_radical,
    pacote_contratado: d.pacote_contratado,
    num_empregados: d.num_empregados,
    num_socios: d.num_socios,
    num_segurados: d.num_segurados,
    capital_total_segurado: d.capital_total_segurado,
    capital_total_empregados: d.capital_total_empregados,
    capital_total_socios: d.capital_total_socios,
    franquia_tipo: d.franquia_tipo,
    franquia_valor: d.franquia_valor,
    cpf_cnpj_segurado: d.cpf_cnpj,
    segurado_email: d.email,
    segurado_telefone: d.telefone,
    segurado_endereco: d.endereco.logradouro,
    segurado_numero: d.endereco.numero,
    segurado_complemento: d.endereco.complemento,
    segurado_bairro: d.endereco.bairro,
    segurado_cep: d.endereco.cep,
    segurado_cidade: d.endereco.cidade,
    segurado_uf: d.endereco.uf,
    segurado_tipo_pessoa: d.cpf_cnpj && d.cpf_cnpj.length > 11 ? 'J' : 'F',
    versao_tabela: d.versao_tabela,
    condicoes_gerais: d.condicoes_gerais,
    cod_ci: d.cod_ci,
    grupo_codigo: d.grupo_codigo,
    tipo_seguro_descricao: d.tipo_seguro_descricao,
    parcelas_pdf: d.parcelas,
    assistencias: d.assistencias,
    dados_pdf: { ...d, texto_bruto: undefined },
    pdf_importado_em: new Date().toISOString(),
    status: 'ativo' as const,
  }
}

/**
 * Devolve o payload pronto para o relatório bruto Allianz
 * (allianz_apolices_relatorio).
 */
export function mapApoliceRelatorioPayload(
  d: AllianzPDFExtraido,
  tipo: 'emitida' | 'renovada',
) {
  return {
    tipo,
    numero_apolice: d.numero_apolice,
    numero_proposta: d.numero_proposta,
    endosso: d.numero_endosso,
    apolice_anterior: d.apolice_anterior,
    cliente_nome: d.cliente_nome,
    cpf_cnpj: d.cpf_cnpj,
    ramo: d.ramo || produtoLabel(d.produto),
    produto: produtoLabel(d.produto),
    emissao: d.emissao,
    vigencia_ini: d.vigencia_ini,
    vigencia_fim: d.vigencia_fim,
    premio_liquido: d.premio_liquido,
    premio_total: d.premio_total,
    forma_pagamento: d.forma_pagamento,
    qtd_parcelas: d.qtd_parcelas,
    dados: { ...d, texto_bruto: undefined },
  }
}

/**
 * Devolve os payloads das parcelas para `allianz_parcelas_emitidas`.
 */
export function mapParcelasPayload(d: AllianzPDFExtraido) {
  return d.parcelas
    .filter(p => p.parcela > 0)
    .map(p => ({
      numero_apolice: d.numero_apolice,
      numero_proposta: d.numero_proposta,
      parcela: p.parcela,
      total_parcelas: d.qtd_parcelas,
      cliente_nome: d.cliente_nome,
      cpf_cnpj: d.cpf_cnpj,
      ramo: d.ramo || produtoLabel(d.produto),
      vencimento: p.vencimento,
      valor: p.valor,
      forma_pagamento: d.forma_pagamento,
      status: null,
      dados: p,
    }))
}

/**
 * Devolve as linhas para `apolice_coberturas` (tabela compartilhada com HDI).
 * tipo_registro = '06' (cobertura adicional, é a única usada por planos de
 * cliente final). Para Vida, `is_segurada` recebe o capital.
 */
export function mapCoberturasPayload(d: AllianzPDFExtraido, apolice_id: string) {
  return d.coberturas.map((c, i) => ({
    apolice_id,
    tipo_registro: '06',
    numero_item: i + 1,
    codigo_cobertura: null,
    codigo_cobertura_tabela: null,
    is_segurada: c.capital ?? c.lmi_valor ?? null,
    valor_franquia: c.franquia_minima,
    tipo_franquia: c.franquia_pct != null ? 'P' : null,
    descricao: c.nome + (c.lmi_texto ? ` — LMI ${c.lmi_texto}` : ''),
    premio_liquido: c.premio,
    premio_anual: c.premio,
  }))
}

/**
 * Devolve as linhas para `apolice_clausulas`.
 */
export function mapClausulasPayload(d: AllianzPDFExtraido, apolice_id: string) {
  return d.clausulas.map(c => ({
    apolice_id,
    codigo_clausula: c.codigo,
    descricao_clausula: c.descricao,
    codigo_ramo: d.ramo,
    codigo_modalidade: null,
    is_segurada: null,
    premio_liquido: null,
    premio_anual: null,
  }))
}

/**
 * Devolve a linha para `apolice_itens_auto` (somente Auto).
 */
export function mapItemAutoPayload(d: AllianzPDFExtraido, apolice_id: string) {
  if (d.produto !== 'auto') return null
  // ano_modelo pode vir "2023" ou "2022/2023"
  const yrMatch = (d.ano_modelo || '').match(/(\d{4})\/?(\d{4})?/)
  return {
    apolice_id,
    numero_item: 1,
    marca: (d.veiculo || '').split(/\s+/)[0] || null,
    modelo: d.veiculo,
    ano_fabricacao: yrMatch ? parseInt(yrMatch[1], 10) : null,
    ano_modelo: yrMatch ? parseInt(yrMatch[2] || yrMatch[1], 10) : null,
    placa: d.placa,
    chassi: d.chassi,
    cep_pernoite: d.cep_pernoite,
    bonus_nivel: d.classe_bonus,
    descricao_cobertura: null,
    ci_atual: d.cod_ci,
    ci_anterior: null,
    qtd_sinistros: null,
    valor_fipe: null,
    combustivel: /Gas\.?\b/i.test(d.veiculo || '') ? 'G' : null,
  }
}

/**
 * Devolve a linha para `apolice_locais` (PME / Residência).
 */
export function mapLocalSeguradoPayload(d: AllianzPDFExtraido, apolice_id: string) {
  if (!d.local_segurado) return null
  return {
    apolice_id,
    local_codigo: '1',
    endereco: d.local_segurado.endereco,
    cidade: d.local_segurado.cidade,
    uf: d.local_segurado.uf,
    cep: d.local_segurado.cep,
    descricao_atividade: d.atividade_local,
    descricao_construcao: d.tipo_construcao,
    descricao_bem_segurado: d.tipo_contratacao || d.objeto_seguro,
    descricao_plano: d.pacote_contratado || produtoLabel(d.produto),
  }
}

/**
 * Devolve a linha para `apolice_motoristas` (condutor principal Auto).
 */
export function mapMotoristaPayload(d: AllianzPDFExtraido, apolice_id: string) {
  if (!d.condutor_principal) return null
  const c = d.condutor_principal
  return {
    apolice_id,
    tipo_registro: '07',
    numero_item: 1,
    nome: c.nome,
    descricao_fator: c.estado_civil,
    descricao_subfator: c.residencia,
    codigo_perfil: c.ampliar_18_25 ? 'AMPLIADO_18_25' : 'PADRAO',
    codigo_motorista: c.cpf,
  }
}

export function produtoLabel(p: AllianzProduto): string {
  switch (p) {
    case 'auto':            return 'Auto'
    case 'pme':             return 'Empresa PME'
    case 'residencia':      return 'Residência'
    case 'vida_coletivo':   return 'Vida Coletivo'
    case 'vida_individual': return 'Vida Individual'
    default:                return 'Desconhecido'
  }
}
