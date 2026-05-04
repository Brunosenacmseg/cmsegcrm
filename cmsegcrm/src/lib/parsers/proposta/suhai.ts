// Parser de PROPOSTA Suhai.
// Layout: "PROPOSTA DE SEGURO" + tabelas "DADOS DA PROPOSTA",
// "DADOS DO PROPONENTE" etc. Reaproveita parser de apólice.

import { parseSuhai } from '../apolice/suhai'
import { reFirst, type ApoliceRow } from './_common'

export function parsePropostaSuhai(text: string): ApoliceRow[] {
  const protocolo = reFirst(/Protocolo\s+Eletr[ôo]nico\s*:?\s*(\S+)/i, text)
  return parseSuhai(text).map(row => ({
    ...row,
    protocolo,
    produto: 'Proposta Suhai',
    layout_pdf: 'suhai-auto-proposta',
    status_proposta: 'em_analise',
    numero: row.proposta ?? row.numero,
  }))
}
