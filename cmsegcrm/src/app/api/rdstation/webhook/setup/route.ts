import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccessTokenValido } from '@/lib/rdstation-oauth'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checarAdmin(request: NextRequest): Promise<{ ok: boolean; erro?: string }> {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, erro: 'Não autenticado' }
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  if (!userData?.user) return { ok: false, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin.from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return { ok: false, erro: 'Apenas admin' }
  return { ok: true }
}

const V1_BASE = 'https://crm.rdstation.com/api/v1'
const V2_BASE = 'https://api.rd.services/crm/v2'

const EVENTOS_V2 = [
  'crm_deal_created',
  'crm_deal_updated',
  'crm_deal_deleted',
  'crm_contact_created',
  'crm_contact_updated',
  'crm_contact_deleted',
]

// Eventos no formato v1 — o RD usa nomenclaturas como "deal.created" / "deal_created"
const EVENTOS_V1 = [
  'deal.created', 'deal.updated', 'deal.deleted',
  'contact.created', 'contact.updated', 'contact.deleted',
]

async function fetchJson(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) })
  let data: any = null
  try { data = await res.json() } catch { try { data = await res.text() } catch {} }
  return { ok: res.ok, status: res.status, data }
}

// Tenta criar webhook na API v1 (token query string).
// O RD v1 exige o campo "event_type" (string) e provavelmente um "entity_type".
async function criarV1(rdToken: string, eventoDotted: string, url: string, secret: string): Promise<{ ok: boolean; status: number; data: any; tentativa: string }> {
  const baseUrl = `${V1_BASE}/webhooks?token=${rdToken}`
  // eventoDotted: "deal.created" → entity="deal", action="created"
  const [entity, action] = eventoDotted.split('.')

  const corpos = [
    // Formato 1: event_type singular (mais provável dado o erro CANNOT_BE_NULL em event_type)
    {
      tentativa: 'event_type',
      body: {
        name: `CMSEGCRM - ${eventoDotted}`,
        url,
        http_method: 'POST',
        event_type: eventoDotted,
        entity_type: entity,
        auth_header: 'X-Auth-Key',
        auth_key: secret,
      },
    },
    // Formato 2: separa entity_type e action
    {
      tentativa: 'entity_action',
      body: {
        name: `CMSEGCRM - ${eventoDotted}`,
        url,
        http_method: 'POST',
        entity_type: entity,
        event_type: action,
        auth_header: 'X-Auth-Key',
        auth_key: secret,
      },
    },
    // Formato 3: event_type com underscore
    {
      tentativa: 'underscore',
      body: {
        name: `CMSEGCRM - ${eventoDotted}`,
        url,
        http_method: 'POST',
        event_type: `${entity}_${action}`,
        auth_header: 'X-Auth-Key',
        auth_key: secret,
      },
    },
    // Formato 4: wrapped em "webhook"
    {
      tentativa: 'wrapped',
      body: {
        webhook: {
          name: `CMSEGCRM - ${eventoDotted}`,
          url,
          http_method: 'POST',
          event_type: eventoDotted,
          entity_type: entity,
          auth_header: 'X-Auth-Key',
          auth_key: secret,
        },
      },
    },
  ]

  // Tenta todos os formatos e coleta TODOS os erros pra debug
  const todasTentativas: any[] = []
  for (const { tentativa, body } of corpos) {
    const r = await fetchJson(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) return { ...r, tentativa }
    todasTentativas.push({ tentativa, status: r.status, data: r.data, body_enviado: body })
    if (r.status === 401 || r.status === 403) break
  }
  return { ok: false, status: todasTentativas[0]?.status || 0, data: { todas_tentativas: todasTentativas }, tentativa: 'todas_falharam' }
}

// Tenta criar webhook na API v2 (OAuth Bearer)
async function criarV2(accessToken: string, evento: string, url: string, secret: string) {
  return await fetchJson(`${V2_BASE}/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      data: {
        name: `CMSEGCRM - ${evento}`,
        event_name: evento,
        http_method: 'POST',
        url,
        auth_header: 'X-Auth-Key',
        auth_key: secret,
      },
    }),
  })
}

export async function POST(request: NextRequest) {
  const auth = await checarAdmin(request)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const secret = process.env.RDSTATION_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'RDSTATION_WEBHOOK_SECRET não configurado' }, { status: 400 })

  const v1Token = request.headers.get('x-rd-token') || process.env.RDSTATION_CRM_TOKEN
  let oauthToken: string | null = null
  try { oauthToken = await getAccessTokenValido() } catch {}

  if (!v1Token && !oauthToken) {
    return NextResponse.json({ error: 'Configure RDSTATION_CRM_TOKEN (v1) ou conecte via OAuth (v2)' }, { status: 400 })
  }

  const webhookUrl = `${request.nextUrl.origin}/api/rdstation/webhook`
  const resultados: any[] = []

  // Estratégia: para cada evento, tenta v1 primeiro (mais simples), depois v2
  for (let i = 0; i < EVENTOS_V2.length; i++) {
    const eventoV2 = EVENTOS_V2[i]
    const eventoV1 = EVENTOS_V1[i]
    let respV1: any = null, respV2: any = null

    if (v1Token) {
      respV1 = await criarV1(v1Token, eventoV1, webhookUrl, secret)
      if (respV1.ok) {
        resultados.push({ evento: eventoV1, api: 'v1', ok: true, status: respV1.status, formato: respV1.tentativa })
        continue
      }
    }
    if (oauthToken) {
      respV2 = await criarV2(oauthToken, eventoV2, webhookUrl, secret)
      if (respV2.ok) {
        resultados.push({ evento: eventoV2, api: 'v2', ok: true, status: respV2.status })
        continue
      }
    }

    // Falhou em ambos
    resultados.push({
      evento: eventoV2,
      api: 'falhou',
      ok: false,
      v1_status: respV1?.status,
      v1_resposta: respV1?.data,
      v1_tentativa: respV1?.tentativa,
      v2_status: respV2?.status,
      v2_resposta: respV2 ? respV2.data : 'OAuth não conectado',
    })
  }

  const ok = resultados.every(r => r.ok)
  const algumOk = resultados.some(r => r.ok)
  return NextResponse.json({ ok, algumOk, webhookUrl, resultados })
}

export async function GET(request: NextRequest) {
  const auth = await checarAdmin(request)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const v1Token = request.headers.get('x-rd-token') || process.env.RDSTATION_CRM_TOKEN
  if (!v1Token) return NextResponse.json({ error: 'RDSTATION_CRM_TOKEN não configurado' }, { status: 400 })

  // Lista webhooks existentes via v1
  const r = await fetchJson(`${V1_BASE}/webhooks?token=${v1Token}`, {
    headers: { Accept: 'application/json' },
  })
  return NextResponse.json({ ok: r.ok, status: r.status, data: r.data })
}
