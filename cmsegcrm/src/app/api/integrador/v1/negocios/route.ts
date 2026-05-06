// API REST pública do Integrador — Negócios.
// GET  /api/integrador/v1/negocios?funil_id=&etapa=&q=&limit=&offset=
// POST /api/integrador/v1/negocios

import { NextRequest, NextResponse } from 'next/server'
import { autenticarApiKey, supabaseAdmin, registrarLog } from '@/lib/integrador'
import { criarNegocio } from '@/lib/integrador-upsert'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticarApiKey(req)
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: auth.status })
  if (!auth.escopos.includes('read')) return NextResponse.json({ ok: false, erro: 'sem escopo read' }, { status: 403 })

  const url = new URL(req.url)
  const funilId = url.searchParams.get('funil_id')
  const etapa = url.searchParams.get('etapa')
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200)
  const offset = Number(url.searchParams.get('offset') || 0)

  let query = supabaseAdmin()
    .from('negocios')
    .select('*, clientes(id,nome,email,telefone,cpf_cnpj), funis(id,nome,etapas)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (funilId) query = query.eq('funil_id', funilId)
  if (etapa) query = query.eq('etapa', etapa)
  const { data, error, count } = await query
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, total: count ?? 0, negocios: data })
}

export async function POST(req: NextRequest) {
  const auth = await autenticarApiKey(req)
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: auth.status })
  if (!auth.escopos.includes('write')) return NextResponse.json({ ok: false, erro: 'sem escopo write' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, erro: 'JSON inválido' }, { status: 400 }) }
  try {
    // Aceita os dois formatos: aninhado (cliente: {...}) ou plano.
    const cliente = body.cliente && typeof body.cliente === 'object'
      ? body.cliente
      : {
          nome: body.nome || body.cliente_nome,
          email: body.email,
          telefone: body.telefone,
          cpf_cnpj: body.cpf_cnpj,
          cep: body.cep,
          cidade: body.cidade,
          estado: body.estado,
          tipo: body.tipo_cliente,
        }
    const negocio = await criarNegocio({
      cliente,
      funil_id: body.funil_id,
      etapa: body.etapa,
      produto: body.produto,
      seguradora: body.seguradora,
      premio: body.premio,
      comissao_pct: body.comissao_pct,
      placa: body.placa,
      cpf_cnpj: body.cpf_cnpj,
      cep: body.cep,
      fonte: body.fonte || 'api',
      vencimento: body.vencimento,
      obs: body.obs,
      corretor_id: body.corretor_id,
      custom_fields: body.custom_fields,
    })
    await registrarLog({ conexaoId: auth.conexaoId, direcao: 'in', recurso: 'api:negocios', status: 'ok', http_status: 200, payload: body, resposta: { id: negocio.id } })
    return NextResponse.json({ ok: true, negocio })
  } catch (e: any) {
    const msg = e?.message || String(e)
    await registrarLog({ conexaoId: auth.conexaoId, direcao: 'in', recurso: 'api:negocios', status: 'erro', http_status: 500, payload: body, erro: msg })
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 })
  }
}
