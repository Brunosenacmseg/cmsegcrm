// Re-export idêntico ao usado pelos parsers de apólice. Mantém os imports
// curtos nos parsers de proposta de cada seguradora.

export {
  norm, toIso, brNum, clean, simNao, listBrNumbers,
  splitSections, reFirst,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, pickDate,
  truncateText, pickProcessoSusep,
} from '../pdf-utils'
export type { ApoliceRow } from '../pdf-utils'
