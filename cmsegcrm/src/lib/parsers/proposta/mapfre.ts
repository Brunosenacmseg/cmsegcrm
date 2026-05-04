// Parser de PROPOSTA MAPFRE Auto.
// Layout: caixa "Proposta de Seguro MAPFRE Auto - 231" + Nº Cotação,
// Tipo Cálculo, Data/Hora.

import { parseMapfre } from '../apolice/mapfre'
import { reFirst, toIso, type ApoliceRow } from './_common'

export function parsePropostaMapfre(text: string): ApoliceRow[] {
  const cotacao = reFirst(/Cota[cç][aã]o\s+n?[ºo°]?\s*:?\s*(\d+)/i, text)
  const dataCalculo = reFirst(/Data\s*\/?\s*Hora\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i, text)
                   ?? reFirst(/Tipo\s+C[aá]lculo[\s\S]{0,80}?(\d{2}\/\d{2}\/\d{4})/i, text)
  return parseMapfre(text).map(row => ({
    ...row,
    numero_cotacao: cotacao,
    data_calculo: toIso(dataCalculo),
    produto: 'Proposta Mapfre Auto',
    layout_pdf: 'mapfre-auto-proposta',
    status_proposta: 'em_analise',
    numero: row.proposta ?? row.numero,
  }))
}
