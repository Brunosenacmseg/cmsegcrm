import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

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
// Extrai IP do request lidando com proxies (Vercel, Cloudflare, etc.)
function getClientIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    null
  )
}

// Geolocaliza um IP usando ip-api.com (gratuito, sem cadastro, ~45 req/min).
// Retorna null em qualquer falha — geolocalização é "best effort".
async function geolocalizar(ip: string): Promise<any | null> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null
  }
  try {
    const fields = 'status,country,regionName,city,lat,lon,timezone,isp,query'
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=${fields}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const j = await res.json()
    if (j.status !== 'success') return null
    return j
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { user_id, user_email, user_nome, sucesso = true, motivo } = body || {}

    const ip = getClientIp(request)
    const user_agent = request.headers.get('user-agent')
    const geo = ip ? await geolocalizar(ip) : null

    const { error } = await supabaseAdmin().from('login_logs').insert({
      user_id: user_id || null,
      user_email: user_email || null,
      user_nome: user_nome || null,
      sucesso: !!sucesso,
      motivo: motivo || null,
      ip,
      user_agent,
      pais: geo?.country || null,
      regiao: geo?.regionName || null,
      cidade: geo?.city || null,
      latitude: geo?.lat ?? null,
      longitude: geo?.lon ?? null,
      timezone: geo?.timezone || null,
      isp: geo?.isp || null,
    })

    if (error) {
      console.error('[logs/login] erro inserindo:', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[logs/login] exceção:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
