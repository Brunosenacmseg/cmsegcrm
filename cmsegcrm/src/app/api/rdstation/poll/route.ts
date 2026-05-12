// Polling do RD Station CRM via API legada (token).
// Executa a cada 5 min via Vercel Cron e processa um lote pequeno por run.
// Avança last_sync_at para o updated_at mais antigo da página (caminha pra trás
// até zerar o backlog) e depois passa a sincronizar apenas o que muda.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { aplicarDeal } from '../webhook/route'

export const dynamic = 'force-dynamic'
// Vercel Hobby = 10s; Pro = 300s. Mantemos 60s para ter folga.
export const maxDuration = 60

function admin(): any {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// API v1 do RD CRM espera 'YYYY-MM-DD' para start_date/end_date.
function fmtData(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`
}

// Processa N deals em paralelo (limite simples sem libs extras)
async function processarLote<T>(items: T[], concurrency: number, fn: (t: T) => Promise<void>): Promise<void> {
  let idx = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++
      try { await fn(items[i]) } catch {/* swallow */}
    }
  }))
}

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const sa = admin()
  const { data: cfg } = await sa.from('rd_crm_config').select('*').eq('id', 1).maybeSingle()
  if (!cfg?.api_token) {
    return NextResponse.json({ error: 'API token do RD CRM não configurado' }, { status: 503 })
  }
  if (cfg.ativo === false) {
    return NextResponse.json({ ok: true, skipped: 'polling desativado' })
  }

  const token = cfg.api_token as string
  // Janela: desde last_sync_at OU últimas 24h (primeiro run)
  const desde = cfg.last_sync_at ? new Date(cfg.last_sync_at) : new Date(Date.now() - 24*60*60*1000)
  desde.setSeconds(desde.getSeconds() - 60) // overlap
  const startDate = fmtData(desde)
  const novoSync = new Date()
  const endDate = fmtData(new Date(novoSync.getTime() + 24*60*60*1000))

  const BATCH = Number(req.nextUrl.searchParams.get('batch')) || 50
  const CONCURRENCY = 5
  const tStart = Date.now()
  const HARD_LIMIT_MS = 45_000

  let totalProcessados = 0, totalCriados = 0, totalAtualizados = 0, totalErros = 0
  const erros: string[] = []

  try {
    const url = new URL('https://crm.rdstation.com/api/v1/deals')
    url.searchParams.set('token', token)
    url.searchParams.set('updated_at_period', 'true')
    url.searchParams.set('start_date', startDate)
    url.searchParams.set('end_date', endDate)
    url.searchParams.set('limit', String(BATCH))
    url.searchParams.set('page', '1')
    const r = await fetch(url.toString(), { headers: { 'accept': 'application/json' } })
    if (!r.ok) {
      const txt = await r.text().catch(()=>'')
      throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`)
    }
    const j: any = await r.json()
    const deals: any[] = Array.isArray(j) ? j : (j?.deals || j?.data || [])

    await processarLote(deals, CONCURRENCY, async (d) => {
      if (Date.now() - tStart > HARD_LIMIT_MS) return
      try {
        const ev = d?.win === true ? 'deal_won' : d?.win === false ? 'deal_lost' : 'deal_updated'
        const res = await aplicarDeal(d, ev)
        totalProcessados++
        if ((res as any)?.action === 'created') totalCriados++
        else if ((res as any)?.action === 'updated') totalAtualizados++
      } catch (e: any) {
        totalErros++
        if (erros.length < 10) erros.push(`${d?.id || '?'}: ${e?.message || e}`)
      }
    })

    // Avança last_sync_at:
    // - Se processou < BATCH (não há mais deals nesta janela), pula para novoSync
    // - Caso contrário, usa o updated_at MÍNIMO do batch (RD ordena desc),
    //   pra ir consumindo o backlog
    let novoLastSync = novoSync
    if (deals.length >= BATCH) {
      const datas = deals
        .map(d => d?.updated_at || d?.created_at)
        .filter(Boolean)
        .map(s => new Date(s))
        .filter(d => !isNaN(d.getTime()))
      if (datas.length > 0) {
        const minData = new Date(Math.min(...datas.map(d => d.getTime())))
        novoLastSync = minData
      }
    }

    await sa.from('rd_crm_config')
      .update({ last_sync_at: novoLastSync.toISOString(), updated_at: novoSync.toISOString() })
      .eq('id', 1)

    const { error: logErr } = await sa.from('rdstation_syncs').insert({
      recurso: 'poll',
      status: totalErros > 0 ? 'parcial' : 'concluido',
      qtd_lidos: deals.length,
      qtd_criados: totalCriados,
      qtd_atualizados: totalAtualizados,
      qtd_erros: totalErros,
      erros: erros.length ? erros : null,
      iniciado_em: desde.toISOString(),
      concluido_em: new Date().toISOString(),
    } as any)
    if (logErr) console.error('[rd/poll] insert rdstation_syncs falhou:', JSON.stringify(logErr))

    return NextResponse.json({
      ok: true,
      janela: { de: startDate, ate: endDate },
      lidos: deals.length,
      processados: totalProcessados,
      criados: totalCriados,
      atualizados: totalAtualizados,
      erros: totalErros,
      tem_mais: deals.length >= BATCH,
      proximo_last_sync: novoLastSync.toISOString(),
      duracao_ms: Date.now() - tStart,
      amostra_erros: erros.slice(0, 10),
    })
  } catch (e: any) {
    const { error: logErr } = await sa.from('rdstation_syncs').insert({
      recurso: 'poll',
      status: 'erro',
      qtd_lidos: 0,
      qtd_erros: 1,
      erros: [String(e?.message || e)],
      iniciado_em: desde.toISOString(),
      concluido_em: new Date().toISOString(),
    } as any)
    if (logErr) console.error('[rd/poll] insert rdstation_syncs (erro) falhou:', JSON.stringify(logErr))
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
