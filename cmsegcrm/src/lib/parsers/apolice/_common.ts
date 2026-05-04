// Re-exports + helpers usados por TODOS os parsers de apólice por seguradora.
// Mantém os imports curtos nos arquivos por seguradora.

export {
  norm, toIso, brNum, clean, simNao, listBrNumbers,
  splitSections, reFirst,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, pickDate,
  truncateText, pickProcessoSusep,
} from '../pdf-utils'
export type { ApoliceRow } from '../pdf-utils'

import type { ApoliceRow } from '../pdf-utils'
import type { SeguradoraId } from '../apolice-detector'

// Estrutura padrão devolvida por cada parser. Todos os parsers populam o que
// conseguirem; campos não encontrados ficam null. O `pdf_texto_bruto` sempre
// é incluído pra debug quando alguma extração falhar.
export interface ApolicePdfBaseRow extends ApoliceRow {
  // Identificação
  seguradora_origem: SeguradoraId | null
  numero: string | null
  endosso?: string | null
  proposta?: string | null
  data_emissao: string | null     // ISO YYYY-MM-DD
  vigencia_ini: string | null     // ISO
  vigencia_fim: string | null     // ISO
  // Segurado
  cliente_nome: string | null
  cpf_cnpj: string | null
  segurado_email?: string | null
  segurado_telefone?: string | null
  segurado_cep?: string | null
  segurado_cidade?: string | null
  segurado_uf?: string | null
  segurado_endereco?: string | null
  // Veículo
  marca?: string | null
  modelo?: string | null
  ano_modelo?: string | null
  placa?: string | null
  chassi?: string | null
  cod_fipe?: string | null
  // Coberturas + financeiro
  coberturas?: any
  premio_liquido?: number | null
  iof?: number | null
  premio_total?: number | null
  premio?: number | null
  // Pagamento
  forma_pagamento?: string | null
  parcelas?: any
  // Corretor
  corretor_nome?: string | null
  corretor_cnpj?: string | null
  corretor_susep?: string | null
  // Status (sempre 'ativo' a partir do PDF — cancelamentos vêm via outro fluxo)
  status_apolice?: string | null
  // Debug
  layout_pdf?: string | null
  pdf_texto_bruto?: string | null
}
