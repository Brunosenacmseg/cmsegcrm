import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getAccessTokenValido } from '@/lib/rdstation-oauth'

export const dynamic = 'force-dynamic'

let _supabaseAdmin: SupabaseClient | null = null
function supabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}
async function checarAdmin(request: NextRequest): Promise<{ ok: boolean; erro?: string }> {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, erro: 'Não autenticado' }
  const { data: userData } = await supabaseAdmin().auth.getUser(token)
  if (!userData?.user) return { ok: false, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return { ok: false, erro: 'Apenas admin' }
  return { ok: true }
}

const V1_BASE = 'https://crm.rdstation.com/api/v1'
const V2_BASE = 'https://api.rd.services/crm/v2'

// Eventos válidos no RD CRM v1 — em MAIÚSCULAS (descoberto via mensagem de erro do RD)
const EVENTOS = [
  'CRM_DEAL_CREATED',
  'CRM_DEAL_UPDATED',
  'CRM_DEAL_DELETED',
  'CRM_CONTACT_CREATED',
  'CRM_CONTACT_UPDATED',
  'CRM_CONTACT_DELETED',
]

async function fetchJson(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) })
  let data: any = null
  try { data = await res.json() } catch { try { data = await res.text() } catch {} }
  return { ok: res.ok, status: res.status, data }
}

// Cria webhook na API v1 (token query string).
// Campo event_type DEVE ser MAIÚSCULO (ex: CRM_DEAL_UPDATED).
async function criarV1(rdToken: string, eventType: string, url: string, secret: string): Promise<{ ok: boolean; status: number; data: any }> {
  const baseUrl = `${V1_BASE}/webhooks?token=${rdToken}`
  const body = {
    name: `CMSEGCRM - ${eventType}`,
    url,
    http_method: 'POST',
    event_type: eventType,
    auth_header: 'X-Auth-Key',
    auth_key: secret,
  }
  return await fetchJson(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
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

  // Para cada evento, tenta v1 (token) primeiro, depois v2 (OAuth) se v1 falhar
  for (const evento of EVENTOS) {
    let respV1: any = null, respV2: any = null

    if (v1Token) {
      respV1 = await criarV1(v1Token, evento, webhookUrl, secret)
      if (respV1.ok) {
        resultados.push({ evento, api: 'v1', ok: true, status: respV1.status })
        continue
      }
    }
    if (oauthToken) {
      respV2 = await criarV2(oauthToken, evento.toLowerCase(), webhookUrl, secret)
      if (respV2.ok) {
        resultados.push({ evento, api: 'v2', ok: true, status: respV2.status })
        continue
      }
    }

    resultados.push({
      evento,
      api: 'falhou',
      ok: false,
      v1_status: respV1?.status,
      v1_resposta: respV1?.data,
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
