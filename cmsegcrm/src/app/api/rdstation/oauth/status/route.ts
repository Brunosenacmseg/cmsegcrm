import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { statusOAuth } from '@/lib/rdstation-oauth'

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

export async function GET(request: NextRequest) {
  const auth = await checarAdmin(request)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })
  return NextResponse.json(await statusOAuth())
}

export async function DELETE(request: NextRequest) {
  const auth = await checarAdmin(request)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })
  await supabaseAdmin().from('rdstation_oauth').delete().eq('id', 1)
  return NextResponse.json({ ok: true })
}
