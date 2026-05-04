// Parser de PROPOSTA Porto Seguro / Azul Seguros.
// Layout: "PROPOSTA DE SEGUROS AUTOMÓVEL RCF-V e APP / AZUL TRADICIONAL"
// (apesar do nome do arquivo ser PROPOSTA_PORTO, o cabeçalho é Azul). Reusa
// o parser de apólice e marca como proposta.

import { parsePortoOuAzul } from '../apolice/porto-azul'
import type { ApoliceRow } from './_common'
import type { SeguradoraId } from '../apolice-detector'

export function parsePropostaPortoOuAzul(text: string, marca: SeguradoraId): ApoliceRow[] {
  return parsePortoOuAzul(text, marca).map(row => ({
    ...row,
    produto: marca === 'porto' ? 'Proposta Porto Auto' : 'Proposta Azul Auto',
    layout_pdf: marca === 'porto' ? 'porto-auto-proposta' : 'azul-auto-proposta',
    status_proposta: 'em_analise',
    numero: row.proposta ?? row.numero,
  }))
}
