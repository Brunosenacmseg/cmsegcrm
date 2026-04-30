// ═════════════════════════════════════════════════════════════
// Cliente RD Station CRM
// Docs: https://crmsupport.rdstation.com/hc/pt-br/categories/360002176912
// Auth: query string ?token=XXX
// ═════════════════════════════════════════════════════════════

const BASE = 'https://crm.rdstation.com/api/v1'

export interface RDPagination {
  page: number
  limit: number
  total: number
}

async function rdFetch<T = any>(path: string, token: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams({ token, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })
  const url = `${BASE}${path}?${qs.toString()}`

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) })

    if (res.status === 429) {
      // Rate limit — espera exponencial
      await new Promise(r => setTimeout(r, 1500 * (tentativa + 1)))
      continue
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`RD ${res.status} em ${path}: ${txt.slice(0, 180)}`)
    }
    return res.json() as Promise<T>
  }
  throw new Error(`RD: rate limit excedido em ${path}`)
}

// Extrai array de itens da resposta — tenta a chave primária e algumas alternativas comuns
function extrairItens<T>(data: any, key: string): T[] {
  if (!data) return []
  if (Array.isArray(data?.[key])) return data[key]
  // Tenta chaves comuns alternativas
  const alternativas = [key, `${key}s`, key.replace(/s$/, ''), 'items', 'data', 'results']
  for (const k of alternativas) if (Array.isArray(data?.[k])) return data[k]
  // Última tentativa: primeiro array dentro do objeto
  for (const v of Object.values(data || {})) if (Array.isArray(v)) return v as T[]
  return []
}

// Iterador paginado — para no limite de 10k da RD (page=50, limit=200)
export async function* paginar<T = any>(path: string, token: string, key: string, extraParams: Record<string, string | number> = {}): AsyncGenerator<T> {
  let page = 1
  const limit = 200
  while (true) {
    const data = await rdFetch<any>(path, token, { ...extraParams, page, limit })
    const itens = extrairItens<T>(data, key)
    for (const item of itens) yield item
    if (itens.length < limit) break
    if (page * limit >= 10000) break // limite duro da RD
    page++
    if (page > 1000) break
  }
}

export async function listarTodos<T = any>(path: string, token: string, key: string, extraParams: Record<string, string | number> = {}): Promise<T[]> {
  const out: T[] = []
  for await (const item of paginar<T>(path, token, key, extraParams)) out.push(item)
  return out
}

// Lista por janela de data — usa q[created_at_gt] / q[created_at_lt] do Ransack
export async function listarPorJanela<T = any>(
  path: string, token: string, key: string,
  fromIso: string, toIso: string,
  extraParams: Record<string, string | number> = {}
): Promise<T[]> {
  const params: Record<string, string | number> = {
    ...extraParams,
    'q[created_at_gt]': fromIso,
    'q[created_at_lt]': toIso,
  }
  return listarTodos<T>(path, token, key, params)
}

export async function ping(token: string): Promise<{ ok: boolean; total?: number; erro?: string }> {
  try {
    const data = await rdFetch<any>('/contacts', token, { page: 1, limit: 1 })
    return { ok: true, total: data?.total ?? data?.contacts?.length ?? 0 }
  } catch (e: any) {
    return { ok: false, erro: e?.message || String(e) }
  }
}

// ─── Tipos básicos do RD CRM ───────────────────────────────
export interface RDContact {
  _id?: string
  id?: string
  name?: string
  emails?: { email: string }[]
  phones?: { phone: string; type?: string }[]
  cpf?: string
  cnpj?: string
  birthday?: string | { year?: number; month?: number; day?: number }
  city?: string
  state?: string
  country?: string
  address?: string
  district?: string
  zip_code?: string
  organization?: { _id?: string; id?: string; name?: string } | null
  user?: { _id?: string; id?: string; name?: string; email?: string } | null
  source?: { name?: string } | null
  notes?: string
  title?: string
  rating?: number
  tags?: { name?: string }[]
  custom_fields?: any[]
  created_at?: string
  updated_at?: string
}

export interface RDDeal {
  _id?: string
  id?: string
  name?: string
  prediction_date?: string
  rating?: number
  amount_montly?: number
  amount_total?: number
  amount_unique?: number
  win?: boolean | null
  hold?: string | null
  closed_at?: string
  user?: { _id?: string; id?: string; name?: string; email?: string } | null
  contacts?: RDContact[]
  organization?: { _id?: string; id?: string; name?: string } | null
  deal_stage?: { _id?: string; id?: string; name?: string; deal_pipeline_id?: string } | null
  deal_pipeline?: { _id?: string; id?: string; name?: string } | null
  deal_lost_reason?: { name?: string } | null
  deal_source?: { name?: string } | null
  campaign?: { name?: string } | null
  deal_products?: any[]
  deal_custom_fields?: any[]
  custom_fields?: any[]
  tags?: { name?: string }[]
  notes?: any
  created_at?: string
  updated_at?: string
}

export interface RDPipeline {
  _id?: string
  id?: string
  name?: string
  deal_stages?: RDStage[]
  stages?: RDStage[]
}

export interface RDStage {
  _id?: string
  id?: string
  name?: string
  deal_pipeline_id?: string
  nickname?: string
  order?: number
}

export interface RDActivity {
  _id?: string
  id?: string
  text?: string
  date?: string
  type?: string
  hour?: string
  done?: boolean
  contact?: RDContact | null
  deal?: RDDeal | null
  user?: { _id?: string; id?: string; name?: string } | null
  created_at?: string
  updated_at?: string
}

export interface RDUser {
  _id?: string
  id?: string
  name?: string
  email?: string
  active?: boolean
}

export const rdId = (o: any): string | null => (o?._id || o?.id || null)

// Busca detalhada de um único deal (inclui notes/custom_fields que o /deals
// paginado costuma omitir). Tolera erro retornando null.
export async function buscarDealDetalhe(id: string, token: string): Promise<RDDeal | null> {
  try {
    return await rdFetch<RDDeal>(`/deals/${id}`, token)
  } catch {
    return null
  }
}

// Normaliza string para comparação (lowercase + sem acentos + trim)
export function norm(s?: string | null): string {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}
