// Config admin da integração Google Sheets → Cobrança.
//
// GET    /api/integracoes/sheets-cobranca/config     → devolve config + estatísticas
// POST   /api/integracoes/sheets-cobranca/config     → atualiza config (admin)
// DELETE /api/integracoes/sheets-cobranca/config     → desativa e zera token

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

let _sa: any = null
function supabaseAdmin(): any {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData } = await supabaseAdmin().auth.getUser(token)
  if (!userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', userData.user.id).single()
  if ((u as any)?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const, userId: userData.user.id }
}

function genToken(): string {
  return 'shk_' + randomBytes(24).toString('hex')
}

export async function GET(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const { data: cfg } = await supabaseAdmin().from('integracao_sheets_cobranca').select('*').eq('id', 1).maybeSingle()

  // Funis disponíveis (tipo cobranca)
  const { data: funis } = await supabaseAdmin().from('funis').select('id, nome, etapas, tipo').eq('tipo', 'cobranca').order('ordem')

  // Últimos 50 logs
  const { data: logs } = await supabaseAdmin()
    .from('integracao_sheets_cobranca_logs')
    .select('id, external_id, status, erro, cliente_id, negocio_id, created_at, payload')
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ config: cfg, funis: funis || [], logs: logs || [] })
}

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}

  const patch: any = { updated_at: new Date().toISOString(), configurado_por: auth.userId }
  if ('ativo' in body)              patch.ativo              = !!body.ativo
  if ('funil_id' in body)           patch.funil_id           = body.funil_id || null
  if ('etapa_padrao' in body)       patch.etapa_padrao       = body.etapa_padrao || null
  if ('vendedor_padrao_id' in body) patch.vendedor_padrao_id = body.vendedor_padrao_id || null
  if ('spreadsheet_id' in body)     patch.spreadsheet_id     = body.spreadsheet_id || null
  if ('spreadsheet_url' in body)    patch.spreadsheet_url    = body.spreadsheet_url || null

  // Geração / regeneração de token
  if (body.regenerar_token === true || body.gerar_token === true) {
    patch.webhook_token = genToken()
  } else if ('webhook_token' in body) {
    patch.webhook_token = body.webhook_token || null
  }

  // Garante config existente
  await supabaseAdmin().from('integracao_sheets_cobranca').upsert({ id: 1, ...patch }, { onConflict: 'id' })

  // Se ainda nao tem token mas o admin esta ativando, gera automaticamente
  const { data: cfg } = await supabaseAdmin().from('integracao_sheets_cobranca').select('*').eq('id', 1).maybeSingle()
  if (cfg && (cfg as any).ativo && !(cfg as any).webhook_token) {
    const tk = genToken()
    await supabaseAdmin().from('integracao_sheets_cobranca').update({ webhook_token: tk, updated_at: new Date().toISOString() }).eq('id', 1)
  }

  const { data: final } = await supabaseAdmin().from('integracao_sheets_cobranca').select('*').eq('id', 1).maybeSingle()
  return NextResponse.json({ ok: true, config: final })
}

export async function DELETE(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  await supabaseAdmin().from('integracao_sheets_cobranca').update({
    ativo: false, webhook_token: null, updated_at: new Date().toISOString(),
  }).eq('id', 1)

  return NextResponse.json({ ok: true })
}
