// API REST pública do Integrador — Negócio individual.
// GET    /api/integrador/v1/negocios/:id
// PATCH  /api/integrador/v1/negocios/:id   { etapa?, produto?, premio?, ... }
// DELETE /api/integrador/v1/negocios/:id

import { NextRequest, NextResponse } from 'next/server'
import { autenticarApiKey, supabaseAdmin, registrarLog, dispararWebhooksSaida } from '@/lib/integrador'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await autenticarApiKey(req)
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: auth.status })
  if (!auth.escopos.includes('read')) return NextResponse.json({ ok: false, erro: 'sem escopo read' }, { status: 403 })

  const { data, error } = await supabaseAdmin()
    .from('negocios')
    .select('*, clientes(*), funis(id,nome,etapas)')
    .eq('id', ctx.params.id)
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, erro: 'não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true, negocio: data })
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await autenticarApiKey(req)
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: auth.status })
  if (!auth.escopos.includes('write')) return NextResponse.json({ ok: false, erro: 'sem escopo write' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, erro: 'JSON inválido' }, { status: 400 }) }

  const sa = supabaseAdmin()
  const { data: anterior } = await sa.from('negocios').select('*').eq('id', ctx.params.id).maybeSingle()
  if (!anterior) return NextResponse.json({ ok: false, erro: 'não encontrado' }, { status: 404 })

  const upd: any = { updated_at: new Date().toISOString() }
  for (const k of ['etapa','produto','seguradora','premio','comissao_pct','placa','cpf_cnpj','cep','fonte','vencimento','obs','corretor_id','custom_fields','funil_id']) {
    if (k in body) upd[k] = body[k]
  }
  const { data, error } = await sa.from('negocios').update(upd).eq('id', ctx.params.id).select('*').single()
  if (error) {
    await registrarLog({ conexaoId: auth.conexaoId, direcao: 'in', recurso: `api:negocios/${ctx.params.id}`, status: 'erro', http_status: 500, payload: body, erro: error.message })
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }

  if ('etapa' in body && body.etapa !== anterior.etapa) {
    void dispararWebhooksSaida('negocio.etapa_alterada', { id: data.id, anterior: anterior.etapa, atual: data.etapa })
    if (/ganho/i.test(String(body.etapa))) void dispararWebhooksSaida('negocio.ganho', data)
    if (/perdido/i.test(String(body.etapa))) void dispararWebhooksSaida('negocio.perdido', data)
  }
  void dispararWebhooksSaida('negocio.atualizado', data)
  await registrarLog({ conexaoId: auth.conexaoId, direcao: 'in', recurso: `api:negocios/${ctx.params.id}`, status: 'ok', http_status: 200, payload: body })
  return NextResponse.json({ ok: true, negocio: data })
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await autenticarApiKey(req)
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: auth.status })
  if (!auth.escopos.includes('write')) return NextResponse.json({ ok: false, erro: 'sem escopo write' }, { status: 403 })

  const { error } = await supabaseAdmin().from('negocios').delete().eq('id', ctx.params.id)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
