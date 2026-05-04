// Parser de PROPOSTA Novo Seguros.
// Layout: cabeçalho "Proposta Novo Seguros / Processo SUSEP".
// Reaproveita parser de apólice (que já trata vigência mensal).

import { parseNovo } from '../apolice/novo'
import type { ApoliceRow } from './_common'

export function parsePropostaNovo(text: string): ApoliceRow[] {
  return parseNovo(text).map(row => ({
    ...row,
    produto: 'Proposta Novo Seguros',
    layout_pdf: 'novo-auto-proposta',
    status_proposta: 'em_analise',
    numero: row.proposta ?? row.numero,
  }))
}
