// Polling do RD Station CRM via API legada (token).
// Executa a cada 5 min via Vercel Cron e processa um lote pequeno por run.
// Avança last_sync_at para o updated_at mais antigo da página (caminha pra trás
// até zerar o backlog) e depois passa a sincronizar apenas o que muda.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { aplicarDeal } from '../webhook/route'
import { listarTodos } from '@/lib/rdstation'

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
      try { await fn(items[i]) } catch (e) { console.error('[rd/poll] worker error:', e) }
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

  const backfillFlag = req.nextUrl.searchParams.get('backfill') === '1'
  try {
    const url = new URL('https://crm.rdstation.com/api/v1/deals')
    url.searchParams.set('token', token)
    url.searchParams.set('updated_at_period', 'true')
    url.searchParams.set('start_date', startDate)
    url.searchParams.set('end_date', endDate)
    url.searchParams.set('limit', String(BATCH))
    url.searchParams.set('page', '1')
    // Backfill: ordena ASC (mais antigos primeiro) pra avancar pela janela.
    // Default DESC pega novos primeiro pra incremental.
    if (backfillFlag) url.searchParams.set('q[s]', 'updated_at asc')
    const r = await fetch(url.toString(), { headers: { 'accept': 'application/json' } })
    if (!r.ok) {
      const txt = await r.text().catch(()=>'')
      throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`)
    }
    const j: any = await r.json()
    const deals: any[] = Array.isArray(j) ? j : (j?.deals || j?.data || [])

    // /deals lista nao envia deal_pipeline_id. Carrega via /deal_pipelines
    // (cada pipeline traz suas stages nested) com fetch direto — mesma
    // estrategia do auto-mapear/route.ts que comprovadamente funciona.
    const pipelinePorStage: Record<string, string> = {}
    let pipelinesDebug: any = { http: null, raw_keys: [], count: 0 }
    try {
      const rp = await fetch(`https://crm.rdstation.com/api/v1/deal_pipelines?token=${encodeURIComponent(token)}`, { headers: { 'accept': 'application/json' }, cache: 'no-store' })
      pipelinesDebug.http = rp.status
      if (rp.ok) {
        const jp: any = await rp.json()
        pipelinesDebug.raw_keys = jp && typeof jp === 'object' ? Object.keys(jp) : []
        const pipelines: any[] = Array.isArray(jp) ? jp : (jp?.deal_pipelines || jp?.pipelines || jp?.data || [])
        pipelinesDebug.count = pipelines.length
        pipelinesDebug.amostra_pipeline_keys = pipelines[0] ? Object.keys(pipelines[0]) : []
        for (const p of pipelines) {
          const pid = String(p?._id || p?.id || '')
          const stages = (p?.deal_stages || p?.stages || []) as any[]
          for (const s of stages) {
            const sid = String(s?._id || s?.id || '')
            if (sid && pid) pipelinePorStage[sid] = pid
          }
        }
      }
    } catch (e: any) {
      pipelinesDebug.error = String(e?.message || e)
      console.error('[rd/poll] fetch deal_pipelines falhou:', e)
    }

    // Politica: o cron sincroniza APENAS novos deals do funil META + MULTICANAL.
    // ?backfill=1 desativa essa restricao para reprocessar deals existentes
    // (ex: corrigir funil de deals importados em RECICLADOS por bug antigo).
    const backfill = req.nextUrl.searchParams.get('backfill') === '1'
    const { data: metaFunil } = await sa.from('funis').select('rd_id').eq('nome', 'META + MULTICANAL').maybeSingle()
    const META_RD_ID = metaFunil?.rd_id ? String(metaFunil.rd_id) : null
    let dealsFiltrados = deals
    let pulados_outros_funis = 0, pulados_existentes = 0
    if (backfill) {
      // No backfill processa tudo (qualquer pipeline conhecido, novo ou existente)
    } else if (META_RD_ID) {
      dealsFiltrados = deals.filter(d => {
        const sid = String(d?.deal_stage?._id || d?.deal_stage?.id || '')
        const pid = sid ? pipelinePorStage[sid] : null
        const ok = pid === META_RD_ID
        if (!ok) pulados_outros_funis++
        return ok
      })
      const ids = dealsFiltrados.map(d => String(d?._id || d?.id)).filter(Boolean)
      if (ids.length) {
        const { data: ja } = await sa.from('negocios').select('rd_id').in('rd_id', ids)
        const setJa = new Set((ja || []).map((r: any) => String(r.rd_id)))
        const antes = dealsFiltrados.length
        dealsFiltrados = dealsFiltrados.filter(d => !setJa.has(String(d?._id || d?.id)))
        pulados_existentes = antes - dealsFiltrados.length
      }
    } else {
      console.warn('[rd/poll] funil META + MULTICANAL nao encontrado (rd_id), nada sera processado')
      dealsFiltrados = []
    }

    await processarLote(dealsFiltrados, CONCURRENCY, async (d) => {
      if (Date.now() - tStart > HARD_LIMIT_MS) return
      try {
        const ev = d?.win === true ? 'deal_won' : d?.win === false ? 'deal_lost' : 'deal_updated'
        // Enriquece deal com pipeline_id derivado do stage (lista omite essa info)
        const stageId = String(d?.deal_stage?._id || d?.deal_stage?.id || '')
        const pid = stageId ? pipelinePorStage[stageId] : null
        if (pid && !d.deal_pipeline) d.deal_pipeline = { _id: pid }
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
        // backfill ASC: avanca para o MAIOR (ultimo da pagina, mais recente)
        // default DESC: avanca para o MENOR (continua consumindo backlog)
        const ts = datas.map(d => d.getTime())
        novoLastSync = new Date(backfillFlag ? Math.max(...ts) : Math.min(...ts))
      }
    }
    // Garantia anti-loop: se novoLastSync não avançou (todos timestamps iguais
    // ao último sync), força progresso de 1s para evitar refazer a mesma janela.
    if (cfg.last_sync_at) {
      const prev = new Date(cfg.last_sync_at).getTime()
      if (novoLastSync.getTime() <= prev) {
        novoLastSync = new Date(prev + 1000)
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
      _version: 'v260-pipelines-direto',
      janela: { de: startDate, ate: endDate },
      lidos: deals.length,
      pipelines_debug: pipelinesDebug,
      stages_carregados: Object.keys(pipelinePorStage).length,
      pipelines_unicos: Array.from(new Set(Object.values(pipelinePorStage))),
      stages_nao_resolvidos: Array.from(new Set(deals
        .map(d => String(d?.deal_stage?._id || d?.deal_stage?.id || ''))
        .filter(sid => sid && !pipelinePorStage[sid])
      )).slice(0, 10),
      stages_nao_resolvidos_amostra: deals
        .filter(d => {
          const sid = String(d?.deal_stage?._id || d?.deal_stage?.id || '')
          return sid && !pipelinePorStage[sid]
        })
        .slice(0, 5)
        .map(d => ({
          stage_id: d?.deal_stage?._id || d?.deal_stage?.id,
          stage_name: d?.deal_stage?.name,
          deal_name: d?.name,
        })),
      filtrados_meta_novos: dealsFiltrados.length,
      pulados_outros_funis,
      pulados_existentes,
      amostra_deal_pipeline: deals.slice(0, 3).map(d => ({
        id: d?._id || d?.id,
        stage_id: d?.deal_stage?._id || d?.deal_stage?.id,
        stage_name: d?.deal_stage?.name,
        pipeline_resolvido: pipelinePorStage[String(d?.deal_stage?._id || d?.deal_stage?.id || '')],
      })),
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
