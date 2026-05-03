import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listarTodos, rdId, norm, RDPipeline, RDDeal, RDStage } from '@/lib/rdstation'

export const dynamic = 'force-dynamic'

export const maxDuration = 300

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function checarAdmin(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data: userData } = await supabaseAdmin().auth.getUser(token)
  if (!userData?.user) return null
  const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return null
  return userData.user
}

function getRdToken(request: NextRequest): string | null {
  return request.headers.get('x-rd-token') || process.env.RDSTATION_CRM_TOKEN || null
}

// POST: Re-roda mapeamento funil/etapa/status de TODOS os negocios que
// vieram do RD (rd_id is not null). Útil quando uma importação anterior
// caiu no funil errado.
//   - Não toca em cliente, vendedor, prêmio, obs (já estavam ok).
//   - Move para o funil + etapa + status corretos baseado no rd_id.
//   - Idempotente — pode rodar quantas vezes quiser.
export async function POST(request: NextRequest) {
  const user = await checarAdmin(request)
  if (!user) return NextResponse.json({ error: 'Apenas admin' }, { status: 403 })

  const rdToken = getRdToken(request)
  if (!rdToken) return NextResponse.json({ error: 'RDSTATION_CRM_TOKEN não configurado' }, { status: 400 })

  const stats = { lidos: 0, atualizados: 0, ignorados: 0, erros: 0, msgs: [] as string[] }

  // 1) Pipelines do RD
  let pipelines: RDPipeline[] = []
  for (const path of ['/deal_pipelines', '/pipelines']) {
    for (const key of ['deal_pipelines', 'pipelines']) {
      try { const r = await listarTodos<RDPipeline>(path, rdToken, key); if (r.length) { pipelines = r; break } } catch {}
    }
    if (pipelines.length) break
  }
  const pipelinePorId: Record<string, RDPipeline> = {}
  const pipelineNomePorId: Record<string, string> = {}
  for (const p of pipelines) {
    const pid = rdId(p); if (!pid) continue
    pipelinePorId[pid] = p
    if (p.name) pipelineNomePorId[pid] = p.name
  }

  // 2) Stages do RD (para resolver pipeline a partir de stage)
  const stages = await listarTodos<RDStage>('/deal_stages', rdToken, 'deal_stages')
  const pipelinePorStage: Record<string, string> = {}
  for (const s of stages) {
    const sid = rdId(s)
    if (sid && s.deal_pipeline_id) pipelinePorStage[sid] = s.deal_pipeline_id
  }

  // 3) Funis locais — auto-vincula rd_id por nome
  const { data: funisLocais } = await supabaseAdmin().from('funis').select('id, rd_id, nome, etapas, tipo')
  const funilPorRd:   Record<string, any> = {}
  const funilPorNome: Record<string, any> = {}
  for (const f of funisLocais || []) {
    if (f.rd_id) funilPorRd[f.rd_id] = f
    if (f.nome)  funilPorNome[norm(f.nome)] = f
  }
  for (const p of pipelines) {
    const pid = rdId(p); if (!pid || !p.name) continue
    if (funilPorRd[pid]) continue
    const local = funilPorNome[norm(p.name)]
    if (local && !local.rd_id) {
      await supabaseAdmin().from('funis').update({ rd_id: pid }).eq('id', local.id)
      local.rd_id = pid
      funilPorRd[pid] = local
    }
  }

  // 4) Negociações que vieram do RD
  const { data: negocios } = await supabaseAdmin().from('negocios')
    .select('id, rd_id, funil_id, etapa, status, titulo')
    .not('rd_id', 'is', null)
  stats.lidos = negocios?.length || 0
  if (!negocios?.length) return NextResponse.json({ ok: true, stats })

  // 5) Pegar todos os deals do RD em paginação (pra ter pipeline/stage/win atualizado)
  const deals = await listarTodos<RDDeal>('/deals', rdToken, 'deals')
  const dealPorRdId: Record<string, RDDeal> = {}
  for (const d of deals) { const id = rdId(d); if (id) dealPorRdId[id] = d }

  for (const neg of negocios) {
    try {
      const d = dealPorRdId[neg.rd_id!]
      if (!d) { stats.ignorados++; continue }

      const stageId = rdId(d.deal_stage)
      const pipelineId = rdId(d.deal_pipeline) || (stageId ? pipelinePorStage[stageId] : null)
      const pipeNome = d.deal_pipeline?.name || (pipelineId ? pipelineNomePorId[pipelineId] : '') || ''

      let funil: any =
        (pipelineId && funilPorRd[pipelineId]) ||
        (pipeNome && funilPorNome[norm(pipeNome)]) ||
        null

      // Auto-cria se necessário (nome conhecido mas funil não existe)
      if (!funil && pipeNome) {
        const pipelineRD = pipelineId ? pipelinePorId[pipelineId] : null
        const stagesRD: any[] = (pipelineRD?.deal_stages || pipelineRD?.stages || [])
          .slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
        const etapas = stagesRD.map((s: any) => s.name || 'Etapa').filter(Boolean)
        const { data: novo } = await supabaseAdmin().from('funis').insert({
          rd_id: pipelineId || null, nome: pipeNome.trim(),
          tipo: 'venda', emoji: '📊', cor: '#1cb5a0',
          etapas: etapas.length ? etapas : ['Novo','Em andamento','Ganho','Perdido'],
          ordem: 50,
        }).select('id, rd_id, etapas, nome').single()
        if (novo) {
          funil = novo
          if (novo.rd_id) funilPorRd[novo.rd_id] = novo
          funilPorNome[norm(novo.nome)] = novo
        }
      }

      if (!funil) { stats.ignorados++; continue }

      // Etapa: match por nome
      const etapaRaw = d.deal_stage?.name || ''
      const etapaMatch = (funil.etapas as string[])?.find((e: string) => norm(e) === norm(etapaRaw)) || (funil.etapas?.[0] || 'Novo')

      // Status do RD (caso tenha mudado)
      let status: 'em_andamento'|'ganho'|'perdido' = 'em_andamento'
      if (d.win === true)  status = 'ganho'
      if (d.win === false) status = 'perdido'

      const precisaAtualizar =
        neg.funil_id !== funil.id ||
        neg.etapa    !== etapaMatch ||
        neg.status   !== status

      if (precisaAtualizar) {
        await supabaseAdmin().from('negocios').update({
          funil_id: funil.id, etapa: etapaMatch, status,
        }).eq('id', neg.id)
        stats.atualizados++
      }
    } catch (e: any) {
      stats.erros++
      if (stats.msgs.length < 20) stats.msgs.push(`${neg.titulo}: ${e?.message?.slice(0, 80)}`)
    }
  }

  return NextResponse.json({ ok: true, stats })
}
