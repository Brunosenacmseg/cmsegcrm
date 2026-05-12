// Inicia uma jornada de trabalho do usuário logado.
// Captura IP (x-forwarded-for) e localização (lat/lng vindos do client).
// Registra também um evento em logs (acao='inicio_jornada').
//
// Body opcional: { lat?: number, lng?: number, accuracy_m?: number, cidade?: string, uf?: string }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function getIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for') || ''
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || ''
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const sa = admin()
  const { data: userData } = await sa.auth.getUser(token)
  if (!userData?.user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  const uid = userData.user.id

  let body: any = {}
  try { body = await req.json() } catch {}
  const lat = typeof body.lat === 'number' ? body.lat : null
  const lng = typeof body.lng === 'number' ? body.lng : null
  const accuracy_m = typeof body.accuracy_m === 'number' ? body.accuracy_m : null
  const cidade = body.cidade ? String(body.cidade) : null
  const uf = body.uf ? String(body.uf) : null

  const ip = getIp(req) || null
  const ua = req.headers.get('user-agent') || null

  // Já existe jornada aberta hoje? Não duplica.
  const hojeISO = new Date(); hojeISO.setHours(0,0,0,0)
  const { data: existente } = await sa
    .from('jornadas')
    .select('id')
    .eq('user_id', uid)
    .gte('iniciada_em', hojeISO.toISOString())
    .is('encerrada_em', null)
    .limit(1)
  if (existente && existente.length > 0) {
    return NextResponse.json({ ok: true, jornada_id: existente[0].id, ja_iniciada: true })
  }

  const { data: nova, error } = await sa.from('jornadas').insert({
    user_id: uid,
    ip,
    user_agent: ua,
    lat,
    lng,
    accuracy_m,
    cidade,
    uf,
  }).select('id, iniciada_em').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log do sistema (table system_logs)
  try {
    const { data: u } = await sa.from('users').select('email,nome').eq('id', uid).single()
    await sa.from('system_logs').insert({
      user_id: uid,
      user_email: u?.email || null,
      user_nome: u?.nome || null,
      acao: 'inicio_jornada',
      recurso: 'Início de Jornada',
      pathname: '/dashboard/mural',
      ip,
      user_agent: ua,
      metadata: { lat, lng, accuracy_m, cidade, uf },
      detalhe: `Jornada iniciada de ${cidade || '—'}${uf?'/'+uf:''}${lat?` (${lat.toFixed(4)},${lng?.toFixed(4)})`:''}`,
    } as any)
  } catch {/* nao bloqueia */}

  return NextResponse.json({ ok: true, jornada_id: nova?.id, iniciada_em: nova?.iniciada_em })
}
