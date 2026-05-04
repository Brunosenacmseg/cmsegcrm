// Parser de PDFs de apólices Allianz.
//
// Suporta os 5 produtos vistos no portal:
//   - Auto (Automóvel) ........... Ramo 31
//   - Empresa PME ................ Ramo 18
//   - Residência ................. Ramo 14
//   - Vida Coletivo (Global) ..... Ramo 93
//   - Vida Individual ............ Ramo 91
//
// Estratégia: extrai o texto bruto com `unpdf` (pdf.js serverless) e
// aplica regex tolerantes a quebra de linha. Nunca falha — campos não
// encontrados retornam null e ficam disponíveis como `texto_bruto`
// para conferência manual / debug.

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
  vencimento: string | null  // YYYY-MM-DD ou 'a vista'
  valor: number | null
}

export type CoberturaPDF = {
  nome: string
  lmi: number | null
  premio: number | null
}

export type AllianzPDFExtraido = {
  produto: AllianzProduto
  ramo: string | null

  numero_apolice: string | null
  numero_proposta: string | null
  numero_endosso: string | null

  emissao: string | null
  vigencia_ini: string | null
  vigencia_fim: string | null

  cliente_nome: string | null
  cpf_cnpj: string | null
  email: string | null
  telefone: string | null
  endereco: string | null

  premio_liquido: number | null
  premio_total: number | null
  iof: number | null
  forma_pagamento: string | null
  qtd_parcelas: number | null
  parcelas: ParcelaPDF[]

  // Auto
  veiculo: string | null
  placa: string | null
  chassi: string | null
  ano_modelo: string | null
  cod_fipe: string | null
  classe_bonus: string | null
  apolice_anterior: string | null
  seguradora_anterior: string | null

  // Local segurado (PME / Residência)
  local_endereco: string | null
  local_cep: string | null

  coberturas: CoberturaPDF[]

  // Texto bruto truncado (pra ficar no JSONB sem explodir)
  texto_bruto: string

  warnings: string[]
}

// ────────── helpers ──────────
const TRUNC_TEXTO = 60_000

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

// ────────── extração de texto ──────────
export async function extrairTextoPDF(buffer: Buffer | ArrayBuffer | Uint8Array): Promise<string> {
  // Buffer estende Uint8Array, então a checagem cobre os dois.
  const u8: Uint8Array = buffer instanceof Uint8Array
    ? buffer
    : new Uint8Array(buffer)
  const pdf = await getDocumentProxy(u8)
  const result = await extractText(pdf, { mergePages: true })
  return typeof result.text === 'string' ? result.text : (result.text as string[]).join('\n')
}

// ────────── detecção de produto ──────────
export function detectarProduto(texto: string): AllianzProduto {
  const upper = texto.toUpperCase()

  // 1. Match por código de Ramo, que é o mais confiável (aparece no header)
  const ramo = upper.match(/RAMO[:\s]*(\d{2})\b/)
  if (ramo && ALLIANZ_RAMO_NOME[ramo[1]]) return ALLIANZ_RAMO_NOME[ramo[1]]

  // 2. Match por marcadores textuais únicos de cada produto
  if (/VIDA\s+INDIVIDUAL/.test(upper) && /PACOTE\s+CONTRATADO/.test(upper)) return 'vida_individual'
  if (/VIDA\s+GLOBAL\s+TRADICIONAL/.test(upper) || /CAPITAL\s+TOTAL\s+SEGURADO/.test(upper)) return 'vida_coletivo'
  if (/AUTOM[ÓO]VEL/.test(upper) && /CHASSI/.test(upper)) return 'auto'
  if (/EMPRESA\s+PME/.test(upper) || /ALLIANZ\s+EMPRESA/.test(upper)) return 'pme'
  if (/ALLIANZ\s+RESID[ÊE]NCIA/.test(upper) || /TIPO\s+DE\s+RESID[ÊE]NCIA/.test(upper)) return 'residencia'

  return 'desconhecido'
}

// ────────── parser principal ──────────
export async function parseAllianzPDF(buffer: Buffer | ArrayBuffer | Uint8Array): Promise<AllianzPDFExtraido> {
  const texto = await extrairTextoPDF(buffer)
  return parseAllianzTexto(texto)
}

