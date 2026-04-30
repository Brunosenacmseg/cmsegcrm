// Sincroniza dados da Meta Marketing API para as tabelas locais.
// - GET: lê estado atual e última sincronização
// - POST { recurso: 'campanhas'|'adsets'|'ads'|'insights'|'all', from?, to? }
//
// Admin only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GRAPH = 'https://graph.facebook.com/v19.0'

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  if (!userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin.from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const }
}

async function paginar<T>(url: string): Promise<T[]> {
  const out: T[] = []
  let next: string | null = url
  let page = 0
  while (next && page < 50) {
    const r = await fetch(next, { signal: AbortSignal.timeout(20000) })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      throw new Error(`Meta ${r.status}: ${t.slice(0, 200)}`)
    }
    const j: any = await r.json()
    if (Array.isArray(j.data)) out.push(...j.data)
    next = j.paging?.next || null
    page++
  }
  return out
}

async function getConfig() {
  const { data } = await supabaseAdmin.from('meta_config').select('*').eq('id', 1).maybeSingle()
  if (!data?.access_token) throw new Error('Meta não conectado — configure em /dashboard/integracoes/meta')
  if (!data.ad_account_id) throw new Error('ad_account_id não configurado')
  return data
}

// ─── Sincroniza campanhas ────────────────────────────────────────
async function syncCampanhas(cfg: any) {
  const fields = 'id,name,status,objective,daily_budget,start_time,stop_time,created_time'
  const url = `${GRAPH}/${cfg.ad_account_id}/campaigns?fields=${fields}&limit=200&access_token=${encodeURIComponent(cfg.access_token)}`
  const lista = await paginar<any>(url)
  let criadas = 0, atualizadas = 0
  for (const c of lista) {
    const payload = {
      meta_id: String(c.id),
      nome: c.name || '(sem nome)',
      status: c.status || null,
      objetivo: c.objective || null,
      daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null, // Meta retorna em centavos
      inicio: c.start_time ? c.start_time.slice(0, 10) : null,
      fim: c.stop_time ? c.stop_time.slice(0, 10) : null,
      criada_em: c.created_time || null,
      atualizada_em: new Date().toISOString(),
    }
    const { data: existente } = await supabaseAdmin.from('meta_campanhas').select('id').eq('meta_id', String(c.id)).maybeSingle()
    if (existente) {
      await supabaseAdmin.from('meta_campanhas').update(payload).eq('id', existente.id)
      atualizadas++
    } else {
      await supabaseAdmin.from('meta_campanhas').insert(payload)
      criadas++
    }
  }
  return { lidas: lista.length, criadas, atualizadas }
}

// ─── Sincroniza adsets ────────────────────────────────────────────
async function syncAdsets(cfg: any) {
  const fields = 'id,name,status,daily_budget,campaign_id'
  const url = `${GRAPH}/${cfg.ad_account_id}/adsets?fields=${fields}&limit=200&access_token=${encodeURIComponent(cfg.access_token)}`
  const lista = await paginar<any>(url)
  // Mapa campanha_meta_id → campanha_uuid
  const { data: cps } = await supabaseAdmin.from('meta_campanhas').select('id, meta_id')
  const mapa: Record<string, string> = {}
  for (const c of cps || []) mapa[c.meta_id] = c.id

  let criadas = 0, atualizadas = 0
  for (const a of lista) {
    const payload = {
      meta_id: String(a.id),
      campanha_id: mapa[String(a.campaign_id)] || null,
      nome: a.name || '(sem nome)',
      status: a.status || null,
      daily_budget: a.daily_budget ? Number(a.daily_budget) / 100 : null,
      atualizada_em: new Date().toISOString(),
    }
    const { data: existente } = await supabaseAdmin.from('meta_adsets').select('id').eq('meta_id', String(a.id)).maybeSingle()
    if (existente) { await supabaseAdmin.from('meta_adsets').update(payload).eq('id', existente.id); atualizadas++ }
    else           { await supabaseAdmin.from('meta_adsets').insert(payload);                       criadas++ }
  }
  return { lidas: lista.length, criadas, atualizadas }
}

