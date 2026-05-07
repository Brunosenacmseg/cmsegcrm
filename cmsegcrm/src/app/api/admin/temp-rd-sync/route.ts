// TEMP: endpoint pra puxar deals do RD CRM e criar no CRM os que faltam.
// Protegido por secret simples (sem JWT do navegador). **REMOVER APÓS USO.**
//
// Uso:
//   POST /api/admin/temp-rd-sync
//     headers: x-secret: <secret>
//     body:    { from?: "YYYY-MM-DD", to?: "YYYY-MM-DD", apenas_diff?: true, limite_paginas?: 50 }
//
// Estratégia: lista deals do RD em janela (ou tudo), checa quais rd_id NÃO existem
// na tabela `negocios`, e cria os faltantes. Reusa a lógica do webhook (CPF +
// fallback de cliente por CPF/email).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  listarPorJanela, listarTodos, rdId, norm,
  RDDeal, RDPipeline, RDStage, RDContact,
} from '@/lib/rdstation'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SECRET = 'migalhinha-2026'

let _sa: ReturnType<typeof createClient> | null = null
function admin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

function soDigitos(v?: string | null): string | null {
  if (!v) return null
  const d = String(v).replace(/\D/g, '')
  return d || null
}
function docValido(v?: string | null): string | null {
  const d = soDigitos(v); if (!d) return null
  if (d.length !== 11 && d.length !== 14) return null
  if (/^(\d)\1+$/.test(d)) return null
  return d
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const secretIn = req.headers.get('x-secret') || url.searchParams.get('secret') || ''
  if (secretIn !== SECRET) return NextResponse.json({ error: 'secret inválido' }, { status: 401 })
  let body: any = {}; try { body = await req.json() } catch {}
  const from = body?.from || url.searchParams.get('from') || undefined
  const to   = body?.to   || url.searchParams.get('to')   || undefined
  return iniciarSync(from, to)
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const secretIn = req.headers.get('x-secret') || url.searchParams.get('secret') || ''
  if (!secretIn) return NextResponse.json({
    ok: true, service: 'temp-rd-sync',
    uso: 'GET ?secret=...&from=YYYY-MM-DD&to=YYYY-MM-DD  •  GET ?secret=...&job=<id>  •  GET ?secret=...&list=1'
  })
  if (secretIn !== SECRET) return NextResponse.json({ error: 'secret inválido' }, { status: 401 })

  const job = url.searchParams.get('job')
  const list = url.searchParams.get('list')
  if (job) {
    const { data } = await admin().from('rdstation_syncs').select('*').eq('id', job).maybeSingle()
    return NextResponse.json({ job: data })
  }
  if (list) {
    const { data } = await admin().from('rdstation_syncs')
      .select('*').like('recurso', 'temp-rd-sync%')
      .order('iniciado_em', { ascending: false }).limit(20)
    return NextResponse.json({ syncs: data || [] })
  }

  const from = url.searchParams.get('from') || undefined
  const to   = url.searchParams.get('to')   || undefined
  return iniciarSync(from, to)
}

// Roda síncrono — Vercel mantém a função viva até 300s (maxDuration). Mesmo
// se o cliente HTTP cair antes (proxy timeout), a Lambda continua e grava o
// resultado em public.rdstation_syncs. Consulte com ?job=<id>.
async function iniciarSync(fromDay?: string, toDay?: string) {
  const token = process.env.RDSTATION_CRM_TOKEN
  if (!token) return NextResponse.json({ error: 'RDSTATION_CRM_TOKEN não configurado' }, { status: 400 })

  const recurso = `temp-rd-sync ${fromDay || 'TUDO'}→${toDay || 'TUDO'}`
  const { data: log } = await admin().from('rdstation_syncs').insert({
    recurso, status: 'processando',
  }).select('id').single()
  const jobId = (log as any)?.id

  try {
    const stats = await rodarSync(token, fromDay, toDay, jobId)
    return NextResponse.json({ ok: true, job_id: jobId, stats }, { status: 200 })
  } catch (err: any) {
    await admin().from('rdstation_syncs').update({
      status: 'erro', erros: [String(err?.message || err).slice(0, 200)],
      concluido_em: new Date().toISOString(),
    }).eq('id', jobId)
    return NextResponse.json({ ok: false, job_id: jobId, error: err?.message || String(err) }, { status: 500 })
  }
}

