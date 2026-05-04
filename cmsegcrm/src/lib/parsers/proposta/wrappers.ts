// Wrappers simples: para as seguradoras cujo layout de PROPOSTA é
// essencialmente o mesmo da APÓLICE, reaproveitamos o parser de apólice e
// trocamos só os metadados (produto, layout_pdf, status_proposta).
//
// Se no futuro identificarmos que alguma dessas seguradoras tem layout
// distinto entre proposta e apólice, basta criar o arquivo dedicado e mudar
// o `proposta-pdf.ts` para usá-lo.

import { parseDarwin } from '../apolice/darwin'
import { parseKovr } from '../apolice/kovr'
import { parsePier } from '../apolice/pier'
import { parseTokio } from '../apolice/tokio'
import { parseYelum } from '../apolice/yelum'
import { parseYouse } from '../apolice/youse'
import { parseZurich } from '../apolice/zurich'
import { parseEzze } from '../apolice/ezze'
import type { ApoliceRow } from './_common'

function wrap(rows: ApoliceRow[], produto: string, layout: string): ApoliceRow[] {
  return rows.map(r => ({
    ...r,
    produto,
    layout_pdf: layout,
    status_proposta: 'em_analise',
    numero: r.proposta ?? r.numero,
  }))
}

export const parsePropostaTokio  = (text: string) => wrap(parseTokio(text),  'Proposta Tokio Marine', 'tokio-auto-proposta')
export const parsePropostaYelum  = (text: string) => wrap(parseYelum(text),  'Proposta Yelum',        'yelum-auto-proposta')
export const parsePropostaYouse  = (text: string) => wrap(parseYouse(text),  'Proposta Youse',        'youse-auto-proposta')
export const parsePropostaZurich = (text: string) => wrap(parseZurich(text), 'Proposta Zurich Auto',  'zurich-auto-proposta')
export const parsePropostaDarwin = (text: string) => wrap(parseDarwin(text), 'Proposta Darwin',       'darwin-auto-proposta')
export const parsePropostaPier   = (text: string) => wrap(parsePier(text),   'Proposta Pier',         'pier-contrato-proposta')
export const parsePropostaKovr   = (text: string) => wrap(parseKovr(text),   'Proposta Kovr',         'kovr-rc-transporte-proposta')
export async function parsePropostaEzze(text: string, buf?: Buffer): Promise<ApoliceRow[]> {
  return wrap(await parseEzze(text, buf), 'Proposta Ezze', 'ezze-auto-proposta')
}