// ─── Sincroniza ads ──────────────────────────────────────────────
async function syncAds(cfg: any) {
  const fields = 'id,name,status,adset_id'
  const url = `${GRAPH}/${cfg.ad_account_id}/ads?fields=${fields}&limit=200&access_token=${encodeURIComponent(cfg.access_token)}`
  const lista = await paginar<any>(url)
  const { data: as } = await supabaseAdmin.from('meta_adsets').select('id, meta_id')
  const mapa: Record<string, string> = {}
  for (const a of as || []) mapa[a.meta_id] = a.id

  let criadas = 0, atualizadas = 0
  for (const a of lista) {
    const payload = {
      meta_id: String(a.id),
      adset_id: mapa[String(a.adset_id)] || null,
      nome: a.name || '(sem nome)',
      status: a.status || null,
      atualizado_em: new Date().toISOString(),
    }
    const { data: existente } = await supabaseAdmin.from('meta_ads').select('id').eq('meta_id', String(a.id)).maybeSingle()
    if (existente) { await supabaseAdmin.from('meta_ads').update(payload).eq('id', existente.id); atualizadas++ }
    else           { await supabaseAdmin.from('meta_ads').insert(payload);                      criadas++ }
  }
  return { lidas: lista.length, criadas, atualizadas }
}

// ─── Sincroniza insights (gasto/impressões/clicks) ──────────────
async function syncInsights(cfg: any, from?: string, to?: string) {
  // Default: últimos 30 dias
  const fim = to || new Date().toISOString().slice(0, 10)
  const ini = from || new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10)

  // 3 níveis: campaign, adset, ad
  const niveis: Array<{ level: string, tipo: 'campanha'|'adset'|'ad', idField: string }> = [
    { level: 'campaign', tipo: 'campanha', idField: 'campaign_id' },
    { level: 'adset',    tipo: 'adset',    idField: 'adset_id' },
    { level: 'ad',       tipo: 'ad',       idField: 'ad_id' },
  ]

  const stats = { lidas: 0, gravadas: 0 }
  for (const n of niveis) {
    const fields = `${n.idField},date_start,date_stop,impressions,reach,clicks,spend,ctr,cpc,cpm,actions`
    const url = `${GRAPH}/${cfg.ad_account_id}/insights?fields=${fields}&level=${n.level}&time_increment=1&time_range={'since':'${ini}','until':'${fim}'}&limit=500&access_token=${encodeURIComponent(cfg.access_token)}`
    const lista = await paginar<any>(url)
    stats.lidas += lista.length

    for (const ins of lista) {
      const eid = ins[n.idField]
      if (!eid) continue
      const data = (ins.date_start || fim).slice(0, 10)
      // Quantidade de leads vem em "actions" como action_type='leadgen.other' ou 'lead'
      const actions: any[] = ins.actions || []
      const leadAction = actions.find((a: any) => /lead/i.test(a.action_type || ''))
      const leads = leadAction ? Number(leadAction.value) || 0 : 0

      const payload = {
        entidade_tipo: n.tipo,
        entidade_id:   String(eid),
        data,
        impressoes: Number(ins.impressions) || 0,
        alcance:    Number(ins.reach) || 0,
        cliques:    Number(ins.clicks) || 0,
        gasto:      Number(ins.spend) || 0,
        leads,
        ctr:        ins.ctr ? Number(ins.ctr) : null,
        cpc:        ins.cpc ? Number(ins.cpc) : null,
        cpm:        ins.cpm ? Number(ins.cpm) : null,
        atualizado_em: new Date().toISOString(),
      }
      const { error } = await supabaseAdmin.from('meta_insights').upsert(payload, {
        onConflict: 'entidade_tipo,entidade_id,data'
      })
      if (!error) stats.gravadas++
    }
  }
  return stats
}

export async function GET(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const [{ count: cps }, { count: ass }, { count: ads }, { count: ins }, { count: leads }] = await Promise.all([
    supabaseAdmin.from('meta_campanhas').select('*', { count:'exact', head: true }),
    supabaseAdmin.from('meta_adsets').select('*', { count:'exact', head: true }),
    supabaseAdmin.from('meta_ads').select('*', { count:'exact', head: true }),
    supabaseAdmin.from('meta_insights').select('*', { count:'exact', head: true }),
    supabaseAdmin.from('meta_leads').select('*', { count:'exact', head: true }),
  ])
  return NextResponse.json({
    ok: true,
    contadores: { campanhas: cps, adsets: ass, ads, insights: ins, leads },
  })
}

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const recurso = (body.recurso || 'all') as string
  const from = body.from
  const to   = body.to

  let cfg: any
  try { cfg = await getConfig() }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }) }

  const resultados: Record<string, any> = {}
  try {
    if (recurso === 'campanhas' || recurso === 'all') resultados.campanhas = await syncCampanhas(cfg)
    if (recurso === 'adsets'    || recurso === 'all') resultados.adsets    = await syncAdsets(cfg)
    if (recurso === 'ads'       || recurso === 'all') resultados.ads       = await syncAds(cfg)
    if (recurso === 'insights'  || recurso === 'all') resultados.insights  = await syncInsights(cfg, from, to)
  } catch (e: any) {
    return NextResponse.json({ error: e.message, parciais: resultados }, { status: 500 })
  }
  return NextResponse.json({ ok: true, resultados })
}
