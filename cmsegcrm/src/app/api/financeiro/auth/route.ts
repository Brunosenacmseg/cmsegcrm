// Verifica/troca a senha do módulo financeiro.
//
// POST /api/financeiro/auth         { senha }              → { ok: boolean }
// POST /api/financeiro/auth?set=1   { senha_atual, nova }  → { ok }  (admin)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checarUsuario(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data } = await supabaseAdmin.auth.getUser(token)
  if (!data?.user) return null
  const { data: u } = await supabaseAdmin.from('users').select('id, role').eq('id', data.user.id).single()
  return u
}

export async function POST(req: NextRequest) {
  const user = await checarUsuario(req)
  if (!user) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const url = new URL(req.url)
  const body = await req.json().catch(() => ({}))
  const setMode = url.searchParams.get('set') === '1'

  if (setMode) {
    if (user.role !== 'admin') return NextResponse.json({ erro: 'Apenas admin' }, { status: 403 })
    const senhaAtual = String(body.senha_atual || '')
    const nova = String(body.nova || '')
    if (nova.length < 4) return NextResponse.json({ erro: 'Nova senha muito curta' }, { status: 400 })

    const { data: ok } = await supabaseAdmin.rpc('verificar_senha_financeiro', { senha: senhaAtual })
    if (!ok) return NextResponse.json({ erro: 'Senha atual incorreta' }, { status: 403 })

    const { error } = await supabaseAdmin.rpc('set_senha_financeiro', { nova })
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    await supabaseAdmin.from('financeiro_config').update({ updated_by: user.id }).eq('id', 1)
    return NextResponse.json({ ok: true })
  }

  // Verificar senha
  const senha = String(body.senha || '')
  if (!senha) return NextResponse.json({ ok: false }, { status: 400 })
  const { data: ok } = await supabaseAdmin.rpc('verificar_senha_financeiro', { senha })
  return NextResponse.json({ ok: !!ok })
}
