// Polling do RD Station CRM via API legada (token).
// Roda via Vercel Cron (a cada 5 min) ou pode ser chamado manualmente.
// Busca deals criados/atualizados desde last_sync_at e aplica via aplicarDeal().

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { aplicarDeal } from '../webhook/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Sem o generic <Database> aqui porque rd_crm_config e uma tabela nova
// que ainda nao esta nos types gerados (Type instantiation excessively deep)
function admin(): any {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// API v1 do RD CRM espera 'YYYY-MM-DD' (apenas data) para start_date/end_date.
// toISOString() (com .000Z) era rejeitado. Mantemos o overlap de 24h via lógica em desde.
function fmtData(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`
}

export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  const sa = admin()
  const { data: cfg } = await sa.from('rd_crm_config').select('*').eq('id', 1).maybeSingle()
  if (!cfg?.api_token) {
    return NextResponse.json({ error: 'API token do RD CRM não configurado (rd_crm_config.api_token vazio)' }, { status: 503 })
  }
  if (cfg.ativo === false) {
    return NextResponse.json({ ok: true, skipped: 'polling desativado em rd_crm_config.ativo=false' })
  }

  const token = cfg.api_token as string
  // Janela: desde last_sync_at OU últimas 24h (no primeiro run)
  const desde = cfg.last_sync_at ? new Date(cfg.last_sync_at) : new Date(Date.now() - 24*60*60*1000)
  // Pequeno overlap (60s) pra não perder deals atualizados muito perto do final da janela
  desde.setSeconds(desde.getSeconds() - 60)
  const startDate = fmtData(desde)
  const novoSync = new Date()
  // end_date precisa ser hoje (ou amanha pra cobrir TZ). API v1 exige.
  const amanha = new Date(novoSync.getTime() + 24*60*60*1000)
  const endDate = fmtData(amanha)

  let totalProcessados = 0
  let totalCriados = 0
  let totalAtualizados = 0
  let totalErros = 0
  const erros: string[] = []
  let page = 1
  const PAGE_LIMIT = 200

  try {
    // Itera todas as paginas — API v1 retorna { deals: [...], total, has_more } ou similar
    while (true) {
      const url = new URL('https://crm.rdstation.com/api/v1/deals')
      url.searchParams.set('token', token)
      url.searchParams.set('updated_at_period', 'true')
      url.searchParams.set('start_date', startDate)
      url.searchParams.set('end_date', endDate)
      url.searchParams.set('limit', String(PAGE_LIMIT))
      url.searchParams.set('page', String(page))
      const r = await fetch(url.toString(), { headers: { 'accept': 'application/json' } })
      if (!r.ok) {
        const txt = await r.text().catch(()=>'')
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`)
      }
      const j: any = await r.json()
      const deals: any[] = Array.isArray(j) ? j : (j?.deals || j?.data || [])
      if (deals.length === 0) break
      for (const d of deals) {
        try {
          const ev = d?.win === true ? 'deal_won'
            : d?.win === false ? 'deal_lost'
            : 'deal_updated'
          const res = await aplicarDeal(d, ev)
          totalProcessados++
          if ((res as any)?.acao === 'criou' || (res as any)?.criado) totalCriados++
          else if ((res as any)?.ok) totalAtualizados++
        } catch (e: any) {
          totalErros++
          if (erros.length < 10) erros.push(`${d?.id || '?'}: ${e?.message || e}`)
        }
      }
      // Heuristica de paginacao: se veio menos que o limit, acabou
      if (deals.length < PAGE_LIMIT) break
      page++
      if (page > 50) break // safety
    }

    // Atualiza last_sync_at apenas se o run nao deu erro fatal
    await sa.from('rd_crm_config').update({ last_sync_at: novoSync.toISOString(), updated_at: novoSync.toISOString() }).eq('id', 1)

    // Log resumido
    try {
      await sa.from('rdstation_syncs').insert({
        recurso: 'poll',
        status: totalErros > 0 ? 'parcial' : 'ok',
        qtd_lidos: totalProcessados,
        qtd_aplicados: totalCriados + totalAtualizados,
        qtd_erros: totalErros,
        detalhe: JSON.stringify({ startDate, page, criados: totalCriados, atualizados: totalAtualizados, erros }),
      } as any)
    } catch {}

    return NextResponse.json({
      ok: true,
      desde: startDate,
      ate: fmtData(novoSync),
      processados: totalProcessados,
      criados: totalCriados,
      atualizados: totalAtualizados,
      erros: totalErros,
      amostra_erros: erros.slice(0, 10),
    })
  } catch (e: any) {
    try {
      await sa.from('rdstation_syncs').insert({
        recurso: 'poll',
        status: 'erro',
        qtd_lidos: totalProcessados,
        qtd_erros: totalErros + 1,
        detalhe: String(e?.message || e),
      } as any)
    } catch {}
    return NextResponse.json({ error: String(e?.message || e), processados: totalProcessados }, { status: 500 })
  }
}
