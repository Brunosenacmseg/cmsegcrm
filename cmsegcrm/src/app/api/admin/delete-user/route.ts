import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export const dynamic = 'force-dynamic'

let _sa: ReturnType<typeof createClient<Database>> | null = null
function getSupabaseAdmin() {
  if (!_sa) _sa = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return _sa
}

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('authorization') || ''
    const token = auth.replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ error: 'Token de autorização ausente' }, { status: 401 })

    const sa = getSupabaseAdmin()
    const { data: u, error: authErr } = await sa.auth.getUser(token)
    if (authErr || !u?.user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

    const { data: prof } = await sa.from('users').select('role').eq('id', u.user.id).single()
    if ((prof as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'Apenas admin pode excluir usuários' }, { status: 403 })
    }

    const { userId, leaderOverride } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 })
    if (userId === u.user.id) {
      return NextResponse.json({ error: 'Você não pode excluir a si mesmo' }, { status: 400 })
    }

    const { data: rpc, error: rpcErr } = await sa.rpc('excluir_usuario_com_handoff' as any, {
      p_user_id: userId,
      p_admin_id: u.user.id,
      p_leader_override: leaderOverride || null,
    })
    if (rpcErr) {
      console.error('[delete-user] rpc:', rpcErr.message)
      return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    }

    // Desabilita o login do usuário no auth (sem apagar a linha, para
    // não derrubar referências caso exista cascade em algum lugar).
    try {
      await sa.auth.admin.updateUserById(userId, { ban_duration: '876000h' as any })
    } catch (banErr: any) {
      console.warn('[delete-user] não foi possível banir auth user:', banErr?.message)
    }

    return NextResponse.json({ ok: true, ...(rpc as any) })
  } catch (err: any) {
    console.error('[delete-user] erro:', err?.message)
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 })
  }
}
