// Endpoint para logging server-side (navigator.sendBeacon durante unload).
// Aceita { user_id, acao, detalhe, pathname } via body e insere em system_logs.
// Usa service role para não depender do token (que pode estar expirando).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function admin(): any {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {}
    try { body = await req.json() } catch {
      try { body = JSON.parse(await req.text()) } catch {}
    }
    const { user_id, acao, detalhe, pathname, metadata } = body || {}
    if (!user_id || !acao) return NextResponse.json({ ok: false }, { status: 400 })

    const sa = admin()
    const { data: u } = await sa.from('users').select('nome, email').eq('id', user_id).single()
    await sa.from('system_logs').insert({
      user_id,
      user_email: u?.email || null,
      user_nome: u?.nome || null,
      acao,
      detalhe: detalhe || null,
      metadata: metadata || null,
      pathname: pathname || null,
      user_agent: req.headers.get('user-agent') || null,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
