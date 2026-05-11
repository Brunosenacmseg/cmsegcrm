// Reprocessa leads reais do Meta sem depender do webhook.
//
// Busca leads no Graph API (do form_id passado, ou de TODOS os forms ativos
// se nenhum for indicado) e roda pelo mesmo pipeline do webhook
// (`processarLeadgen`). Útil quando o webhook ficou inativo por permissão
// e leads "atrasaram" entrar no CRM.
//
// POST /api/meta/leads/reprocess
// Body: {
//   form_id?: string     // se omitido, varre todos os forms ativos
//   leadgen_id?: string  // se passado, reprocessa só esse lead
//   limit?: number       // qtos leads recentes por form, default 1
// }

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { GRAPH } from '@/lib/meta-graph'
import { processarLeadgen } from '@/lib/meta-lead'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

let _sa: SupabaseClient<Database> | null = null
function supabaseAdmin(): SupabaseClient<Database> {
  if (!_sa) _sa = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData, error } = await supabaseAdmin().auth.getUser(token)
  if (error || !userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', userData.user.id).single()
  if ((u as any)?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const }
}

async function buscarDetalhe(leadgenId: string, token: string) {
  const r = await fetch(
    `${GRAPH}/${leadgenId}?fields=field_data,ad_id,adset_id,campaign_id,form_id,created_time&access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(10000) },
  )
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.error) throw new Error(j?.error?.message || `HTTP ${r.status}`)
  return j
}

async function processarUm(leadgenId: string, fallbackFormId: string | null, fallbackPageId: string | null, token: string) {
  const det = await buscarDetalhe(leadgenId, token)
  const res = await processarLeadgen(supabaseAdmin(), {
    leadgenId: String(leadgenId),
    formId:     det.form_id || fallbackFormId,
    adId:       det.ad_id || null,
    adsetId:    det.adset_id || null,
    campaignId: det.campaign_id || null,
    pageId:     fallbackPageId,
    fieldData:  det.field_data || null,
  })
  return {
    leadgen_id: leadgenId,
    created_time: det.created_time || null,
    ok: res.ok,
    motivo: res.motivo || null,
    cliente_id: res.clienteId,
    negocio_id: res.negocioId,
    erros: res.erros,
  }
}

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const formIdFiltro: string | null = body.form_id ? String(body.form_id) : null
  const leadgenIdAlvo: string | null = body.leadgen_id ? String(body.leadgen_id) : null
  const limit = Math.max(1, Math.min(25, Number(body.limit) || 1))

  const { data: cfg } = await supabaseAdmin().from('meta_config')
    .select('page_access_token, access_token, page_id').eq('id', 1).maybeSingle()
  const token = (cfg as any)?.page_access_token || (cfg as any)?.access_token
  if (!token) return NextResponse.json({ error: 'Sem access_token/page_access_token salvo' }, { status: 400 })
  const pageId = (cfg as any)?.page_id || null

  // Caminho 1: leadgen_id direto
  if (leadgenIdAlvo) {
    try {
      const r = await processarUm(leadgenIdAlvo, formIdFiltro, pageId, token)
      return NextResponse.json({ ok: true, processados: [r] })
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'falha' }, { status: 500 })
    }
  }

  // Caminho 2: varre forms ativos (ou só o form_id passado)
  let forms: Array<{ form_id: string; page_id: string | null }>
  if (formIdFiltro) {
    const { data: m } = await supabaseAdmin().from('meta_form_mapeamento')
      .select('form_id, page_id').eq('form_id', formIdFiltro).maybeSingle()
    forms = [{ form_id: formIdFiltro, page_id: (m as any)?.page_id || pageId }]
  } else {
    const { data: maps } = await supabaseAdmin().from('meta_form_mapeamento')
      .select('form_id, page_id').eq('ativo', true)
    forms = (maps || []).map((m: any) => ({ form_id: String(m.form_id), page_id: m.page_id || pageId }))
  }

  const processados: any[] = []
  const falhas: any[] = []
  for (const f of forms) {
    try {
      const r = await fetch(
        `${GRAPH}/${f.form_id}/leads?fields=id,created_time&limit=${limit}&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(10000) },
      )
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j?.error) { falhas.push({ form_id: f.form_id, erro: j?.error?.message || `HTTP ${r.status}` }); continue }
      const leads: any[] = j.data || []
      for (const l of leads) {
        try {
          const out = await processarUm(String(l.id), f.form_id, f.page_id, token)
          processados.push({ form_id: f.form_id, ...out })
        } catch (e: any) {
          falhas.push({ form_id: f.form_id, leadgen_id: l.id, erro: e?.message || 'falha' })
        }
      }
    } catch (e: any) {
      falhas.push({ form_id: f.form_id, erro: e?.message || 'rede' })
    }
  }

  return NextResponse.json({ ok: true, processados, falhas, total: processados.length })
}
