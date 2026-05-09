import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

let _sa: ReturnType<typeof createClient> | null = null
function getSupabaseAdmin() {
  if (!_sa) _sa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return _sa
}

async function exigirAdmin(request: NextRequest): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, msg: 'Token de autorização ausente' }
  const sa = getSupabaseAdmin()
  const { data: u, error } = await sa.auth.getUser(token)
  if (error || !u?.user) return { ok: false, status: 401, msg: 'Sessão inválida' }
  const { data: prof } = await sa.from('users').select('role').eq('id', u.user.id).single()
  if ((prof as any)?.role !== 'admin') return { ok: false, status: 403, msg: 'Apenas admin' }
  return { ok: true }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await exigirAdmin(request)
    if (!guard.ok) return NextResponse.json({ error: guard.msg }, { status: guard.status })

    const { userId, role, ramal, nome } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 })

    const update: Record<string, any> = {}
    if (role !== undefined) {
      const ROLES_VALIDOS = ['admin', 'lider', 'corretor', 'financeiro']
      if (!ROLES_VALIDOS.includes(role)) {
        return NextResponse.json({ error: 'role inválida' }, { status: 400 })
      }
      update.role = role
    }
    if (ramal !== undefined) update.ramal_goto = ramal || null
    if (nome !== undefined) {
      const limpo = String(nome).trim()
      if (!limpo) return NextResponse.json({ error: 'Nome não pode ser vazio' }, { status: 400 })
      update.nome = limpo
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
    }

    const { error } = await getSupabaseAdmin().from('users').update(update).eq('id', userId)
    if (error) {
      console.error('[set-role] erro:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[set-role] erro:', err?.message)
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 })
  }
}
