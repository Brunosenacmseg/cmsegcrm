// Encerra todas as jornadas abertas do usuário (chamada no logoff/meia-noite)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ ok: true, semSessao: true })
  const sa = admin()
  const { data: userData } = await sa.auth.getUser(token)
  if (!userData?.user) return NextResponse.json({ ok: true, semSessao: true })
  const uid = userData.user.id
  await sa.from('jornadas')
    .update({ encerrada_em: new Date().toISOString(), encerrada_motivo: 'auto_meia_noite' })
    .eq('user_id', uid)
    .is('encerrada_em', null)
  return NextResponse.json({ ok: true })
}
