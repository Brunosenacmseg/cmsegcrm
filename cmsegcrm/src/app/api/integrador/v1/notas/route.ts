// API REST pública do Integrador — Notas (entradas em historico).
import { NextRequest, NextResponse } from 'next/server'
import { autenticarApiKey, registrarLog } from '@/lib/integrador'
import { criarNota } from '@/lib/integrador-upsert'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await autenticarApiKey(req)
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: auth.status })
  if (!auth.escopos.includes('write')) return NextResponse.json({ ok: false, erro: 'sem escopo write' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, erro: 'JSON inválido' }, { status: 400 }) }
  try {
    const nota = await criarNota(body)
    await registrarLog({ conexaoId: auth.conexaoId, direcao: 'in', recurso: 'api:notas', status: 'ok', http_status: 200, payload: body, resposta: { id: nota.id } })
    return NextResponse.json({ ok: true, nota })
  } catch (e: any) {
    const msg = e?.message || String(e)
    await registrarLog({ conexaoId: auth.conexaoId, direcao: 'in', recurso: 'api:notas', status: 'erro', http_status: 500, payload: body, erro: msg })
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 })
  }
}
