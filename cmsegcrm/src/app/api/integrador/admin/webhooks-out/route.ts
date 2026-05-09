// Rota interna do dashboard — cria webhook de saída (e gera secret se faltar).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { generateSecret, supabaseAdmin } from '@/lib/integrador'

export const dynamic = 'force-dynamic'

async function autenticarUsuario(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await sb.auth.getUser(token)
  return data?.user || null
}

async function ehAdmin(userId: string) {
  const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', userId).single()
  return u?.role === 'admin'
}

export async function POST(req: NextRequest) {
  const user = await autenticarUsuario(req)
  if (!user) return NextResponse.json({ ok: false, erro: 'não autenticado' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, erro: 'JSON inválido' }, { status: 400 }) }
  const { conexao_id, nome, url, eventos, secret } = body || {}
  if (!conexao_id || !nome || !url) return NextResponse.json({ ok: false, erro: 'conexao_id, nome, url obrigatórios' }, { status: 400 })
  try { new URL(url) } catch { return NextResponse.json({ ok: false, erro: 'url inválida' }, { status: 400 }) }
  if (!(await ehAdmin(user.id))) return NextResponse.json({ ok: false, erro: 'apenas admin' }, { status: 403 })

  const { data, error } = await supabaseAdmin().from('integracoes_webhooks_out').insert({
    conexao_id,
    nome,
    url,
    secret: secret || generateSecret(),
    eventos: Array.isArray(eventos) ? eventos : [],
  }).select('*').single()
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, webhook: data })
}
