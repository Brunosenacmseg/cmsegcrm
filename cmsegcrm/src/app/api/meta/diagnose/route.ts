// Diagnóstico real-time da integração Meta Lead Ads.
//
// Server-side, usando page_access_token salvo, faz três chamadas pra Graph API
// e retorna um relatório consolidado pra UI. Útil quando webhook_subscribed=true
// no banco mas Meta não está disparando — esse endpoint mostra exatamente
// onde está o gap (page não inscrita, app em dev mode, form sem submissão,
// campanha pausada etc.).
//
// GET /api/meta/diagnose  (admin only)

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { GRAPH } from '@/lib/meta-graph'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

type GraphFetch = { ok: boolean; status: number; data?: any; error?: string }
async function graph(url: string, init?: RequestInit): Promise<GraphFetch> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || data?.error) {
      return { ok: false, status: r.status, data, error: data?.error?.message || `HTTP ${r.status}` }
    }
    return { ok: true, status: r.status, data }
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message || 'rede' }
  }
}

export async function GET(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const sa = supabaseAdmin()
  const { data: cfg } = await sa.from('meta_config')
    .select('page_id, ad_account_id, app_id, access_token, page_access_token').eq('id', 1).maybeSingle()
  if (!cfg) return NextResponse.json({ error: 'meta_config não configurado. Conecte a Meta primeiro.' }, { status: 400 })

  const pageId = (cfg as any).page_id as string | null
  const pageToken = (cfg as any).page_access_token as string | null
  const userToken = (cfg as any).access_token as string | null
  const adAccountId = (cfg as any).ad_account_id as string | null
  const appId = (cfg as any).app_id as string | null

  // 1) Subscribed apps na page — confirma que a Meta sabe do nosso app
  let subscribedApps: any = { ok: false, motivo: 'page_access_token ausente' }
  if (pageId && pageToken) {
    const r = await graph(`${GRAPH}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(pageToken)}`)
    if (r.ok) {
      const lista = (r.data?.data || []) as any[]
      const nosso = lista.find((a) => String(a.id) === String(appId))
      subscribedApps = {
        ok: true,
        total_apps: lista.length,
        nosso_app_inscrito: !!nosso,
        leadgen_subscribed: !!(nosso?.subscribed_fields || []).map((f: any) => String(f).toLowerCase()).includes('leadgen'),
        nosso_app: nosso ? { id: nosso.id, name: nosso.name, subscribed_fields: nosso.subscribed_fields } : null,
        outros_apps: lista.filter((a) => String(a.id) !== String(appId)).map((a) => ({ id: a.id, name: a.name, subscribed_fields: a.subscribed_fields })),
      }
    } else {
      subscribedApps = { ok: false, erro: r.error, status: r.status }
    }
  }

  // 2) Para cada form ativo: total de leads + último timestamp
  const { data: maps } = await sa.from('meta_form_mapeamento')
    .select('form_id, form_nome, ativo')
    .eq('ativo', true)
    .order('updated_at', { ascending: false })

  const forms = await Promise.all((maps || []).map(async (m: any) => {
    const fid = String(m.form_id)
    if (!pageToken) return { form_id: fid, form_nome: m.form_nome, erro: 'page_access_token ausente' }
    // /{form_id}/leads?fields=id,created_time&limit=5 — só os 5 mais recentes
    const r = await graph(`${GRAPH}/${fid}/leads?fields=id,created_time&limit=5&access_token=${encodeURIComponent(pageToken)}`)
    if (!r.ok) {
      return { form_id: fid, form_nome: m.form_nome, ok: false, erro: r.error, status: r.status }
    }
    const leads = (r.data?.data || []) as any[]
    return {
      form_id: fid,
      form_nome: m.form_nome,
      ok: true,
      leads_no_meta: leads.length,
      ultimo_lead_meta: leads[0]?.created_time || null,
      // contagem própria no CRM pra cada form
      leads_no_crm: await sa.from('meta_leads').select('*', { count: 'exact', head: true }).eq('form_id', fid)
        .then(({ count }) => count || 0),
    }
  }))

  // 3) Campanhas ativas no ad_account
  let campanhas: any = { ok: false, motivo: 'ad_account_id ou access_token ausente' }
  if (adAccountId && userToken) {
    const acc = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const r = await graph(`${GRAPH}/${acc}/campaigns?fields=id,name,status,effective_status&limit=25&access_token=${encodeURIComponent(userToken)}`)
    if (r.ok) {
      const lista = (r.data?.data || []) as any[]
      campanhas = {
        ok: true,
        total: lista.length,
        ativas: lista.filter((c) => String(c.effective_status || c.status).toUpperCase() === 'ACTIVE').length,
        amostra: lista.slice(0, 10).map((c) => ({ id: c.id, name: c.name, status: c.status, effective_status: c.effective_status })),
      }
    } else {
      campanhas = { ok: false, erro: r.error, status: r.status }
    }
  }

  // 4) Resumo do banco
  const { data: configRow } = await sa.from('meta_config')
    .select('webhook_subscribed, configurado_em, updated_at').eq('id', 1).maybeSingle()
  const { count: leadsTotal } = await sa.from('meta_leads').select('*', { count: 'exact', head: true })
  const { count: leadsTeste } = await sa.from('meta_leads').select('*', { count: 'exact', head: true }).like('meta_lead_id', 'TEST_%')

  return NextResponse.json({
    ok: true,
    config: {
      page_id: pageId,
      ad_account_id: adAccountId,
      app_id: appId,
      tem_page_access_token: !!pageToken,
      tem_user_access_token: !!userToken,
      webhook_subscribed_local: !!(configRow as any)?.webhook_subscribed,
      configurado_em: (configRow as any)?.configurado_em,
      updated_at: (configRow as any)?.updated_at,
    },
    crm: {
      leads_total: leadsTotal || 0,
      leads_teste: leadsTeste || 0,
      leads_reais: (leadsTotal || 0) - (leadsTeste || 0),
    },
    subscribed_apps: subscribedApps,
    forms,
    campanhas,
  })
}
