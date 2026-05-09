// Webhook do Meta Lead Ads.
//
// GET  → verificação inicial (Meta envia hub.challenge)
// POST → recebe novos leads via "leadgen" event
//
// Configuração no Meta:
//   1) Em Meta for Developers → seu app → Webhooks → Page → Add subscription
//      URL: https://seu-dominio.com/api/meta/webhook
//      Verify token: o mesmo que você guardou em meta_config.verify_token
//      Subscribed fields: leadgen
//   2) Subscrever a Page: POST /{page_id}/subscribed_apps?subscribed_fields=leadgen
//      (feito pela /api/meta/connect)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { GRAPH, verifyMetaSignature } from '@/lib/meta-graph'
import { processarLeadgen } from '@/lib/meta-lead'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

// ─── GET: Meta envia challenge pra verificar a URL ──────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const { data: cfg } = await supabaseAdmin().from('meta_config').select('verify_token').eq('id', 1).maybeSingle()
  const verify = cfg?.verify_token || process.env.META_VERIFY_TOKEN

  if (mode === 'subscribe' && verify && token === verify) {
    return new NextResponse(challenge || '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// ─── POST: novo lead ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Lê o corpo cru pra poder validar a assinatura HMAC SHA-256 que a Meta
  // envia no header X-Hub-Signature-256 (computada com app_secret sobre o
  // JSON exato). Sem isso, qualquer um pode injetar leads via POST.
  const raw = await req.text()
  let body: any = {}
  try { body = JSON.parse(raw) } catch {
    return NextResponse.json({ ok: false, erro: 'JSON inválido' }, { status: 400 })
  }

  const { data: cfg } = await supabaseAdmin().from('meta_config')
    .select('access_token, page_access_token, app_secret').eq('id', 1).maybeSingle()
  const accessToken = (cfg?.page_access_token as string) || (cfg?.access_token as string) || null
  const appSecret = (cfg?.app_secret as string) || process.env.META_APP_SECRET || null

  const sigHeader = req.headers.get('x-hub-signature-256')
  const verif = verifyMetaSignature(raw, sigHeader, appSecret)
  if (verif === false) {
    console.warn('[meta-webhook] assinatura X-Hub-Signature-256 inválida — rejeitando POST')
    return NextResponse.json({ ok: false, erro: 'assinatura inválida' }, { status: 403 })
  }
  if (verif === null) {
    // Sem app_secret configurado: NUNCA aceitar POST anônimo do Meta — é a
    // única defesa contra injeção de leads falsos. Configure em
    // /dashboard/integracoes/meta ou via env META_APP_SECRET.
    console.error('[meta-webhook] app_secret não configurado — recusando POST.')
    return NextResponse.json({ ok: false, erro: 'webhook não configurado (app_secret ausente)' }, { status: 503 })
  }

  // Estrutura típica: { object: 'page', entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id, ad_id, ... } }] }] }
  const entries: any[] = body?.entry || []

  const recebidos: any[] = []
  for (const e of entries) {
    for (const c of (e.changes || [])) {
      if (c.field !== 'leadgen') continue
      const v = c.value || {}
      const leadgenId = v.leadgen_id
      if (!leadgenId) continue

      // Estado do lead enriquecido pelo Graph API
      let formId: string | null = v.form_id ? String(v.form_id) : null
      let adId: string | null = v.ad_id ? String(v.ad_id) : null
      let adsetId: string | null = v.adgroup_id ? String(v.adgroup_id) : null
      let campaignId: string | null = null
      const pageId: string | null = v.page_id ? String(v.page_id) : null
      let fieldData: any = null

      // Busca o lead detalhado na Graph API. Idealmente com page_access_token
      // (leads_retrieval é page-scoped); cai pra user token como fallback.
      if (accessToken) {
        try {
          const r = await fetch(`${GRAPH}/${leadgenId}?fields=field_data,ad_id,adset_id,campaign_id,form_id&access_token=${encodeURIComponent(accessToken)}`, {
            signal: AbortSignal.timeout(10000),
          })
          const j = await r.json().catch(() => ({}))
          if (r.ok && !j?.error) {
            fieldData  = j.field_data || null
            adId       = j.ad_id || adId
            adsetId    = j.adset_id || adsetId
            campaignId = j.campaign_id || null
            formId     = j.form_id || formId
          } else {
            console.error('[meta-webhook] falha ao buscar leadgen', leadgenId, j?.error || `HTTP ${r.status}`)
          }
        } catch (e) {
          console.error('[meta-webhook] erro de rede buscando leadgen', leadgenId, e)
        }
      } else {
        console.warn('[meta-webhook] sem access_token configurado — não foi possível enriquecer lead', leadgenId)
      }

      const resultado = await processarLeadgen(supabaseAdmin(), {
        leadgenId: String(leadgenId),
        formId,
        adId,
        adsetId,
        campaignId,
        pageId,
        fieldData,
      })

      if (!resultado.ok) {
        console.error('[meta-webhook] processamento incompleto', leadgenId, resultado.motivo, resultado.erros)
      }

      recebidos.push({ leadgenId, clienteId: resultado.clienteId, negocioId: resultado.negocioId })
    }
  }

  return NextResponse.json({ ok: true, recebidos: recebidos.length })
}
