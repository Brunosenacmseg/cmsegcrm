// Webhook de entrada do Integrador.
//
// Qualquer ferramenta externa (Typeform, Zapier, Make, n8n, RD, formulário
// próprio, etc) faz POST para /api/integrador/in/<token>. O token é único
// por webhook configurado em /dashboard/integracoes/integrador.
//
// O sistema procura a conexão dona, aplica `mapa_campos` (dot-notation)
// pra normalizar o payload e cria a entidade de destino (negocio, cliente,
// tarefa ou nota).
//
// Aceita também GET para que ferramentas que validam URL (Meta, Slack)
// recebam 200.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin, aplicarMapa, registrarLog } from '@/lib/integrador'
import { upsertCliente, criarNegocio, criarTarefa, criarNota } from '@/lib/integrador-upsert'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Sempre 200 — alguns provedores (Meta, Slack) fazem GET para verificação.
// Não retornamos se o token existe ou não para evitar enumeração.
export async function GET() {
  return NextResponse.json({ ok: true })
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

export async function POST(req: NextRequest, ctx: { params: { token: string } }) {
  const sa = supabaseAdmin()
  let payload: any = {}
  try {
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      payload = await req.json()
    } else if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const fd = await req.formData()
      payload = Object.fromEntries(Array.from(fd.entries()))
    } else {
      const txt = await req.text()
      try { payload = JSON.parse(txt) } catch { payload = { raw: txt } }
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: 'payload inválido' }, { status: 400 })
  }

  // Carrega todos os webhooks ativos e faz comparação timing-safe contra o token recebido,
  // evitando que tempo de resposta vaze info sobre tokens válidos.
  const { data: webhooks } = await sa
    .from('integracoes_webhooks_in')
    .select('id, conexao_id, entidade_alvo, funil_id, etapa_inicial, responsavel_id, responsaveis_ids, responsavel_modo, mapa_campos, ativo, token')
    .eq('ativo', true)
  let wh: any = null
  for (const w of (webhooks || []) as any[]) {
    if (typeof w.token === 'string' && timingSafeEqualStr(w.token, ctx.params.token)) { wh = w; break }
  }
  if (!wh) {
    // Não logar o token completo recebido, evita PII em logs.
    await registrarLog({ direcao: 'in', recurso: `webhook_in:token=invalid`, status: 'erro', http_status: 404, payload, erro: 'webhook não encontrado' })
    return NextResponse.json({ ok: false, erro: 'Webhook não encontrado' }, { status: 404 })
  }
  if (!wh.ativo) {
    await registrarLog({ conexaoId: wh.conexao_id as string, direcao: 'in', recurso: `webhook_in:${wh.id}`, status: 'erro', http_status: 423, payload, erro: 'webhook desativado' })
    return NextResponse.json({ ok: false, erro: 'Webhook desativado' }, { status: 423 })
  }

  const mapa = (wh.mapa_campos as Record<string, any>) || {}
  // Se o mapa estiver vazio, assume que o payload já está no formato esperado.
  const dados = Object.keys(mapa).length ? aplicarMapa(payload, mapa) : payload
  const entidade = wh.entidade_alvo as 'negocio' | 'cliente' | 'tarefa' | 'nota'

  // Resolve responsável: modo sequencial rotaciona pela lista responsaveis_ids
  // (round-robin atômico via RPC). Modo fixo usa responsavel_id.
  let responsavelFinal: string | null = (wh.responsavel_id as string | null) || null
  if (wh.responsavel_modo === 'sequencial' && Array.isArray(wh.responsaveis_ids) && wh.responsaveis_ids.length > 0) {
    const { data: prox } = await sa.rpc('integrador_next_responsavel', { p_webhook_id: wh.id })
    if (prox) responsavelFinal = prox as unknown as string
  }

  try {
    let resultado: any
    if (entidade === 'cliente') {
      const r = await upsertCliente(dados as any, 'integrador')
      resultado = { tipo: 'cliente', ...r }
    } else if (entidade === 'negocio') {
      // Suporta dois formatos: campos misturados (nome, email, ..., produto, premio)
      // ou estrutura aninhada com `cliente: {...}`.
      const cliente = (dados as any).cliente && typeof (dados as any).cliente === 'object'
        ? (dados as any).cliente
        : {
            nome: (dados as any).nome || (dados as any).cliente_nome,
            email: (dados as any).email,
            telefone: (dados as any).telefone,
            cpf_cnpj: (dados as any).cpf_cnpj || (dados as any).cpf || (dados as any).cnpj,
            cep: (dados as any).cep,
            cidade: (dados as any).cidade,
            estado: (dados as any).estado,
            tipo: (dados as any).tipo_cliente,
          }
      const negocio = await criarNegocio(
        {
          cliente,
          funil_id: (dados as any).funil_id || (wh.funil_id as string | null) || undefined,
          etapa: (dados as any).etapa || (wh.etapa_inicial as string | null) || undefined,
          produto: (dados as any).produto,
          seguradora: (dados as any).seguradora,
          premio: parseNumero((dados as any).premio),
          comissao_pct: parseNumero((dados as any).comissao_pct),
          placa: (dados as any).placa,
          cpf_cnpj: (dados as any).cpf_cnpj,
          cep: (dados as any).cep,
          fonte: (dados as any).fonte || 'integrador',
          vencimento: (dados as any).vencimento,
          obs: (dados as any).obs,
          corretor_id: (dados as any).corretor_id,
          custom_fields: (dados as any).custom_fields,
        },
        {
          funil_id: (wh.funil_id as string | null) || undefined,
          etapa: (wh.etapa_inicial as string | null) || undefined,
          responsavel_id: responsavelFinal || undefined,
        }
      )
      resultado = { tipo: 'negocio', id: negocio.id }
    } else if (entidade === 'tarefa') {
      const tarefa = await criarTarefa(dados as any, { responsavel_id: responsavelFinal || undefined })
      resultado = { tipo: 'tarefa', id: tarefa.id }
    } else if (entidade === 'nota') {
      const nota = await criarNota(dados as any)
      resultado = { tipo: 'nota', id: nota.id }
    } else {
      throw new Error(`entidade ${entidade} não suportada`)
    }
    await registrarLog({
      conexaoId: wh.conexao_id as string,
      direcao: 'in',
      recurso: `webhook_in:${wh.id}`,
      status: 'ok',
      http_status: 200,
      payload,
      resposta: resultado,
    })
    return NextResponse.json({ ok: true, ...resultado })
  } catch (e: any) {
    const msg = e?.message || String(e)
    await registrarLog({
      conexaoId: wh.conexao_id as string,
      direcao: 'in',
      recurso: `webhook_in:${wh.id}`,
      status: 'erro',
      http_status: 500,
      payload,
      erro: msg,
    })
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 })
  }
}

function parseNumero(v: any): number | undefined {
  if (v == null || v === '') return undefined
  if (typeof v === 'number') return v
  const s = String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}
