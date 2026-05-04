// Parser de PROPOSTA Bradesco Seguro Auto.
// Layout: cabeçalho "PROPOSTA DE SEGURO DE AUTOMÓVEL" + Nº Cotação,
// Proposta, Data/Hora, Versão. Mesma estrutura interna da apólice — usamos
// o parser de apólice e adicionamos data_calculo / numero_cotacao.

import { parseBradesco } from '../apolice/bradesco'
import { reFirst, toIso, type ApoliceRow } from './_common'

export function parsePropostaBradesco(text: string): ApoliceRow[] {
  const baseRows = parseBradesco(text)
  const numeroCotacao = reFirst(/N[ºo°]\s*Cota[cç][aã]o\s*:?\s*(\S+)/i, text)
  const dataPrimeiroCalc = reFirst(/Data\s+1[ºo°]?\s*C[aá]lculo\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i, text)
  return baseRows.map(row => ({
    ...row,
    numero_cotacao: numeroCotacao,
    data_calculo: toIso(dataPrimeiroCalc),
    produto: 'Proposta Bradesco Auto',
    layout_pdf: 'bradesco-auto-proposta',
    status_proposta: 'em_analise',
    numero: row.proposta ?? row.numero,
  }))
}
