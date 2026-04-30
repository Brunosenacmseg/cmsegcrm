import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId, role, ramal } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 })
    }

    const update: Record<string, any> = {}

    if (role !== undefined) update.role = role
    if (ramal !== undefined) update.ramal_goto = ramal || null

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update(update)
      .eq('id', userId)

    if (error) {
      console.error('[set-role] Erro:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[set-role] Erro:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
