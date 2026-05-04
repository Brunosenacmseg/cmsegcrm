// Entry point unificado para parser de PROPOSTA em PDF.
// Mesma estratégia do `apolice-pdf.ts`: detecta a seguradora pelo texto e
// despacha para o parser correto. Cada parser de proposta acrescenta a
// coluna `status_proposta='em_analise'` e ajusta `produto`/`layout_pdf`.

import pdfParse from 'pdf-parse'

import { detectSeguradora, mapSeguradoraNome, type SeguradoraId } from './apolice-detector'

import { parsePropostaAllianz } from './proposta/allianz'
import { parsePropostaBradesco } from './proposta/bradesco'
import { parsePropostaHdi } from './proposta/hdi'
import { parsePropostaJustos } from './proposta/justos'
import { parsePropostaMapfre } from './proposta/mapfre'
import { parsePropostaNovo } from './proposta/novo'
import { parsePropostaPortoOuAzul } from './proposta/porto-azul'
import { parsePropostaSuhai } from './proposta/suhai'
import {
  parsePropostaTokio, parsePropostaYelum, parsePropostaYouse,
  parsePropostaZurich, parsePropostaDarwin, parsePropostaPier,
  parsePropostaKovr, parsePropostaEzze,
} from './proposta/wrappers'

import type { ApoliceRow } from './pdf-utils'

export interface ParsePropostaResult {
  seguradora: SeguradoraId
  layout: string
  rows: ApoliceRow[]
  textoBruto: string
}

export async function parsePropostaPdf(
  buffer: Buffer | Uint8Array,
  hintSeguradoraNome?: string | null,
): Promise<ParsePropostaResult> {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const parsed = await pdfParse(buf)
  const texto = parsed.text || ''

  let seg: SeguradoraId = detectSeguradora(texto)
  if (seg === 'unknown' && hintSeguradoraNome) {
    seg = mapSeguradoraNome(hintSeguradoraNome)
  }
  if (seg === 'unknown') {
    throw new Error(
      'Não foi possível identificar a seguradora desta proposta. ' +
      'Verifique se o PDF contém o nome da seguradora no cabeçalho/rodapé.'
    )
  }

  let rows: ApoliceRow[]
  switch (seg) {
    case 'allianz':  rows = parsePropostaAllianz(texto); break
    case 'azul':     rows = parsePropostaPortoOuAzul(texto, 'azul'); break
    case 'bradesco': rows = parsePropostaBradesco(texto); break
    case 'darwin':   rows = parsePropostaDarwin(texto); break
    case 'ezze':     rows = await parsePropostaEzze(texto, buf); break
    case 'hdi':      rows = parsePropostaHdi(texto); break
    case 'justos':   rows = parsePropostaJustos(texto); break
    case 'kovr':     rows = parsePropostaKovr(texto); break
    case 'mapfre':   rows = parsePropostaMapfre(texto); break
    case 'novo':     rows = parsePropostaNovo(texto); break
    case 'pier':     rows = parsePropostaPier(texto); break
    case 'porto':    rows = parsePropostaPortoOuAzul(texto, 'porto'); break
    case 'suhai':    rows = parsePropostaSuhai(texto); break
    case 'tokio':    rows = parsePropostaTokio(texto); break
    case 'yelum':    rows = parsePropostaYelum(texto); break
    case 'youse':    rows = parsePropostaYouse(texto); break
    case 'zurich':   rows = parsePropostaZurich(texto); break
    default: throw new Error(`Parser de proposta não implementado para seguradora '${seg}'.`)
  }

  const layout = String(rows[0]?.layout_pdf || `${seg}-proposta`)
  return { seguradora: seg, layout, rows, textoBruto: texto }
}
