// API REST pública do Integrador — Tarefas.
import { NextRequest, NextResponse } from 'next/server'
import { autenticarApiKey, supabaseAdmin, registrarLog } from '@/lib/integrador'
import { criarTarefa } from '@/lib/integrador-upsert'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticarApiKey(req)
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: auth.status })
  if (!auth.escopos.includes('read')) return NextResponse.json({ ok: false, erro: 'sem escopo read' }, { status: 403 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const responsavel = url.searchParams.get('responsavel_id')
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200)
  const offset = Number(url.searchParams.get('offset') || 0)

  let q = supabaseAdmin().from('tarefas').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  if (status) q = q.eq('status', status)
  if (responsavel) q = q.eq('responsavel_id', responsavel)
  const { data, error, count } = await q
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, total: count ?? 0, tarefas: data })
}

export async function POST(req: NextRequest) {
  const auth = await autenticarApiKey(req)
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: auth.status })
  if (!auth.escopos.includes('write')) return NextResponse.json({ ok: false, erro: 'sem escopo write' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, erro: 'JSON inválido' }, { status: 400 }) }
  try {
    const tarefa = await criarTarefa(body)
    await registrarLog({ conexaoId: auth.conexaoId, direcao: 'in', recurso: 'api:tarefas', status: 'ok', http_status: 200, payload: body, resposta: { id: tarefa.id } })
    return NextResponse.json({ ok: true, tarefa })
  } catch (e: any) {
    const msg = e?.message || String(e)
    await registrarLog({ conexaoId: auth.conexaoId, direcao: 'in', recurso: 'api:tarefas', status: 'erro', http_status: 500, payload: body, erro: msg })
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 })
  }
}
