import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

const EVENTOS = [
  'crm_deal_created',
  'crm_deal_updated',
  'crm_deal_deleted',
  'crm_contact_created',
  'crm_contact_updated',
  'crm_contact_deleted',
]

const V2_BASE = 'https://api.rd.services/crm/v2'

async function criarWebhook(rdToken: string, body: any): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${V2_BASE}/webhooks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${rdToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  let data: any = null
  try { data = await res.json() } catch { data = await res.text() }
  return { ok: res.ok, status: res.status, data }
}

export async function POST(request: NextRequest) {
  const auth = await checarAdmin(request)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const rdToken = request.headers.get('x-rd-token') || process.env.RDSTATION_CRM_TOKEN
  const secret = process.env.RDSTATION_WEBHOOK_SECRET
  if (!rdToken) return NextResponse.json({ error: 'RDSTATION_CRM_TOKEN não configurado' }, { status: 400 })
  if (!secret) return NextResponse.json({ error: 'RDSTATION_WEBHOOK_SECRET não configurado' }, { status: 400 })

  const origin = request.nextUrl.origin
  const webhookUrl = `${origin}/api/rdstation/webhook`

  const resultados: any[] = []
  for (const evento of EVENTOS) {
    const payload = {
      data: {
        name: `CMSEGCRM - ${evento}`,
        event_name: evento,
        http_method: 'POST',
        url: webhookUrl,
        auth_header: 'X-Auth-Key',
        auth_key: secret,
      },
    }
    try {
      const r = await criarWebhook(rdToken, payload)
      resultados.push({ evento, ok: r.ok, status: r.status, response: r.data })
    } catch (e: any) {
      resultados.push({ evento, ok: false, erro: e?.message?.slice(0, 200) })
    }
  }

  const ok = resultados.every(r => r.ok)
  const algumOk = resultados.some(r => r.ok)
  return NextResponse.json({ ok, algumOk, webhookUrl, resultados })
}

export async function GET(request: NextRequest) {
  const auth = await checarAdmin(request)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const rdToken = request.headers.get('x-rd-token') || process.env.RDSTATION_CRM_TOKEN
  if (!rdToken) return NextResponse.json({ error: 'RDSTATION_CRM_TOKEN não configurado' }, { status: 400 })

  // Lista webhooks existentes na conta RD
  try {
    const res = await fetch(`${V2_BASE}/webhooks`, {
      headers: { 'Authorization': `Bearer ${rdToken}`, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    let data: any = null
    try { data = await res.json() } catch { data = await res.text() }
    return NextResponse.json({ ok: res.ok, status: res.status, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 500 })
  }
}
