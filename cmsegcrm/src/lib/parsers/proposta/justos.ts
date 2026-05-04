// Parser de PROPOSTA Justos.
// Layout fintech, página 2 traz o "valor total destacado" + número da
// proposta + validade. Reaproveita parser de apólice + extrai data_validade.

import { parseJustos } from '../apolice/justos'
import { reFirst, toIso, type ApoliceRow } from './_common'

export function parsePropostaJustos(text: string): ApoliceRow[] {
  const validade = reFirst(/V[aá]lid[ao]\s+at[eé]\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i, text)
                  ?? reFirst(/Validade\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i, text)
  return parseJustos(text).map(row => ({
    ...row,
    data_validade: toIso(validade),
    produto: 'Proposta Justos',
    layout_pdf: 'justos-auto-proposta',
    status_proposta: 'em_analise',
    numero: row.proposta ?? row.numero,
  }))
}
