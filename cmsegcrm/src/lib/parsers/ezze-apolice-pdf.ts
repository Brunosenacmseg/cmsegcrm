// Parser de apólices em PDF da Ezze Seguros.
// Suporta dois layouts:
//  1. Auto Individual (cabeçalho "APÓLICE SEGURO AUTO INDIVIDUAL")
//  2. RC Transporte / Carta Verde ("SEGURO DE RESPONSABILIDADE CIVIL DAS EMPRESAS DE TRANSPORTE…")
//
// Devolve `Record<string, any>[]` no formato consumido por mapApolice na rota
// /api/seguradoras/[id]/import (chaves seguem os hints de pick(): Apolice,
// CPF/CNPJ, Segurado, Produto, Premio, Vigencia Inicial, Vigencia Final, Placa,
// Status). Campos extras (Endosso, Proposta, Veículo, etc.) são preservados em
// dados (jsonb) automaticamente porque mapApolice copia row inteiro lá.

import pdfParse from 'pdf-parse'

export type EzzeApoliceRow = Record<string, any>

const norm = (s: string) =>
  s.toLowerCase()
   .normalize('NFD')
   .replace(/[̀-ͯ]/g, '')
   .replace(/\s+/g, ' ')
   .trim()

function toIso(d: string | null | undefined): string | null {
  if (!d) return null
  const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function brNum(s: string | null | undefined): number | null {
  if (s == null) return null
  const t = String(s).replace(/[R$\s%]/g, '')
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return isFinite(n) ? n : null
}

function clean(s: string | null | undefined): string | null {
  if (s == null) return null
  const t = s.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

export type EzzeLayout = 'auto' | 'rc' | 'unknown'

export function detectEzzeLayout(text: string): EzzeLayout {
  const n = norm(text)
  if (n.includes('apolice seguro auto individual') || n.includes('dados da apolice')) return 'auto'
  if (n.includes('seguro de responsabilidade civil') ||
      /apolice\s+numero\s*:/.test(n) ||
      n.includes('garantido por ezze seguros'))
    return 'rc'
  return 'unknown'
}

// ─────────────────── Auto Individual ───────────────────
function parseAuto(rawText: string): EzzeApoliceRow {
  const text = rawText.replace(/ /g, ' ').replace(/[ \t]+/g, ' ')

  const re = (r: RegExp) => r.exec(text)?.[1]?.trim() ?? null

  const apolice    = re(/N[ºo°]\s*Ap[oó]lice\s*:?\s*(\d+)/i)
  const endosso    = re(/Endosso\s*:?\s*(\d+)/i)
  const proposta   = re(/Proposta\s*:?\s*(\d+)/i)
  const versao     = re(/Vers[aã]o\s*:?\s*([\d.]+)/i)
  const ruleId     = re(/Rule\s*ID\s*:?\s*(\d+)/i)
  const codigoCi   = re(/C[oó]digo\s*CI\s*:?\s*(\d+)/i)
  const tipoSeguro = re(/Tipo\s+de\s+Seguro\s*:?\s*([^\n]+?)(?:\s*Classe|\s*\n)/i)
  const classeBonus = re(/Classe\s*b[oô]nus\s*:?\s*(\d+)/i)
  const dataEmissao = re(/Data\s+da\s+Emiss[aã]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)

  // "das 00:00 do dia 16/03/2026 até 23:59 do dia 16/03/2027"
  const vig = /das?\s+\d{1,2}\s*:\s*\d{2}\s*h?\s*do\s+dia\s+(\d{2}\/\d{2}\/\d{4})\s+at[eé]\s+\d{1,2}\s*:\s*\d{2}\s*h?\s*do\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i.exec(text)

  // Bloco Segurado: o "Nome:" do segurado aparece antes do bloco "Corretor"
  const segBlock = /Segurado([\s\S]*?)(?=\bCorretor\b|Question[aá]rio)/i.exec(text)?.[1] ?? ''
  const segNome = re(/Nome\s*:?\s*([A-Za-zÀ-ÿ&\.\-' ]{3,100}?)\s*(?:Nome Social|CPF|\n)/i)
                  ?? re(new RegExp(/Nome\s*:?\s*\n?\s*([A-Za-zÀ-ÿ&\.\-' ]{3,100}?)\s*\n/.source, 'i'))
  const segNomeFromBlock = clean(segBlock.match(/Nome\s*:?\s*([^\n]{3,120})/i)?.[1])

  const cpfCnpjMatch = /CPF\/?CN(?:PJ|P)\s*:?\s*([\d\.\/\-]{11,18})/i.exec(segBlock)
                    ?? /CPF\/?CN(?:PJ|P)\s*:?\s*([\d\.\/\-]{11,18})/i.exec(text)
  const cpfCnpj = cpfCnpjMatch?.[1]?.replace(/\D/g, '') ?? null

  const email = re(/E-?mail\s*:?\s*([\w.\-+]+@[\w.\-]+\.[A-Za-z]{2,})/i)
  const telMatch = /Telefone\s*:?\s*\(?(\d{2})\)?\s*(\d{4,5}-?\d{4})/i.exec(text)
  const telefone = telMatch ? `(${telMatch[1]}) ${telMatch[2]}` : null
  const cep = re(/CEP\s*:?\s*(\d{5}-?\d{3})/i)
  const cidadeUf = /Cidade\s*:?\s*([A-Za-zÀ-ÿ' \-]+?)\s+UF\s*:?\s*([A-Z]{2})/i.exec(text)

  // Corretor (bloco entre "Corretor" e "Question…/Dados do Veículo")
  const corBlock = /Corretor([\s\S]*?)(?=Question[aá]rio|Dados do Ve[ií]culo|Dados de Pagamento|$)/i.exec(text)?.[1] ?? ''
  const corretorNome = clean(corBlock.match(/Corretor\s*:?\s*\n?([^\n]+(?:\n[^\n]+)?)/i)?.[1])
                    ?? clean(corBlock.split('\n').find(l => /CORRETORA|LTDA|S\/A|S\.A\./i.test(l)))
  const corretorCnpj = corBlock.match(/CPF\/?CN(?:PJ|P)\s*:?\s*([\d\.\/\-]{11,18})/i)?.[1]?.replace(/\D/g, '') ?? null
  const corretorSusep = re(/SUSEP\s*:?\s*\n?\s*(\d{6,12})/i)
  const filialEzze = re(/Filial\s+Ezze\s*:?\s*([^\n]+)/i)

  // Veículo
  const marca   = re(/Marca\s*:?\s*\n?\s*([A-Za-zÀ-ÿ\- ]{2,40}?)\s*(?:\n|Zero)/i)
  const modelo  = re(/Modelo\s*:?\s*\n?\s*([A-Za-z0-9À-ÿ\.\-\/\(\) ]{2,80}?)\s*\n/i)
  const ano     = re(/Ano\s*Modelo\s*:?\s*\n?\s*(\d{4})/i)
  const placa   = re(/Placa\s*:?\s*\n?\s*([A-Z0-9]{7})/i)
  const chassi  = re(/Chassi\s*:?\s*\n?\s*([A-Z0-9]{17})/i)
  const fipe    = re(/(?:C[oó]d\.?|C[oó]digo)\s*FIPE\s*:?\s*\n?\s*([\w\-]+)/i)
  const zeroKm  = re(/Zero\s*KM\s*:?\s*\n?\s*(Sim|N[aã]o)/i)
  const blindagem = re(/Blindagem\s*:?\s*\n?\s*(Sim|N[aã]o)/i)

  // Prêmio
  const premioLiq    = re(/Pr[eê]mio\s+L[ií]quido(?:\s+Total)?\s*:?\s*\n?\s*([\d\.\,]+)/i)
  const iof          = re(/IOF\s*:?\s*\n?\s*([\d\.\,]+)/i)
  const premioTotal  = re(/PR[ÊE]MIO\s+TOTAL\s*:?\s*\n?\s*([\d\.\,]+)/i)
  const fracionamento = re(/Adicional\s+Fracionamento\s*:?\s*\n?\s*([\d\.\,]+)/i)

  // Forma e parcelas
  const formaPagamento = re(/Forma\s+de\s+Pagamento\s*:?\s*([^\n]+)/i)

  return {
    'Apolice':            apolice,
    'Endosso':            endosso,
    'Proposta':           proposta,
    'Versao':             versao,
    'RuleID':             ruleId,
    'CodigoCI':           codigoCi,
    'TipoSeguro':         tipoSeguro,
    'ClasseBonus':        classeBonus,
    'DataEmissao':        toIso(dataEmissao),
    'Vigencia Inicial':   toIso(vig?.[1]),
    'Vigencia Final':     toIso(vig?.[2]),
    'Segurado':           segNomeFromBlock ?? segNome,
    'CPF/CNPJ':           cpfCnpj,
    'Email':              email,
    'Telefone':           telefone,
    'CEP':                cep,
    'Cidade':             clean(cidadeUf?.[1]),
    'UF':                 cidadeUf?.[2] ?? null,
    'Corretor':           corretorNome,
    'CorretorCNPJ':       corretorCnpj,
    'CorretorSUSEP':      corretorSusep,
    'FilialEzze':         filialEzze,
    'Marca':              marca,
    'Modelo':             modelo,
    'AnoModelo':          ano,
    'Placa':              placa,
    'Chassi':             chassi,
    'CodFIPE':            fipe,
    'ZeroKM':             zeroKm,
    'Blindagem':          blindagem,
    'PremioLiquido':      brNum(premioLiq),
    'AdicionalFracionamento': brNum(fracionamento),
    'IOF':                brNum(iof),
    'Premio':             brNum(premioTotal) ?? brNum(premioLiq),
    'FormaPagamento':     formaPagamento,
    'Produto':            'Auto Individual',
    'Ramo':               'Auto',
    'Status':             'ativo',
    'LayoutPDF':          'ezze-auto',
  }
}

// ─────────────────── RC Transporte (Carta Verde) ───────────────────
function parseRC(rawText: string): EzzeApoliceRow[] {
  const text = rawText.replace(/ /g, ' ').replace(/[ \t]+/g, ' ')
  const re = (r: RegExp) => r.exec(text)?.[1]?.trim() ?? null

  const apolice  = re(/Ap[oó]lice\s+N[uú]mero\s*:?\s*(\d+)/i)
  const proposta = re(/N[uú]mero\s+da\s+Proposta\s*:?\s*(\d+)/i)
  const endosso  = re(/(?:^|\n)\s*Endosso\s*:?\s*(\d+)/i)
  const ramo     = re(/(?:^|\n)\s*Ramo\s*:?\s*(\d+)/i)
  const sucursal = re(/Sucursal\s*:?\s*(\d+)/i)
  const codigoSusepSeg = re(/C[oó]digo\s*SUSEP\s*:?\s*(\d+)/i)
  const dataEmissao = re(/Dt\.?\s*Emiss[aã]o\s+Ap[oó]lice\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)
  const faturamento = re(/Faturamento\s*:?\s*(\d+)/i)

  const vig = /Das?\s+\d{1,2}\s*:\s*\d{2}\s*h?\s*do\s+dia\s+(\d{2}\/\d{2}\/\d{4})\s+at[eé]\s+\d{1,2}\s*:\s*\d{2}\s*h?\s*do\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i.exec(text)

  const segBlock = /SEGURADO([\s\S]*?)(?=CORRETOR|Pr[eê]mio\s*\(EM)/i.exec(text)?.[1] ?? ''
  const segNome = clean(segBlock.match(/Nome\s*:?\s*([^\n]+?)(?:\s*CPF\/?CN[PJ]?|\n)/i)?.[1])
  const cpfCnpjMatch = segBlock.match(/CPF\/?CN[PJ]?\s*:?\s*([\d\.\/\-]{11,18})/i)
                    ?? text.match(/CPF\/?CN[PJ]?\s*:?\s*([\d\.\/\-]{11,18})/i)
  const cpfCnpj = cpfCnpjMatch?.[1]?.replace(/\D/g, '') ?? null
  const endereco = clean(segBlock.match(/Endere[cç]o\s*:?\s*([^\n]+)/i)?.[1])
  const cep = clean(segBlock.match(/CEP\s*:?\s*(\d{5}-?\d{3})/i)?.[1])
  const cidadeMatch = segBlock.match(/Cidade\s*:?\s*([^\n]+?)(?:\s*UF\s*:?\s*([A-Z]{2})|\n)/i)
  const cidade = clean(cidadeMatch?.[1])
  const uf = cidadeMatch?.[2] ?? clean(segBlock.match(/UF\s*:?\s*([A-Z]{2})/i)?.[1])

  const corBlock = /CORRETOR([\s\S]*?)(?=Pr[eê]mio\s*\(EM|VE[IÍ]CULO|PARCELAMENTO)/i.exec(text)?.[1] ?? ''
  const corretorNome = clean(corBlock.match(/Nome\s+do\s+Corretor\s*:?\s*([^\n]+?)(?:\s*C[oó]digo\s*Susep|\n)/i)?.[1])
  const corretorSusep = clean(corBlock.match(/C[oó]digo\s+Susep\s*:?\s*(\d+)/i)?.[1])

  // Prêmios — bloco "Prêmio (EM R$)" tem header e depois valores; usamos look-ahead simples
  const premBlock = /Pr[eê]mio\s*\(EM\s*R\$\)([\s\S]*?)(?=PARCELAMENTO|VE[IÍ]CULO|OBSERVA)/i.exec(text)?.[1] ?? text
  const numbers = [...premBlock.matchAll(/([\d\.\,]+)/g)].map(m => brNum(m[1])).filter(n => n != null) as number[]
  // Layout: PrêmioLíquido, AdicFrac, CustoApólice, IOF, ..., PrêmioTotal
  const premioLiquido = numbers[0] ?? null
  const adicFrac = numbers[1] ?? null
  const custoApolice = numbers[2] ?? null
  const iof = numbers[3] ?? null
  const premioTotal = numbers.length >= 5 ? numbers[numbers.length - 1] : (numbers[4] ?? null)

  const baseRow: EzzeApoliceRow = {
    'Apolice':           apolice,
    'Proposta':          proposta,
    'Endosso':           endosso,
    'CodigoRamo':        ramo,
    'Sucursal':          sucursal,
    'CodigoSUSEPSeg':    codigoSusepSeg,
    'Faturamento':       faturamento,
    'DataEmissao':       toIso(dataEmissao),
    'Vigencia Inicial':  toIso(vig?.[1]),
    'Vigencia Final':    toIso(vig?.[2]),
    'Segurado':          segNome,
    'CPF/CNPJ':          cpfCnpj,
    'Endereco':          endereco,
    'CEP':               cep,
    'Cidade':            cidade,
    'UF':                uf,
    'Corretor':          corretorNome,
    'CorretorSUSEP':     corretorSusep,
    'PremioLiquido':     premioLiquido,
    'AdicionalFracionamento': adicFrac,
    'CustoApolice':      custoApolice,
    'IOF':               iof,
    'Premio':            premioTotal ?? premioLiquido,
    'Produto':           'RC Transporte Coletivo Rodoviário',
    'Ramo':              'RC Transporte',
    'Status':            'ativo',
    'LayoutPDF':         'ezze-rc-transporte',
  }

  // Captura cada bloco "VEÍCULO ITEM N.: <n>"
  const veiculoBlocks: Array<{ item: string; block: string }> = []
  const veicRe = /VE[IÍ]CULO\s+ITEM\s+N\.?\s*:?\s*(\d+)([\s\S]*?)(?=VE[IÍ]CULO\s+ITEM\s+N\.?\s*:|OBSERVA[CÇ][OÕ]ES|$)/gi
  let m: RegExpExecArray | null
  while ((m = veicRe.exec(text)) !== null) {
    veiculoBlocks.push({ item: m[1], block: m[2] })
  }

  if (!veiculoBlocks.length) return [baseRow]

  return veiculoBlocks.map(({ item, block }) => {
    const fab = clean(block.match(/Fabricante\s*:?\s*([^\n]+?)(?:\s*Nr\s+Passageiro|\n)/i)?.[1])
    const veic = clean(block.match(/(?:^|\n)\s*Ve[ií]culo\s*:?\s*([^\n]+?)(?:\s*Prefixo|\n)/i)?.[1])
    const licenca = clean(block.match(/Licen[cç]a\s*:?\s*([A-Z0-9]+)/i)?.[1])
    const chassi = clean(block.match(/Chassi\s*:?\s*([A-Z0-9]{17})/i)?.[1])
    const fabModelo = clean(block.match(/Fabrica[cç][aã]o\/Modelo\s*:?\s*([\d\/]+)/i)?.[1])
    const tipoVeic = clean(block.match(/Tipo\s+de\s+Ve[ií]culo\s*:?\s*([^\n]+)/i)?.[1])
    const utilizacao = clean(block.match(/Utiliza[cç][aã]o\s+do\s+Ve[ií]culo\s*:?\s*([^\n]+?)(?:\s*Tipo|\n)/i)?.[1])
    const passageiros = clean(block.match(/Nr\s+Passageiro\s*:?\s*(\d+)/i)?.[1])
    return {
      ...baseRow,
      'ItemVeiculo':       Number(item),
      'Marca':             fab,
      'Modelo':            veic,
      'FabricacaoModelo':  fabModelo,
      'Placa':             licenca,
      'Chassi':            chassi,
      'TipoVeiculo':       tipoVeic,
      'UtilizacaoVeiculo': utilizacao,
      'NrPassageiros':     passageiros,
    }
  })
}

export interface ParseEzzeResult {
  layout: EzzeLayout
  rows: EzzeApoliceRow[]
  textoBruto: string
}

export async function parseEzzeApolicePdf(buffer: Buffer | Uint8Array): Promise<ParseEzzeResult> {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const parsed = await pdfParse(buf)
  const texto = parsed.text || ''
  const layout = detectEzzeLayout(texto)
  if (layout === 'auto') return { layout, rows: [parseAuto(texto)], textoBruto: texto }
  if (layout === 'rc')   return { layout, rows: parseRC(texto), textoBruto: texto }
  throw new Error('Layout de apólice Ezze não reconhecido. Esperado: Auto Individual ou RC Transporte de Passageiros.')
}
