// Parser de PROPOSTA HDI Auto.
// Layout: "Especificação da Proposta" + Nº da Proposta no topo.
// Reaproveita parser de apólice e adiciona data_calculo e moeda.

import { parseHdi } from '../apolice/hdi'
import { reFirst, toIso, type ApoliceRow } from './_common'

export function parsePropostaHdi(text: string): ApoliceRow[] {
  const dataCalculo = reFirst(/Data\s+Cota[cç][aã]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i, text)
  return parseHdi(text).map(row => ({
    ...row,
    data_calculo: toIso(dataCalculo),
    produto: 'Proposta HDI Auto',
    layout_pdf: 'hdi-auto-proposta',
    status_proposta: 'em_analise',
    numero: row.proposta ?? row.numero,
  }))
}