export function parseAllianzTexto(texto: string): AllianzPDFExtraido {
  const t = texto.replace(/\r/g, '')
  const warnings: string[] = []

  const produto = detectarProduto(t)
  if (produto === 'desconhecido') {
    warnings.push('Produto Allianz não identificado a partir do texto do PDF.')
  }

  const ramo = pick(t, /Ramo[:\s]*(\d{2})\b/i)

  // ─── identificadores ───
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

  // ─── datas ───
  const emissao = brToIsoDate(pickAny(t, [
    /(?:Data\s+de\s+)?Emiss[ãa]o[:\s]*(\d{2}\/\d{2}\/\d{4})/i,
  ]))

  let vigencia_ini: string | null = null
  let vigencia_fim: string | null = null
  // padrão: "Vigência ... 24H de DD/MM/YYYY ... 24H de DD/MM/YYYY"
  // ou "VIGÊNCIA DO CONTRATO: das 24H de DD/MM/YYYY às 24H de DD/MM/YYYY"
  const vig = t.match(/Vig[êe]ncia[^\n]{0,80}?(\d{2}\/\d{2}\/\d{4})[^\n]{0,40}?(\d{2}\/\d{2}\/\d{4})/i)
  if (vig) {
    vigencia_ini = brToIsoDate(vig[1])
    vigencia_fim = brToIsoDate(vig[2])
  }

  // ─── cliente ───
  const cpf_cnpj = onlyDigits(pickAny(t, [
    /CPF\/CNPJ[:\s]*([\d.\/-]{11,18})/i,
    /CNPJ[:\s]*([\d.\/-]{14,18})/i,
    /\bCPF[:\s]*([\d.\/-]{11,14})/i,
  ]))

  const cliente_nome = pickAny(t, [
    // "Olá BRUNO PEREIRA BONACCORSI DE SENA," (header de boas-vindas)
    /Ol[áa]\s+([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,80}?)\s*[,\n]/,
    /Segurado[:\s]+([^\n]+?)(?=\s+(?:CPF|CNPJ|Nome\s+Social|N[ºo]|$))/i,
    /SEGURADO[:\s]+([^\n]+?)(?=\s+(?:CPF|CNPJ|ENDERE[ÇC]O|$))/i,
    /Nome[:\s]+([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,80}?)(?=\s+(?:CPF|CNPJ|$))/,
  ])

  const email = pick(t, /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/i)
  const telefone = (() => {
    // formato (XX) 9XXXX-XXXX ou similares
    const m = t.match(/\(?(\d{2})\)?\s*9?\d{4}[-\s]?\d{4}/)
    if (!m) return null
    return m[0].replace(/\s+/g, ' ').trim()
  })()
  const endereco = pickAny(t, [
    /Endere[çc]o[:\s]+([^\n]+?\d{5}-?\d{3}[^\n]*?)(?=\s+(?:Bairro|Cidade|INFORMA[ÇC]|CONDUTOR|$))/i,
  ])

  // ─── pagamento ───
  const premio_liquido = brToNum(pickAny(t, [
    /Pr[êe]mio\s*L[íi]quido[:\s()R$]*([\d.,]+)/i,
    /Pre[çc]o\s*l[íi]quido[:\s()R$]*([\d.,]+)/i,
  ]))
  const premio_total = brToNum(pickAny(t, [
    /Pr[êe]mio\s*Total[^\n]*?([\d.,]+)/i,
    /Pre[çc]o\s*Total[^\n]*?([\d.,]+)/i,
    /Total\s*a\s*[Pp]agar[^\n]*?([\d.,]+)/i,
  ]))
  const iof = brToNum(pick(t, /IOF[:\s()R$]*([\d.,]+)/i))
  const forma_pagamento = pickAny(t, [
    /Forma\s*de\s*[Pp]agamento[:\s]*([^\n]+?)(?=\s+(?:N[ºo]|Pr[êe]mio|Pre[çc]o|Taxa|Valor|$))/i,
    /(Boleto\s+Banc[áa]rio|Cart[ãa]o\s+de\s+Cr[ée]dito|D[ée]bito\s+(?:em\s+conta|autom[áa]tico))/i,
  ])
  const qtd_parcelas = (() => {
    const x = pickAny(t, [
      /N[ºo]\s*de\s*Parcelas[:\s]*(\d{1,2})/i,
      /em\s+(\d{1,2})\s+parcelas/i,
    ])
    const n = x ? parseInt(x, 10) : NaN
    return isFinite(n) && n > 0 && n <= 60 ? n : null
  })()

  // ─── parcelas ───
  // padrão: "<N> [à vista|DD/MM/YYYY] <valor>"
  // O texto extraído normalmente coloca cada coluna em sequência:
  //   "1 21/03/2026 R$ 1.411,55  6 01/09/2026 R$ 1.411,55"
  const parcelas: ParcelaPDF[] = []
  // (a) parcela com data
  const reParcData = /(?<![.\d])(\d{1,2})\s+(\d{2}\/\d{2}\/\d{4})\s+R?\$?\s*([\d.,]+)/g
  let mp: RegExpExecArray | null
  while ((mp = reParcData.exec(t)) !== null) {
    const p = parseInt(mp[1], 10)
    const v = brToIsoDate(mp[2])
    const val = brToNum(mp[3])
    if (p >= 1 && p <= 60 && val != null && val > 0 && val < 1_000_000) {
      parcelas.push({ parcela: p, vencimento: v, valor: val })
    }
  }
  // (b) "1 à vista <valor>"
  const reParcVista = /(?<![.\d])(\d{1,2})\s+[àa]\s+vista\s+R?\$?\s*([\d.,]+)/gi
  while ((mp = reParcVista.exec(t)) !== null) {
    const p = parseInt(mp[1], 10)
    const val = brToNum(mp[2])
    if (p >= 1 && p <= 60 && val != null && val > 0) {
      parcelas.push({ parcela: p, vencimento: 'a vista', valor: val })
    }
  }
  // dedup
  const seenP = new Set<string>()
  const parcelasUnique = parcelas
    .filter(p => {
      const k = `${p.parcela}|${p.vencimento}|${p.valor}`
      if (seenP.has(k)) return false
      seenP.add(k); return true
    })
    .sort((a, b) => a.parcela - b.parcela)

  if (qtd_parcelas && parcelasUnique.length && parcelasUnique.length !== qtd_parcelas) {
    warnings.push(`Detectadas ${parcelasUnique.length} parcelas no texto, mas o PDF informa ${qtd_parcelas}.`)
  }

  // ─── específico Auto ───
  const veiculo = pickAny(t, [
    /Ve[íi]culo[:\s]+([^\n]+?)(?=\s+(?:C[óo]d\.?\s*FIPE|Placa|Chassi|Vers[ãa]o|Emiss[ãa]o|Ramo|Produto|$))/i,
  ])
  const placa = pick(t, /Placa[:\s]+([A-Z0-9]{6,8})/i)
  const chassi = pick(t, /Chassi[:\s]+([A-Z0-9]{15,20})/i)
  const ano_modelo = pick(t, /Ano\s*\/?\s*Modelo[:\s]*([\d\/]+)/i)
  const cod_fipe = pick(t, /C[óo]d\.?\s*FIPE[:\s]*([\d-]+)/i)
  const classe_bonus = pick(t, /Classe\s*B[ôo]nus[:\s]*(\d{1,2})/i)
  const apolice_anterior = pick(t, /N[ºo]\.?\s*Ap[óo]lice\s*Anterior[:\s]*([0-9A-Z]+)/i)
  const seguradora_anterior = pick(t, /Seguradora\s*Anterior[:\s]*([^\n]+?)(?=\s+(?:Fim|V[ée]iculo|C[óo]d|$))/i)

  // ─── específico PME / Residência ───
  const local_endereco = pickAny(t, [
    /Endere[çc]o\s*do\s*local\s*segurado[:\s]+([^\n]+?)(?=\s+(?:Atividade|Tipo|Produto|Ramo|$))/i,
  ])
  const local_cep = pickAny(t, [
    /CEP\s*Pernoite[:\s]*(\d{5}-?\d{3})/i,
    /\bCEP[:\s]*(\d{5}-?\d{3})/i,
  ])

  return {
    produto,
    ramo,
    numero_apolice,
    numero_proposta,
    numero_endosso,
    emissao,
    vigencia_ini,
    vigencia_fim,
    cliente_nome,
    cpf_cnpj,
    email,
    telefone,
    endereco,
    premio_liquido,
    premio_total,
    iof,
    forma_pagamento,
    qtd_parcelas,
    parcelas: parcelasUnique,
    veiculo,
    placa,
    chassi,
    ano_modelo,
    cod_fipe,
    classe_bonus,
    apolice_anterior,
    seguradora_anterior,
    local_endereco,
    local_cep,
    coberturas: [], // extração granular fica para uma 2a iteração; texto_bruto preserva o original
    texto_bruto: texto.length > TRUNC_TEXTO ? texto.slice(0, TRUNC_TEXTO) + '\n[...TRUNCADO...]' : texto,
    warnings,
  }
}

// ────────── mapeamento para os tabelas do CRM ──────────

/**
 * Devolve o payload pronto para insert/upsert em `apolices`.
 * `cliente_id` precisa ser resolvido fora.
 */
export function mapApolicePayload(d: AllianzPDFExtraido, cliente_id: string) {
  return {
    cliente_id,
    numero: d.numero_apolice,
    proposta: d.numero_proposta,
    endosso: d.numero_endosso,
    seguradora: 'Allianz',
    ramo: produtoLabel(d.produto),
    produto: produtoLabel(d.produto),
    emissao: d.emissao,
    vigencia_ini: d.vigencia_ini,
    vigencia_fim: d.vigencia_fim,
    premio: d.premio_total,
    premio_liquido: d.premio_liquido,
    qtd_parcelas: d.qtd_parcelas,
    tipo_pagamento: d.forma_pagamento,
    placa: d.placa,
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
    dados: { ...d, texto_bruto: undefined }, // dados estruturados sem o texto bruto pra economizar
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
      vencimento: p.vencimento && p.vencimento !== 'a vista' ? p.vencimento : null,
      valor: p.valor,
      forma_pagamento: d.forma_pagamento,
      status: null,
      dados: p,
    }))
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
