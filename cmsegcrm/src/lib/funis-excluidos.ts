import { createClient } from '@/lib/supabase/client'

// Funis cujas negociações NÃO devem entrar em totais de prêmio,
// ranking de vendas, produção, metas e demais agregações de valor.
// O funil "EMISSÃO E IMPLANTAÇÃO" é operacional (pós-venda); os valores
// já foram contabilizados no funil de origem da negociação.
export const NOMES_FUNIS_SEM_VALOR = ['EMISSÃO E IMPLANTAÇÃO'] as const

function ptNorm(s: string | null | undefined) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

let cache: { ids: string[]; expira: number } | null = null
const TTL_MS = 5 * 60 * 1000

export async function getFunilIdsSemValor(): Promise<string[]> {
  if (cache && cache.expira > Date.now()) return cache.ids
  const supabase = createClient()
  const { data } = await supabase.from('funis').select('id, nome')
  const alvo = NOMES_FUNIS_SEM_VALOR.map(ptNorm)
  const ids = (data || [])
    .filter((f: any) => alvo.includes(ptNorm(f.nome)))
    .map((f: any) => f.id as string)
  cache = { ids, expira: Date.now() + TTL_MS }
  return ids
}

export function limparCacheFunisSemValor() { cache = null }

export function ehFunilSemValor(funilNome?: string | null) {
  if (!funilNome) return false
  const alvo = NOMES_FUNIS_SEM_VALOR.map(ptNorm)
  return alvo.includes(ptNorm(funilNome))
}