async function rodarSync(token: string, fromDay?: string, toDay?: string, jobId?: string) {
  const from: string | undefined = fromDay ? `${fromDay}T00:00:00Z` : undefined
  const to: string | undefined   = toDay   ? `${toDay}T23:59:59Z`   : undefined

  const stats = {
    qtd_lidos_rd: 0,
    ja_existiam:  0,
    qtd_criados:  0,
    qtd_erros:    0,
    erros: [] as string[],
  }

  const startedAt = Date.now()
  const DEADLINE_MS = 50_000 // Vercel Hobby cap = 60s; folga pra finalizar update
  let truncado = false

  // OTIMIZADO: skip /deal_pipelines + /deal_stages (~30-60s no plano Hobby).
  // Usa só funis que já existem no DB (povoados pelo sync prévio) + fallback.
  // Se faltar match, deal cai no funil "RD: Importados".
  const pipelineNomePorId: Record<string, string> = {}
  const pipelinePorStage: Record<string, string> = {}

  const { data: funis } = await admin().from('funis').select('id, rd_id, etapas, nome, tipo')
  const funilPorRd: Record<string, any> = {}, funilPorNome: Record<string, any> = {}
  for (const f of (funis || []) as any[]) {
    if (f.rd_id) funilPorRd[f.rd_id] = f
    if (f.nome)  funilPorNome[norm(f.nome)] = f
  }

  let funilFallback: any = (funis as any[] || []).find(f => f.nome === 'RD: Importados')
  if (!funilFallback) {
    const { data } = await admin().from('funis').insert({
      nome: 'RD: Importados', tipo: 'venda', emoji: '📥', cor: '#c9a84c',
      etapas: ['Novo', 'Em andamento', 'Ganho', 'Perdido'], ordem: 99,
    }).select('id, rd_id, etapas, nome, tipo').single()
    funilFallback = data
  }

  // Lista deals do RD
  let deals: RDDeal[] = []
  try {
    if (from && to) deals = await listarPorJanela<RDDeal>('/deals', token, 'deals', from, to)
    else            deals = await listarTodos<RDDeal>('/deals', token, 'deals')
  } catch (e: any) {
    return NextResponse.json({ error: `Falha ao listar /deals: ${e?.message?.slice(0, 200)}` }, { status: 502 })
  }
  stats.qtd_lidos_rd = deals.length

  // rd_ids já presentes
  const rdIds = deals.map(d => rdId(d)).filter(Boolean) as string[]
  const jaPresentes = new Set<string>()
  for (let i = 0; i < rdIds.length; i += 500) {
    const lote = rdIds.slice(i, i + 500)
    const { data } = await admin().from('negocios').select('rd_id').in('rd_id', lote)
    for (const r of (data || []) as any[]) if (r.rd_id) jaPresentes.add(r.rd_id)
  }

  // Cria os faltantes
  for (const d of deals) {
    if (Date.now() - startedAt > DEADLINE_MS) { truncado = true; break }
    const id = rdId(d); if (!id) continue
    if (jaPresentes.has(id)) { stats.ja_existiam++; continue }

    try {
      // Resolve funil
      const stageId = rdId(d.deal_stage)
      const pipelineId = rdId(d.deal_pipeline) || (stageId ? pipelinePorStage[stageId] : null)
      const pipeNome = d.deal_pipeline?.name || (pipelineId ? pipelineNomePorId[pipelineId] : '') || ''
      let funil = (pipelineId && funilPorRd[pipelineId]) || (pipeNome && funilPorNome[norm(pipeNome)]) || funilFallback
      if (!funil) { stats.qtd_erros++; stats.erros.push(`${d.name}: sem funil`); continue }

      // Etapa
      const etapaRaw = d.deal_stage?.name || ''
      const etapa = (funil.etapas as string[]).find(e => norm(e) === norm(etapaRaw)) || funil.etapas?.[0] || 'Novo'

      // Cliente: por rd_id → CPF → email; senão cria com dados do contato
      const primeiro = d.contacts?.[0]
      const docContato = docValido(primeiro?.cnpj) || docValido(primeiro?.cpf)
      const emailContato = primeiro?.emails?.[0]?.email?.trim().toLowerCase() || null

      let clienteId: string | null = null
      if (primeiro) {
        const cid = rdId(primeiro)
        if (cid) {
          const { data } = await admin().from('clientes').select('id').eq('rd_id', cid).maybeSingle()
          clienteId = (data as any)?.id || null
        }
        if (!clienteId && docContato) {
          const { data } = await admin().from('clientes').select('id').eq('cpf_cnpj', docContato).limit(1).maybeSingle()
          clienteId = (data as any)?.id || null
        }
        if (!clienteId && emailContato) {
          const { data } = await admin().from('clientes').select('id').eq('email', emailContato).limit(1).maybeSingle()
          clienteId = (data as any)?.id || null
        }
      }
      if (!clienteId) {
        const novoCliente: any = {
          nome: primeiro?.name?.trim() || d.organization?.name || d.name || 'Sem cliente (RD)',
          tipo: docContato && docContato.length === 14 ? 'PJ' : (d.organization?.name ? 'PJ' : 'PF'),
          cpf_cnpj: docContato,
          email: emailContato,
          telefone: primeiro?.phones?.[0]?.phone?.trim() || null,
          fonte: d.deal_source?.name || d.campaign?.name || 'RD Station CRM',
        }
        if (rdId(primeiro as any)) novoCliente.rd_id = rdId(primeiro as any)
        const { data: ph, error: errCli } = await admin().from('clientes').insert(novoCliente).select('id').single()
        if (errCli) { stats.qtd_erros++; stats.erros.push(`${d.name}: cliente: ${errCli.message?.slice(0, 80)}`); continue }
        clienteId = (ph as any)?.id
      }

      const obs = [
        d.name && `Negócio: ${d.name}`,
        d.deal_source?.name && `Origem: ${d.deal_source.name}`,
        d.campaign?.name && `Campanha: ${d.campaign.name}`,
        d.user?.name && `Responsável RD: ${d.user.name}`,
      ].filter(Boolean).join(' | ')

      const premio = Number(d.amount_total ?? (d as any).amount_monthly ?? d.amount_montly ?? d.amount_unique ?? 0) || 0
      const venc = d.prediction_date ? d.prediction_date.slice(0, 10) : null

      const { error: errIns } = await admin().from('negocios').insert({
        rd_id: id, funil_id: funil.id, etapa,
        cliente_id: clienteId,
        produto: d.deal_products?.[0]?.product?.name || d.deal_products?.[0]?.name || null,
        premio, vencimento: venc, obs: obs || null,
        cpf_cnpj: docContato,
        fonte: d.deal_source?.name || d.campaign?.name || 'RD Station CRM',
      })
      if (errIns) { stats.qtd_erros++; stats.erros.push(`${d.name}: ${errIns.message?.slice(0, 80)}`); continue }
      stats.qtd_criados++
    } catch (e: any) {
      stats.qtd_erros++
      stats.erros.push(`${d.name}: ${e?.message?.slice(0, 80)}`)
    }
  }

  if (jobId) {
    const status = truncado
      ? 'parcial'
      : (stats.qtd_erros === 0 ? 'concluido' : (stats.qtd_criados > 0 ? 'parcial' : 'erro'))
    const errosFinal = truncado
      ? [`[truncado por deadline ${DEADLINE_MS}ms]`, ...stats.erros].slice(0, 30)
      : stats.erros.slice(0, 30)
    await admin().from('rdstation_syncs').update({
      status,
      qtd_lidos: stats.qtd_lidos_rd,
      qtd_criados: stats.qtd_criados,
      qtd_atualizados: stats.ja_existiam,
      qtd_erros: stats.qtd_erros,
      erros: errosFinal,
      concluido_em: new Date().toISOString(),
    }).eq('id', jobId)
  }
  return { ...stats, truncado }
}
