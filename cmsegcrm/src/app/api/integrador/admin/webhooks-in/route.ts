// Rota interna do dashboard — gera token de webhook de entrada.
// O token entra na URL pública, não há "token secreto" extra.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateInboundToken, supabaseAdmin } from '@/lib/integrador'

export const dynamic = 'force-dynamic'

async function autenticarUsuario(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await sb.auth.getUser(token)
  return data?.user || null
}

async function podeUsar(userId: string, conexaoId: string) {
  const sa = supabaseAdmin()
  const { data: u } = await sa.from('users').select('role').eq('id', userId).single()
  if (u?.role === 'admin') return true
  const { data: c } = await sa.from('integracoes_conexoes').select('owner_id').eq('id', conexaoId).maybeSingle()
  return c?.owner_id === userId
}

export async function POST(req: NextRequest) {
  const user = await autenticarUsuario(req)
  if (!user) return NextResponse.json({ ok: false, erro: 'não autenticado' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, erro: 'JSON inválido' }, { status: 400 }) }
  const { conexao_id, nome, entidade_alvo, funil_id, etapa_inicial, responsavel_id, mapa_campos } = body || {}
  if (!conexao_id || !nome || !entidade_alvo) return NextResponse.json({ ok: false, erro: 'conexao_id, nome, entidade_alvo obrigatórios' }, { status: 400 })
  if (!(await podeUsar(user.id, conexao_id))) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })

  const t = generateInboundToken()
  const { data, error } = await supabaseAdmin().from('integracoes_webhooks_in').insert({
    conexao_id,
    nome,
    token: t,
    entidade_alvo,
    funil_id: funil_id || null,
    etapa_inicial: etapa_inicial || null,
    responsavel_id: responsavel_id || null,
    mapa_campos: mapa_campos || {},
  }).select('*').single()
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, webhook: data })
}
