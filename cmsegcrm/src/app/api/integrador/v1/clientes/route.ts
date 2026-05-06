// API REST pública do Integrador — Clientes.
// Auth: Authorization: Bearer cmint_xxx (API Key)
// GET  /api/integrador/v1/clientes              -> lista (paginação por ?limit & ?offset & ?q)
// POST /api/integrador/v1/clientes              -> cria/atualiza (upsert por cpf/email/telefone)

import { NextRequest, NextResponse } from 'next/server'
import { autenticarApiKey, supabaseAdmin, registrarLog } from '@/lib/integrador'
import { upsertCliente } from '@/lib/integrador-upsert'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticarApiKey(req)
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: auth.status })
  if (!auth.escopos.includes('read')) return NextResponse.json({ ok: false, erro: 'sem escopo read' }, { status: 403 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q') || ''
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200)
  const offset = Number(url.searchParams.get('offset') || 0)

  let query = supabaseAdmin().from('clientes').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  if (q) query = query.or(`nome.ilike.%${q}%,email.ilike.%${q}%,cpf_cnpj.ilike.%${q}%`)
  const { data, error, count } = await query
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, total: count ?? 0, clientes: data })
}

export async function POST(req: NextRequest) {
  const auth = await autenticarApiKey(req)
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: auth.status })
  if (!auth.escopos.includes('write')) return NextResponse.json({ ok: false, erro: 'sem escopo write' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, erro: 'JSON inválido' }, { status: 400 }) }
  try {
    const r = await upsertCliente(body, 'api')
    await registrarLog({ conexaoId: auth.conexaoId, direcao: 'in', recurso: 'api:clientes', status: 'ok', http_status: 200, payload: body, resposta: r })
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    const msg = e?.message || String(e)
    await registrarLog({ conexaoId: auth.conexaoId, direcao: 'in', recurso: 'api:clientes', status: 'erro', http_status: 500, payload: body, erro: msg })
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 })
  }
}
