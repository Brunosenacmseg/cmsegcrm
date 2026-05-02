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

  // 6 tentativas com backoff: 20s/30s/45s/60s/60s/60s = até ~4.5min de
  // paciência por chamada (cabe no timeout maxDuration=300s do Vercel pro).
  // RD pode bloquear por mais de 1min em contas com volume alto.
  // Respeita Retry-After se o RD enviar.
  const esperasSegundos = [20, 30, 45, 60, 60, 60]
  let totalEspera = 0
  for (let tentativa = 0; tentativa < esperasSegundos.length; tentativa++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) })

    if (res.status === 429) {
      registrarRateLimit() // ativa modo adaptativo
      const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10)
      const esperaMs = Math.max(retryAfter * 1000, esperasSegundos[tentativa] * 1000)
      totalEspera += esperaMs
      await new Promise(r => setTimeout(r, esperaMs))
      continue
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`RD ${res.status} em ${path}: ${txt.slice(0, 180)}`)
    }
    registrarSucesso()
    return res.json() as Promise<T>
  }
  throw new Error(`RD: rate limit (429) excedido em ${path} após ${(totalEspera/1000).toFixed(0)}s de espera. Reduza o intervalo de datas (use 1-2 meses por vez) ou tente novamente em alguns minutos.`)
}

// ─── Throttle adaptativo ─────────────────────────────────────
// Comece com 600ms entre requests (~100/min, abaixo do limite de 120 RD).
// Após um 429, dobra o intervalo (até 5s). A cada 30 sucessos seguidos
// sem 429, baixa pra metade até voltar ao mínimo.
let intervaloMin = 600
let sucessosConsecutivos = 0
function registrarRateLimit() {
  intervaloMin = Math.min(intervaloMin * 2, 5000)
  sucessosConsecutivos = 0
}
function registrarSucesso() {
  sucessosConsecutivos++
  if (sucessosConsecutivos >= 30 && intervaloMin > 600) {
    intervaloMin = Math.max(intervaloMin / 2, 600)
    sucessosConsecutivos = 0
  }
}

let ultimaRDFetch = 0
async function rdFetchThrottled<T = any>(path: string, token: string, params: Record<string, string | number> = {}): Promise<T> {
  const agora = Date.now()
  const desdeUltima = agora - ultimaRDFetch
  if (desdeUltima < intervaloMin) {
    await new Promise(r => setTimeout(r, intervaloMin - desdeUltima))
  }
  ultimaRDFetch = Date.now()
  return rdFetch<T>(path, token, params)
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
    const data = await rdFetchThrottled<any>(path, token, { ...extraParams, page, limit })
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
    return await rdFetchThrottled<RDDeal>(`/deals/${id}`, token)
  } catch {
    return null
  }
}

// Normaliza string para comparação (lowercase + sem acentos + trim)
export function norm(s?: string | null): string {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

// ═════════════════════════════════════════════════════════════
// Escrita (CRM → RD): criar/atualizar/mover/ganhar/perder deal
// API v1 (crm.rdstation.com): token vai na query string em todos
// os métodos. Escolhas explícitas pra não usar throttling adaptativo
// (writes não devem ficar em fila — falham rápido).
// ═════════════════════════════════════════════════════════════

async function rdMutate<T = any>(
  method: 'POST' | 'PUT',
  path: string,
  token: string,
  body: any,
): Promise<T> {
  const url = `${BASE}${path}?token=${encodeURIComponent(token)}`
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  if (res.status === 429) {
    registrarRateLimit()
    const txt = await res.text().catch(() => '')
    throw new Error(`RD 429 em ${method} ${path}: rate limited — ${txt.slice(0, 120)}`)
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`RD ${res.status} em ${method} ${path}: ${txt.slice(0, 220)}`)
  }
  registrarSucesso()
  return res.json() as Promise<T>
}

// Cria um deal na RD. Retorna o deal criado (com _id).
export async function criarDealRD(
  payload: {
    name: string
    deal_stage_id?: string
    deal_pipeline_id?: string
    user_id?: string
    contacts?: { id?: string; _id?: string; name?: string; emails?: { email: string }[]; phones?: { phone: string }[] }[]
    amount_total?: number
    amount_unique?: number
    prediction_date?: string
    rating?: number
  },
  token: string,
): Promise<RDDeal> {
  return rdMutate<RDDeal>('POST', '/deals', token, { deal: payload })
}

// Atualiza fields gerais (etapa, ganho/perdido, valores, motivo, etc).
export async function atualizarDealRD(
  id: string,
  patch: Partial<{
    name: string
    deal_stage_id: string
    deal_lost_reason_id: string
    win: boolean | null
    hold: string | null
    amount_total: number
    amount_unique: number
    prediction_date: string
    user_id: string
    rating: number
  }>,
  token: string,
): Promise<RDDeal> {
  return rdMutate<RDDeal>('PUT', `/deals/${id}`, token, { deal: patch })
}

export const moverDealEtapaRD = (id: string, stageId: string, token: string) =>
  atualizarDealRD(id, { deal_stage_id: stageId }, token)

export const marcarDealGanhoRD = (id: string, token: string) =>
  atualizarDealRD(id, { win: true }, token)

export const marcarDealPerdidoRD = (id: string, motivoId: string | undefined, token: string) =>
  atualizarDealRD(id, motivoId ? { win: false, deal_lost_reason_id: motivoId } : { win: false }, token)

export const reabrirDealRD = (id: string, token: string) =>
  atualizarDealRD(id, { win: null, hold: null }, token)

// Resolve o stage_id da RD para uma etapa local (case-insensitive, sem acentos).
// Retorna null se não achar — caller deve logar erro com nomes esperados x reais.
export async function buscarStageIdPorNome(
  pipelineRdId: string,
  nomeEtapa: string,
  token: string,
): Promise<{ stageId: string | null; etapasRd: string[] }> {
  for (const path of [`/deal_pipelines/${pipelineRdId}`, `/pipelines/${pipelineRdId}`]) {
    try {
      const data = await rdFetchThrottled<any>(path, token)
      const stages: RDStage[] = data?.deal_stages || data?.stages || []
      const target = norm(nomeEtapa)
      const match = stages.find(s => norm(s.name || '') === target)
      const etapasRd = stages.map(s => s.name || '').filter(Boolean)
      if (match) return { stageId: rdId(match), etapasRd }
      // Achou pipeline mas não achou etapa — devolve nomes pra log
      if (etapasRd.length) return { stageId: null, etapasRd }
    } catch { /* tenta próximo path */ }
  }
  return { stageId: null, etapasRd: [] }
}
