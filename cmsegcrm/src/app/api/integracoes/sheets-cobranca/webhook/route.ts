// Webhook Google Sheets → Funil Cobrança.
//
// O Apps Script (rodando onChange/onEdit/onFormSubmit na planilha) envia
// cada linha pra cá, com um token compartilhado pra autenticação.
//
// POST /api/integracoes/sheets-cobranca/webhook
//   Headers: X-Sheet-Token: <token>   (ou body.token)
//   Body: {
//     row_id?: string,              // identificador único pra idempotência
//     nome:    string,              // nome do cliente (obrigatório)
//     cpf_cnpj?: string,
//     telefone?: string,
//     email?:    string,
//     valor?:    number|string,     // vai pra premio/valor_unico
//     vencimento?: string,          // ISO ou dd/mm/aaaa
//     produto?:  string,
//     seguradora?: string,
//     obs?:      string,
//     etapa?:    string,            // override; default = etapa_padrao
//     extras?:   object             // qualquer coisa adicional vai pra custom_fields
//   }
//
// Retorna { ok: true, negocio_id, cliente_id, duplicado? } ou erro.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

let _sa: any = null
function supabaseAdmin(): any {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

// ─── helpers ─────────────────────────────────────────────────────
function s(v: any): string | null {
  if (v === undefined || v === null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

function num(v: any): number | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  let str = String(v).trim().replace(/[R$\s]/g, '')
  if (!str) return null
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.')
  else if ((str.match(/\./g) || []).length > 1) str = str.replace(/\./g, '')
  const n = Number(str)
  return isFinite(n) ? n : null
}

function parseDate(v: any): string | null {
  const t = s(v)
  if (!t) return null
  // ISO yyyy-mm-dd já vem pronto
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  // dd/mm/yyyy
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) {
    let [_, d, mo, y] = m
    if (y.length === 2) y = '20' + y
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // tenta Date()
  const d = new Date(t)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function onlyDigits(v: any): string | null {
  const t = s(v); if (!t) return null
  const out = t.replace(/\D+/g, '')
  return out || null
}

// ─── POST ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }

  // Carrega config
  const { data: cfg, error: errCfg } = await supabaseAdmin()
    .from('integracao_sheets_cobranca')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (errCfg) return NextResponse.json({ ok: false, error: 'Erro ao ler config: ' + errCfg.message }, { status: 500 })
  if (!cfg)        return NextResponse.json({ ok: false, error: 'Integração não configurada' }, { status: 503 })
  if (!cfg.ativo)  return NextResponse.json({ ok: false, error: 'Integração desativada' }, { status: 503 })

  // Auth via token compartilhado (header preferido)
  const tokenHeader = req.headers.get('x-sheet-token') || req.headers.get('X-Sheet-Token')
  const auth        = req.headers.get('authorization') || ''
  const tokenBearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null
  const token       = (tokenHeader || tokenBearer || body.token || '').trim()

  if (!cfg.webhook_token) {
    return NextResponse.json({ ok: false, error: 'webhook_token não configurado' }, { status: 503 })
  }
  if (token !== cfg.webhook_token) {
    return NextResponse.json({ ok: false, error: 'Token inválido' }, { status: 401 })
  }

  // Sanitiza dados da linha
  const nome     = s(body.nome) || s(body.cliente) || s(body.razao_social)
  if (!nome) {
    await supabaseAdmin().from('integracao_sheets_cobranca_logs').insert({
      external_id: s(body.row_id), payload: body, status: 'erro',
      erro: 'nome obrigatório',
    })
    return NextResponse.json({ ok: false, error: 'Campo "nome" é obrigatório' }, { status: 400 })
  }

  const externalId = s(body.row_id)

  // Idempotência: se já temos log com esse external_id e status ok/duplicado, devolve.
  if (externalId) {
    const { data: existente } = await supabaseAdmin()
      .from('integracao_sheets_cobranca_logs')
      .select('id, status, negocio_id, cliente_id')
      .eq('external_id', externalId)
      .in('status', ['ok', 'duplicado'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existente) {
      // Loga duplicado e retorna o negócio existente
      await supabaseAdmin().from('integracao_sheets_cobranca_logs').insert({
        external_id: externalId, payload: body, status: 'duplicado',
        cliente_id: (existente as any).cliente_id, negocio_id: (existente as any).negocio_id,
      }).then(()=>{}, ()=>{})
      return NextResponse.json({
        ok: true, duplicado: true,
        negocio_id: (existente as any).negocio_id,
        cliente_id: (existente as any).cliente_id,
      })
    }
  }

  const cpfCnpj = onlyDigits(body.cpf_cnpj || body.cpf || body.cnpj)
  const tel     = s(body.telefone) || s(body.celular) || s(body.fone)
  const email   = s(body.email)?.toLowerCase() || null
  const valor   = num(body.valor)
  const venc    = parseDate(body.vencimento || body.data_vencimento || body.due_date)
  const produto = s(body.produto)
  const seguradora = s(body.seguradora)
  const obs        = s(body.obs) || s(body.observacao) || s(body.observacoes)
  const etapa      = s(body.etapa) || s(cfg.etapa_padrao) || 'Em Atraso'

  // Acha ou cria cliente — preferência por cpf_cnpj, depois email, depois (telefone+nome)
  let clienteId: string | null = null
  let clienteExistente = false
  try {
    if (cpfCnpj) {
      const { data } = await supabaseAdmin().from('clientes').select('id').eq('cpf_cnpj', cpfCnpj).limit(1)
      if (data?.[0]) { clienteId = (data[0] as any).id; clienteExistente = true }
    }
    if (!clienteId && email) {
      const { data } = await supabaseAdmin().from('clientes').select('id').ilike('email', email).limit(1)
      if (data?.[0]) { clienteId = (data[0] as any).id; clienteExistente = true }
    }
    if (!clienteId) {
      const tipo = cpfCnpj && cpfCnpj.length > 11 ? 'PJ' : 'PF'
      const { data, error } = await supabaseAdmin().from('clientes').insert({
        nome,
        tipo,
        cpf_cnpj: cpfCnpj,
        email,
        telefone: tel,
        fonte: 'Google Sheets · Cobrança',
        vendedor_id: cfg.vendedor_padrao_id || null,
        corretor_id: cfg.vendedor_padrao_id || null,
      }).select('id').single()
      if (error) throw new Error('cliente: ' + error.message)
      clienteId = (data as any).id
    }
  } catch (e: any) {
    await supabaseAdmin().from('integracao_sheets_cobranca_logs').insert({
      external_id: externalId, payload: body, status: 'erro', erro: e.message || String(e),
    })
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 })
  }

  // Define funil
  let funilId = cfg.funil_id as string | null
  if (!funilId) {
    const { data: f } = await supabaseAdmin().from('funis').select('id, etapas').eq('tipo', 'cobranca').order('ordem').limit(1).maybeSingle()
    if (f) { funilId = (f as any).id }
  }
  if (!funilId) {
    await supabaseAdmin().from('integracao_sheets_cobranca_logs').insert({
      external_id: externalId, payload: body, status: 'erro', erro: 'Nenhum funil de cobrança disponível',
      cliente_id: clienteId,
    })
    return NextResponse.json({ ok: false, error: 'Nenhum funil de cobrança disponível' }, { status: 500 })
  }

  // Custom fields: tudo que não bate com coluna conhecida
  const conhecidos = new Set([
    'token', 'row_id', 'nome', 'cliente', 'razao_social',
    'cpf_cnpj', 'cpf', 'cnpj', 'telefone', 'celular', 'fone', 'email',
    'valor', 'vencimento', 'data_vencimento', 'due_date',
    'produto', 'seguradora', 'obs', 'observacao', 'observacoes', 'etapa', 'extras',
  ])
  const custom: Record<string, any> = { ...(body.extras || {}) }
  for (const k of Object.keys(body)) {
    if (!conhecidos.has(k) && k !== 'extras') custom[k] = body[k]
  }
  custom.origem_sheets = true
  if (externalId) custom.sheet_row_id = externalId

  // Cria negocio
  const { data: negocio, error: errNeg } = await supabaseAdmin().from('negocios').insert({
    cliente_id:    clienteId,
    funil_id:      funilId,
    etapa,
    titulo:        `Cobrança · ${nome}`,
    produto,
    seguradora,
    premio:        valor,
    valor_unico:   valor,
    cpf_cnpj:      cpfCnpj,
    vencimento:    venc,
    obs,
    fonte:         'Google Sheets · Cobrança',
    corretor_id:   cfg.vendedor_padrao_id || null,
    vendedor_id:   cfg.vendedor_padrao_id || null,
    custom_fields: custom,
  }).select('id').single()

  if (errNeg) {
    await supabaseAdmin().from('integracao_sheets_cobranca_logs').insert({
      external_id: externalId, payload: body, status: 'erro', erro: 'negocio: ' + errNeg.message,
      cliente_id: clienteId,
    })
    return NextResponse.json({ ok: false, error: 'negocio: ' + errNeg.message }, { status: 500 })
  }

  const negocioId = (negocio as any).id

  // Histórico (best-effort)
  await supabaseAdmin().from('historico').insert({
    cliente_id: clienteId,
    negocio_id: negocioId,
    tipo: 'gold',
    titulo: 'Negócio criado via Google Sheets (Cobrança)',
    descricao: externalId ? `Linha: ${externalId}` : null,
  }).then(()=>{}, ()=>{})

  // Log + atualiza estatísticas
  await supabaseAdmin().from('integracao_sheets_cobranca_logs').insert({
    external_id: externalId, payload: body, status: 'ok',
    cliente_id: clienteId, negocio_id: negocioId,
  })

  await supabaseAdmin().from('integracao_sheets_cobranca').update({
    ultima_execucao: new Date().toISOString(),
    total_recebidos: (cfg.total_recebidos || 0) + 1,
    total_criados:   (cfg.total_criados   || 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)

  return NextResponse.json({
    ok: true,
    negocio_id: negocioId,
    cliente_id: clienteId,
    cliente_existente: clienteExistente,
    funil_id: funilId,
    etapa,
  })
}

// GET — health-check pra o Apps Script confirmar a URL.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'sheets-cobranca-webhook' })
}
