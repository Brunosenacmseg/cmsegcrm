// Entry point unificado para parser de apólice em PDF.
//
// Fluxo:
//   1. Lê o PDF (pdf-parse) e extrai o texto.
//   2. Detecta qual seguradora emitiu (auto-detecção pelo texto, com hint
//      opcional vindo do registro `seguradoras.nome` selecionado pelo usuário).
//   3. Despacha para o parser específico daquela seguradora.
//   4. Devolve { seguradora, layout, rows, textoBruto } seguindo a mesma
//      assinatura de `parseEzzeApolicePdf` para manter compatibilidade.
//
// Cada parser recebe o texto cru e devolve uma lista de "linhas" no formato
// snake_case alinhado com as colunas de `seg_stage_apolices`.

import pdfParse from 'pdf-parse'

import { detectSeguradora, mapSeguradoraNome, type SeguradoraId } from './apolice-detector'

import { parseAllianz } from './apolice/allianz'
import { parseBradesco } from './apolice/bradesco'
import { parseDarwin } from './apolice/darwin'
import { parseEzze } from './apolice/ezze'
import { parseHdi } from './apolice/hdi'
import { parseJustos } from './apolice/justos'
import { parseKovr } from './apolice/kovr'
import { parseMapfre } from './apolice/mapfre'
import { parseNovo } from './apolice/novo'
import { parsePier } from './apolice/pier'
import { parsePortoOuAzul } from './apolice/porto-azul'
import { parseSuhai } from './apolice/suhai'
import { parseTokio } from './apolice/tokio'
import { parseYelum } from './apolice/yelum'
import { parseYouse } from './apolice/youse'
import { parseZurich } from './apolice/zurich'

import type { ApoliceRow } from './pdf-utils'

export interface ParseApoliceResult {
  seguradora: SeguradoraId
  layout: string
  rows: ApoliceRow[]
  textoBruto: string
}

export async function parseApolicePdf(
  buffer: Buffer | Uint8Array,
  hintSeguradoraNome?: string | null,
): Promise<ParseApoliceResult> {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const parsed = await pdfParse(buf)
  const texto = parsed.text || ''

  // 1. Tenta detectar pelo texto. 2. Se falhar e o usuário tiver selecionado
  //    uma seguradora cadastrada, usa o nome dela como pista.
  let seg: SeguradoraId = detectSeguradora(texto)
  if (seg === 'unknown' && hintSeguradoraNome) {
    seg = mapSeguradoraNome(hintSeguradoraNome)
  }
  if (seg === 'unknown') {
    throw new Error(
      'Não foi possível identificar a seguradora desta apólice. ' +
      'Verifique se o PDF contém o nome da seguradora no cabeçalho/rodapé.'
    )
  }

  let rows: ApoliceRow[]
  switch (seg) {
    case 'allianz':  rows = parseAllianz(texto); break
    case 'azul':     rows = parsePortoOuAzul(texto, 'azul'); break
    case 'bradesco': rows = parseBradesco(texto); break
    case 'darwin':   rows = parseDarwin(texto); break
    case 'ezze':     rows = await parseEzze(texto, buf); break
    case 'hdi':      rows = parseHdi(texto); break
    case 'justos':   rows = parseJustos(texto); break
    case 'kovr':     rows = parseKovr(texto); break
    case 'mapfre':   rows = parseMapfre(texto); break
    case 'novo':     rows = parseNovo(texto); break
    case 'pier':     rows = parsePier(texto); break
    case 'porto':    rows = parsePortoOuAzul(texto, 'porto'); break
    case 'suhai':    rows = parseSuhai(texto); break
    case 'tokio':    rows = parseTokio(texto); break
    case 'yelum':    rows = parseYelum(texto); break
    case 'youse':    rows = parseYouse(texto); break
    case 'zurich':   rows = parseZurich(texto); break
    default: throw new Error(`Parser não implementado para seguradora '${seg}'.`)
  }

  // Layout informado pelo próprio parser (cada um seta `layout_pdf`).
  const layout = String(rows[0]?.layout_pdf || `${seg}-auto`)

  return { seguradora: seg, layout, rows, textoBruto: texto }
}
