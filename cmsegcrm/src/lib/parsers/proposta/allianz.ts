// Parser de PROPOSTA Allianz Auto.
// Layout descrito pelo usuário: igual à apólice (mesma estrutura), só muda
// o título "PROPOSTA ALLIANZ AUTO AUTOMÓVEL". Reaproveitamos o mesmo parser
// alterando produto/seguradora_origem e usando data_validade quando vier.

import { parseAllianz } from '../apolice/allianz'
import type { ApoliceRow } from './_common'

export function parsePropostaAllianz(text: string): ApoliceRow[] {
  return parseAllianz(text).map(row => ({
    ...row,
    produto: 'Proposta Allianz Auto',
    layout_pdf: 'allianz-auto-proposta',
    status_proposta: 'em_analise',
    // Allianz mostra "Nº Proposta" no topo direito — o parser de apólice
    // já populou row.proposta. Garantimos que `numero` reflita esse valor
    // (pra propostas, "numero" ≡ proposta, e a apólice ainda não existe).
    numero: row.proposta ?? row.numero,
  }))
}
