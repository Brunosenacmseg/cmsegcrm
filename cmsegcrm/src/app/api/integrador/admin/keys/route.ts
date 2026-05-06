// Rota interna do dashboard — gera API keys.
// O token bruto é retornado APENAS uma vez, na criação. Depois só fica
// disponível o prefixo (8 chars).
//
// Auth: usuário logado precisa ser dono da conexão OU admin.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateApiKey, supabaseAdmin } from '@/lib/integrador'

export const dynamic = 'force-dynamic'

async function autenticarUsuario(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
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
  const { conexao_id, nome, escopos, expira_em } = body || {}
  if (!conexao_id || !nome) return NextResponse.json({ ok: false, erro: 'conexao_id e nome obrigatórios' }, { status: 400 })
  if (!(await ehAdmin(user.id))) return NextResponse.json({ ok: false, erro: 'apenas admin' }, { status: 403 })

  const k = generateApiKey()
  const { data, error } = await supabaseAdmin().from('integracoes_api_keys').insert({
    conexao_id,
    nome,
    prefixo: k.prefixo,
    token_hash: k.hash,
    escopos: Array.isArray(escopos) && escopos.length ? escopos : ['read', 'write'],
    expira_em: expira_em || null,
  }).select('id, prefixo, escopos, criada_em, expira_em').single()
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  // ATENÇÃO: token aparece UMA única vez aqui.
  return NextResponse.json({ ok: true, key: { ...data, token: k.token } })
}
