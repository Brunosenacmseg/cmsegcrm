// Rota interna do dashboard — gera token de webhook de entrada.
// O token entra na URL pública, não há "token secreto" extra.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { generateInboundToken, supabaseAdmin } from '@/lib/integrador'

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
  const { conexao_id, nome, entidade_alvo, funil_id, etapa_inicial, responsavel_id, responsaveis_ids, responsavel_modo, mapa_campos } = body || {}
  if (!conexao_id || !nome || !entidade_alvo) return NextResponse.json({ ok: false, erro: 'conexao_id, nome, entidade_alvo obrigatórios' }, { status: 400 })
  if (!(await ehAdmin(user.id))) return NextResponse.json({ ok: false, erro: 'apenas admin' }, { status: 403 })

  const modo = responsavel_modo === 'sequencial' ? 'sequencial' : 'fixo'
  const listaIds = Array.isArray(responsaveis_ids) ? responsaveis_ids.filter((x: any) => typeof x === 'string' && x) : []
  if (modo === 'sequencial' && listaIds.length === 0) {
    return NextResponse.json({ ok: false, erro: 'modo sequencial exige pelo menos 1 responsável' }, { status: 400 })
  }

  const t = generateInboundToken()
  const { data, error } = await supabaseAdmin().from('integracoes_webhooks_in').insert({
    conexao_id,
    nome,
    token: t,
    entidade_alvo,
    funil_id: funil_id || null,
    etapa_inicial: etapa_inicial || null,
    responsavel_id: modo === 'fixo' ? (responsavel_id || null) : null,
    responsaveis_ids: listaIds,
    responsavel_modo: modo,
    mapa_campos: mapa_campos || {},
  }).select('*').single()
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, webhook: data })
}
