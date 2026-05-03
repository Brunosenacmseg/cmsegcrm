import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  listarTodos, listarPorJanela, ping, rdId, norm, buscarDealDetalhe,
  RDContact, RDDeal, RDPipeline, RDActivity, RDUser, RDStage,
} from '@/lib/rdstation'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

function getToken(request: NextRequest): string | null {
  return request.headers.get('x-rd-token') || process.env.RDSTATION_CRM_TOKEN || null
}

async function checarAdmin(request: NextRequest): Promise<{ ok: boolean; userId?: string; erro?: string }> {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, erro: 'Não autenticado' }

  const { data: userData, error } = await supabaseAdmin().auth.getUser(token)
  if (error || !userData?.user) return { ok: false, erro: 'Sessão inválida' }

  const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return { ok: false, erro: 'Apenas admin pode sincronizar' }
  return { ok: true, userId: userData.user.id }
}

// ─── Helpers de mapeamento ─────────────────────────────────
function soDigitos(v?: string | null): string | null {
  if (!v) return null
  const d = String(v).replace(/\D/g, '')
  return d || null
}

function nascimentoStr(b: RDContact['birthday']): string | null {
  if (!b) return null
  if (typeof b === 'string') return b.slice(0, 10)
  if (b.year && b.month && b.day) return `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`
  return null
}

function clienteFromRD(c: RDContact) {
  const cnpj = soDigitos(c.cnpj)
  const cpf = soDigitos(c.cpf)
  const tipo = cnpj ? 'PJ' : 'PF'
  return {
    rd_id: rdId(c)!,
    nome: c.name?.trim() || (c.organization?.name?.trim() || 'Sem nome'),
    tipo,
    cpf_cnpj: cnpj || cpf || null,
    email: c.emails?.[0]?.email?.trim().toLowerCase() || null,
    telefone: c.phones?.[0]?.phone?.trim() || null,
    cep: soDigitos(c.zip_code),
    cidade: c.city || null,
    estado: c.state || null,
    fonte: c.source?.name || 'RD Station CRM',
  }
}

async function logSync(recurso: string, userId?: string) {
  const { data } = await supabaseAdmin().from('rdstation_syncs').insert({
    recurso, status: 'processando', user_id: userId || null,
  }).select('id').single()
  return data?.id as string | undefined
}

async function fecharLog(id: string | undefined, dados: { qtd_lidos: number; qtd_criados: number; qtd_atualizados: number; qtd_erros: number; erros: string[] }) {
  if (!id) return
  const status = dados.qtd_erros === 0 ? 'concluido' : (dados.qtd_criados + dados.qtd_atualizados > 0 ? 'parcial' : 'erro')
  await supabaseAdmin().from('rdstation_syncs').update({
    status,
    qtd_lidos: dados.qtd_lidos,
    qtd_criados: dados.qtd_criados,
    qtd_atualizados: dados.qtd_atualizados,
    qtd_erros: dados.qtd_erros,
    erros: dados.erros.slice(0, 20),
    concluido_em: new Date().toISOString(),
  }).eq('id', id)
}

// ─── Importadores ─────────────────────────────────────────

async function importarUsuarios(token: string) {
  const stats = { qtd_lidos: 0, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  const usuarios = await listarTodos<RDUser>('/users', token, 'users')
  stats.qtd_lidos = usuarios.length

  // Não cria usuários no auth — apenas guarda referência por email para vincular como corretor depois.
  for (const u of usuarios) {
    try {
      const id = rdId(u)
      if (!id || !u.email) continue
      const email = u.email.toLowerCase().trim()
      const { data: existente } = await supabaseAdmin().from('users').select('id, rd_id').eq('email', email).maybeSingle()
      if (existente) {
        if (existente.rd_id !== id) {
          await supabaseAdmin().from('users').update({ rd_id: id }).eq('id', existente.id)
          stats.qtd_atualizados++
        }
      }
      // Se não existe, ignoramos: usuário precisa fazer signup no novo CRM via Supabase Auth.
    } catch (e: any) {
      stats.qtd_erros++
      stats.erros.push(`user ${u.email}: ${e?.message?.slice(0, 80)}`)
    }
  }
  return stats
}

async function importarFunis(token: string) {
  const stats = { qtd_lidos: 0, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  // Tenta múltiplos endpoints — RD usa nomes diferentes em versões da API
  let pipelines: RDPipeline[] = []
  for (const path of ['/deal_pipelines', '/pipelines']) {
    for (const key of ['deal_pipelines', 'pipelines']) {
      try {
        const r = await listarTodos<RDPipeline>(path, token, key)
        if (r.length > 0) { pipelines = r; break }
      } catch {}
    }
    if (pipelines.length > 0) break
  }
  stats.qtd_lidos = pipelines.length

  // Carrega funis existentes pra match por rd_id e por nome normalizado
  const { data: locais } = await supabaseAdmin().from('funis').select('id, rd_id, nome')
  const porRdId: Record<string, string> = {}
  const porNome: Record<string, string> = {}
  for (const f of locais || []) {
    if (f.rd_id) porRdId[f.rd_id] = f.id
    if (f.nome)  porNome[norm(f.nome)] = f.id
  }

  for (let idx = 0; idx < pipelines.length; idx++) {
    const p = pipelines[idx]
    try {
      const id = rdId(p)
      if (!id) continue
      const stages: RDStage[] = (p.deal_stages || p.stages || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      const etapas = stages.map(s => s.name || 'Etapa').filter(Boolean)
      if (etapas.length === 0) etapas.push('Novo', 'Em andamento', 'Ganho', 'Perdido')

      const nome = (p.name || 'Pipeline').trim()
      const matchId = porRdId[id] || porNome[norm(nome)] || null

      if (matchId) {
        // Atualiza: garante rd_id (caso match veio por nome) + sincroniza etapas/nome do RD
        await supabaseAdmin().from('funis').update({ rd_id: id, nome, etapas }).eq('id', matchId)
        stats.qtd_atualizados++
      } else {
        await supabaseAdmin().from('funis').insert({
          rd_id: id, nome, tipo: 'venda', emoji: '📊', cor: '#1cb5a0',
          etapas, ordem: idx + 1,
        })
        stats.qtd_criados++
      }
    } catch (e: any) {
      stats.qtd_erros++
      stats.erros.push(`pipeline ${p.name}: ${e?.message?.slice(0, 80)}`)
    }
  }
  return stats
}

async function importarContatos(token: string, from?: string, to?: string) {
  const stats = { qtd_lidos: 0, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  const contatos = (from && to)
    ? await listarPorJanela<RDContact>('/contacts', token, 'contacts', from, to)
    : await listarTodos<RDContact>('/contacts', token, 'contacts')
  stats.qtd_lidos = contatos.length

  // Carregar mapas existentes
  const rdIds = contatos.map(c => rdId(c)).filter(Boolean) as string[]
  const mapaExistentes: Record<string, string> = {}

  for (let i = 0; i < rdIds.length; i += 500) {
    const lote = rdIds.slice(i, i + 500)
    const { data } = await supabaseAdmin().from('clientes').select('id, rd_id').in('rd_id', lote)
    for (const c of data || []) if (c.rd_id) mapaExistentes[c.rd_id] = c.id
  }

  const novos: any[] = []
  const updates: { id: string; data: any }[] = []

  for (const c of contatos) {
    try {
      const id = rdId(c)
      if (!id) continue
      const mapped = clienteFromRD(c)
      if (mapaExistentes[id]) updates.push({ id: mapaExistentes[id], data: mapped })
      else novos.push(mapped)
    } catch (e: any) {
      stats.qtd_erros++
      stats.erros.push(`contato ${c.name}: ${e?.message?.slice(0, 80)}`)
    }
  }

  // Insert em lotes
  for (let i = 0; i < novos.length; i += 200) {
    const lote = novos.slice(i, i + 200)
    const { error } = await supabaseAdmin().from('clientes').insert(lote)
    if (error) {
      for (const item of lote) {
        const { error: e2 } = await supabaseAdmin().from('clientes').insert(item)
        if (e2) { stats.qtd_erros++; if (stats.erros.length < 20) stats.erros.push(`${item.nome}: ${e2.message?.slice(0, 80)}`) }
        else stats.qtd_criados++
      }
    } else {
      stats.qtd_criados += lote.length
    }
  }

  // Update
  for (const { id, data } of updates) {
    const { error } = await supabaseAdmin().from('clientes').update(data).eq('id', id)
    if (error) { stats.qtd_erros++; if (stats.erros.length < 20) stats.erros.push(`${data.nome}: ${error.message?.slice(0, 80)}`) }
    else stats.qtd_atualizados++
  }

  return stats
}

// Cache de payloads pesados (pipelines, stages) com TTL — evita refazer
// chamadas de catálogo na RD a cada importação de janela curta. O timeout
// do plano free do Vercel (60s) não comporta o preâmbulo + deals juntos.
const CACHE_TTL_MS = 60 * 60 * 1000 // 1h
async function lerCacheRD<T>(chave: string): Promise<T | null> {
  const { data } = await supabaseAdmin().from('rdstation_cache')
    .select('valor, atualizado_em').eq('chave', chave).maybeSingle()
  if (!data) return null
  const idade = Date.now() - new Date(data.atualizado_em).getTime()
  if (idade > CACHE_TTL_MS) return null
  return data.valor as T
}
async function gravarCacheRD(chave: string, valor: any) {
  await supabaseAdmin().from('rdstation_cache').upsert({
    chave, valor, atualizado_em: new Date().toISOString(),
  })
}

async function importarNegocios(token: string, from?: string, to?: string, incluirDetalhes = false) {
  const stats = { qtd_lidos: 0, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }

  // ─── PIPELINES DO RD: nome + etapas (para resolver mismatch) ──
  // Cacheado por 1h — refaz só se invalidado. Sem cache, isso sozinho
  // já estoura o timeout do Vercel free em contas grandes.
  let rdPipelines: RDPipeline[] = (await lerCacheRD<RDPipeline[]>('pipelines')) || []
  if (!rdPipelines.length) {
    for (const path of ['/deal_pipelines', '/pipelines']) {
      for (const key of ['deal_pipelines', 'pipelines']) {
        try { const r = await listarTodos<RDPipeline>(path, token, key); if (r.length) { rdPipelines = r; break } } catch {}
      }
      if (rdPipelines.length) break
    }
    if (rdPipelines.length) await gravarCacheRD('pipelines', rdPipelines)
  }
  const rdPipelinePorId:   Record<string, RDPipeline> = {}
  const rdPipelineNomePorId: Record<string, string>   = {}
  for (const p of rdPipelines) {
    const pid = rdId(p)
    if (pid) { rdPipelinePorId[pid] = p; if (p.name) rdPipelineNomePorId[pid] = p.name }
  }

  // ─── FUNIS LOCAIS ─────────────────────────────────────────────
  const { data: funis } = await supabaseAdmin().from('funis').select('id, rd_id, etapas, nome, tipo')
  const funilPorRd:   Record<string, any> = {}
  const funilPorNome: Record<string, any> = {}
  for (const f of funis || []) {
    if (f.rd_id) funilPorRd[f.rd_id] = f
    if (f.nome)  funilPorNome[norm(f.nome)] = f
  }

  // Auto-vincula rd_id em funis locais que ainda não têm: se algum
  // funil local com nome bate com pipeline do RD, atualiza rd_id.
  // Isso conserta o caso "rodei sync deals sem rodar sync funis".
  for (const p of rdPipelines) {
    const pid = rdId(p)
    if (!pid || !p.name) continue
    if (funilPorRd[pid]) continue
    const local = funilPorNome[norm(p.name)]
    if (local && !local.rd_id) {
      await supabaseAdmin().from('funis').update({ rd_id: pid }).eq('id', local.id)
      local.rd_id = pid
      funilPorRd[pid] = local
    }
  }

  // ─── FUNIL FALLBACK ────────────────────────────────────────────
  // Em vez de cair na primeira venda (vira lixão de "VENDA"), criamos
  // um funil dedicado "📥 RD: Importados" pra debugar facilmente.
  let funilFallback: any = (funis || []).find((f: any) => f.nome === 'RD: Importados')
  if (!funilFallback) {
    const { data } = await supabaseAdmin().from('funis').insert({
      nome: 'RD: Importados', tipo: 'venda', emoji: '📥', cor: '#c9a84c',
      etapas: ['Novo', 'Em andamento', 'Ganho', 'Perdido'], ordem: 99,
    }).select('id, rd_id, etapas, nome, tipo').single()
    funilFallback = data
  }

  // Stages → pipeline (cacheado, mesmo motivo das pipelines)
  let stages: RDStage[] = (await lerCacheRD<RDStage[]>('stages')) || []
  if (!stages.length) {
    stages = await listarTodos<RDStage>('/deal_stages', token, 'deal_stages')
    if (stages.length) await gravarCacheRD('stages', stages)
  }
  const pipelinePorStage: Record<string, string> = {}
  for (const s of stages) {
    const sid = rdId(s)
    if (sid && s.deal_pipeline_id) pipelinePorStage[sid] = s.deal_pipeline_id
  }

  // Mapa users RD → users locais (vendedor)
  const { data: usersLocais } = await supabaseAdmin().from('users').select('id, rd_id, email, nome')
  const userPorRd:    Record<string, string> = {}
  const userPorEmail: Record<string, string> = {}
  const userPorNome:  Record<string, string> = {}
  for (const u of usersLocais || []) {
    if (u.rd_id) userPorRd[u.rd_id] = u.id
    if (u.email) userPorEmail[u.email.toLowerCase().trim()] = u.id
    if (u.nome)  userPorNome[norm(u.nome)] = u.id
  }

  const deals = (from && to)
    ? await listarPorJanela<RDDeal>('/deals', token, 'deals', from, to)
    : await listarTodos<RDDeal>('/deals', token, 'deals')
  stats.qtd_lidos = deals.length

  // Pré-carrega clientes por rd_id
  const contactRds = new Set<string>()
  for (const d of deals) for (const c of d.contacts || []) { const cid = rdId(c); if (cid) contactRds.add(cid) }
  const clientePorRd: Record<string, string> = {}
  const arr = Array.from(contactRds)
  for (let i = 0; i < arr.length; i += 500) {
    const lote = arr.slice(i, i + 500)
    const { data } = await supabaseAdmin().from('clientes').select('id, rd_id').in('rd_id', lote)
    for (const c of data || []) if (c.rd_id) clientePorRd[c.rd_id] = c.id
  }

  for (const d of deals) {
    try {
      const id = rdId(d)
      if (!id) continue

      // Detalhe completo (notes, custom_fields) — só quando explicitamente
      // solicitado (incluirDetalhes), pois adiciona 1 HTTP por deal e
      // facilmente estoura timeout do Vercel com volume alto.
      const detalhe = incluirDetalhes ? await buscarDealDetalhe(id, token) : null
      const dx = detalhe || d

      // Resolver funil — encadeado em ordem de confiança:
      //   1) rd_id do pipeline do deal bate com funil local
      //   2) nome do pipeline do deal bate com funil local
      //   3) deal só tem stage_id → resolve pipeline_id pela stage e
      //      tenta nome do pipeline buscado em rdPipelineNomePorId
      //   4) cria-se um funil novo automaticamente com o nome do RD
      //      (pra não cair no "RD: Importados" silenciosamente)
      const stageId = rdId(dx.deal_stage)
      const pipelineId = rdId(dx.deal_pipeline) || (stageId ? pipelinePorStage[stageId] : null)
      const pipeNomeFromDeal   = dx.deal_pipeline?.name || ''
      const pipeNomeFromMaster = pipelineId ? (rdPipelineNomePorId[pipelineId] || '') : ''
      const pipeNome = pipeNomeFromDeal || pipeNomeFromMaster

      let funil: any =
        (pipelineId && funilPorRd[pipelineId]) ||
        (pipeNome && funilPorNome[norm(pipeNome)]) ||
        null

      // Se ainda não temos match mas SABEMOS o nome do pipeline pelo RD,
      // criamos um funil novo com esse nome (auto-cadastro). Evita cair
      // na "VENDA" como fallback errado.
      if (!funil && pipeNome) {
        const pipelineRD = pipelineId ? rdPipelinePorId[pipelineId] : null
        const stagesRD: RDStage[] = (pipelineRD?.deal_stages || pipelineRD?.stages || [])
          .slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
        const etapas = stagesRD.map((s: any) => s.name || 'Etapa').filter(Boolean)
        const { data: novo } = await supabaseAdmin().from('funis').insert({
          rd_id: pipelineId || null, nome: pipeNome.trim(),
          tipo: 'venda', emoji: '📊', cor: '#1cb5a0',
          etapas: etapas.length ? etapas : ['Novo','Em andamento','Ganho','Perdido'],
          ordem: 50,
        }).select('id, rd_id, etapas, nome, tipo').single()
        if (novo) {
          funil = novo
          if (novo.rd_id) funilPorRd[novo.rd_id] = novo
          funilPorNome[norm(novo.nome)] = novo
        }
      }

      // Último recurso: fallback dedicado.
      if (!funil) funil = funilFallback
      if (!funil) { stats.qtd_erros++; stats.erros.push(`deal ${dx.name}: funil não encontrado`); continue }

      // Match etapa case-insensitive / sem acento
      const etapaRaw = dx.deal_stage?.name || ''
      const etapaMatch = (funil.etapas as string[]).find(e => norm(e) === norm(etapaRaw)) || (funil.etapas?.[0] || 'Novo')

      // Resolver cliente
      let clienteId: string | null = null
      const primeiro = dx.contacts?.[0]
      if (primeiro) {
        const cid = rdId(primeiro)
        if (cid && clientePorRd[cid]) clienteId = clientePorRd[cid]
      }

      // Pula deals cujo cliente foi criado por importação de seguradora.
      // Esses cadastros não devem virar negócios (carteira é gerida pelo
      // módulo Seguradoras / Apólices), evitando lixo em "RD: Importados".
      if (clienteId) {
        const { data: cli } = await supabaseAdmin().from('clientes')
          .select('fonte').eq('id', clienteId).maybeSingle()
        if (cli?.fonte && /^import:/i.test(String(cli.fonte))) {
          stats.qtd_pulados = (stats.qtd_pulados || 0) + 1
          continue
        }
      }

      // Resolver vendedor a partir do user RD do deal
      let vendedorId: string | null = null
      const userRdId = rdId(dx.user)
      if (userRdId && userPorRd[userRdId]) vendedorId = userPorRd[userRdId]
      if (!vendedorId && dx.user?.email && userPorEmail[dx.user.email.toLowerCase().trim()]) {
        vendedorId = userPorEmail[dx.user.email.toLowerCase().trim()]
      }
      if (!vendedorId && dx.user?.name && userPorNome[norm(dx.user.name)]) {
        vendedorId = userPorNome[norm(dx.user.name)]
      }

      // Status ganho/perdido a partir de win
      let status: 'em_andamento'|'ganho'|'perdido' = 'em_andamento'
      let dataFech: string | null = null
      if (dx.win === true)  { status = 'ganho';   dataFech = dx.closed_at || null }
      if (dx.win === false) { status = 'perdido'; dataFech = dx.closed_at || null }
      const motivoPerda = status === 'perdido' ? (dx.deal_lost_reason?.name || null) : null

      // Custom fields → texto
      const cfsRaw = (dx as any).deal_custom_fields || (dx as any).custom_fields || []
      const cfsTxt = Array.isArray(cfsRaw)
        ? cfsRaw.map((c: any) => {
            const k = c?.custom_field?.label || c?.label || c?.name || ''
            const v = c?.value ?? c?.values ?? c?.data ?? ''
            const vTxt = Array.isArray(v) ? v.join(', ') : String(v)
            return k && vTxt ? `${k}: ${vTxt}` : ''
          }).filter(Boolean)
        : []

      // Notes (do detalhe)
      const notesRaw = (dx as any).notes
      const notesTxt: string[] = []
      if (Array.isArray(notesRaw)) {
        for (const n of notesRaw) {
          const t = (n?.text || n?.body || n?.content || '').toString().trim()
          if (t) notesTxt.push(`📝 ${t}`)
        }
      } else if (typeof notesRaw === 'string' && notesRaw.trim()) {
        notesTxt.push(`📝 ${notesRaw.trim()}`)
      }

      // Tags
      const tagsTxt = Array.isArray((dx as any).tags) ? (dx as any).tags.map((t: any) => t?.name).filter(Boolean) : []

      // Observação consolidada
      const obsLinhas = [
        dx.name && `Negócio: ${dx.name}`,
        dx.organization?.name && `Empresa: ${dx.organization.name}`,
        dx.deal_source?.name && `Origem: ${dx.deal_source.name}`,
        dx.campaign?.name && `Campanha: ${dx.campaign.name}`,
        dx.deal_lost_reason?.name && `Motivo perda: ${dx.deal_lost_reason.name}`,
        dx.hold && `Hold: ${dx.hold}`,
        dx.user?.name && `Responsável RD: ${dx.user.name}`,
        tagsTxt.length && `Tags: ${tagsTxt.join(', ')}`,
        cfsTxt.length && `--- Campos adicionais ---\n${cfsTxt.join('\n')}`,
        notesTxt.length && `--- Anotações ---\n${notesTxt.join('\n')}`,
      ].filter(Boolean)
      const obs = obsLinhas.join('\n')

      const premio = Number(dx.amount_total ?? dx.amount_montly ?? dx.amount_unique ?? 0) || 0
      const venc = dx.prediction_date ? dx.prediction_date.slice(0, 10) : null
      const produto = dx.deal_products?.[0]?.product?.name || dx.deal_products?.[0]?.name || null

      const payload: any = {
        rd_id:           id,
        funil_id:        funil.id,
        etapa:           etapaMatch,
        titulo:          dx.name || 'Negócio RD',
        produto,
        premio,
        vencimento:      venc,
        obs:             obs || null,
        cliente_id:      clienteId,
        vendedor_id:     vendedorId,
        status,
        motivo_perda:    motivoPerda,
        data_fechamento: dataFech,
      }

      // Origem (deal_source) — auto-cria em origens se vier do RD
      let origemId: string | null = null
      const dealSource = (dx as any).deal_source
      if (dealSource?.name) {
        const srcRdId = rdId(dealSource)
        const { data: orig } = await supabaseAdmin().from('origens')
          .select('id').or(`rd_id.eq.${srcRdId || 'null'},nome.ilike.${dealSource.name.replace(/[,]/g,'')}`).maybeSingle()
        if (orig) {
          origemId = orig.id
          if (srcRdId) await supabaseAdmin().from('origens').update({ rd_id: srcRdId, nome: dealSource.name }).eq('id', orig.id)
        } else {
          const { data: nova } = await supabaseAdmin().from('origens').insert({ rd_id: srcRdId || null, nome: dealSource.name }).select('id').single()
          origemId = nova?.id || null
        }
      }
      payload.origem_id = origemId

      let negocioId: string | null = null
      const { data: existente } = await supabaseAdmin().from('negocios').select('id').eq('rd_id', id).maybeSingle()
      if (existente) {
        await supabaseAdmin().from('negocios').update(payload).eq('id', existente.id)
        negocioId = existente.id
        stats.qtd_atualizados++
      } else {
        const { data: novo } = await supabaseAdmin().from('negocios').insert(payload).select('id').single()
        negocioId = novo?.id || null
        stats.qtd_criados++
      }

      // Tags do deal → tabela tags + junction negocio_tags
      if (negocioId && Array.isArray((dx as any).tags) && (dx as any).tags.length) {
        for (const t of (dx as any).tags) {
          const tagNome = t?.name?.trim()
          if (!tagNome) continue
          const tagRd = rdId(t)
          let tagId: string | null = null
          const { data: tagExist } = await supabaseAdmin().from('tags')
            .select('id').or(`rd_id.eq.${tagRd || 'null'},nome.ilike.${tagNome.replace(/[,]/g,'')}`).maybeSingle()
          if (tagExist) tagId = tagExist.id
          else {
            const { data: nova } = await supabaseAdmin().from('tags').insert({ rd_id: tagRd || null, nome: tagNome }).select('id').single()
            tagId = nova?.id || null
          }
          if (tagId) {
            await supabaseAdmin().from('negocio_tags').upsert({ negocio_id: negocioId, tag_id: tagId })
          }
        }
      }

      // Produtos do deal → negocio_produtos (idempotente: limpa antes de re-popular)
      if (negocioId && Array.isArray(dx.deal_products) && dx.deal_products.length) {
        await supabaseAdmin().from('negocio_produtos').delete().eq('negocio_id', negocioId)
        const linhas = dx.deal_products.map((dp: any) => {
          const nomeProd = dp?.product?.name || dp?.name || dp?.description || 'Produto'
          const valor    = Number(dp?.price ?? dp?.base_price ?? dp?.amount ?? dp?.value) || 0
          const qtd      = Number(dp?.quantity ?? dp?.amount_quantity ?? 1) || 1
          return { negocio_id: negocioId, nome_snapshot: nomeProd, quantidade: qtd, valor_unit: valor }
        })
        if (linhas.length) await supabaseAdmin().from('negocio_produtos').insert(linhas)
      }
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(`deal ${d.name}: ${e?.message?.slice(0, 80)}`)
    }
  }

  return stats
}

async function importarAtividades(token: string, from?: string, to?: string) {
  const stats = { qtd_lidos: 0, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  let activities: RDActivity[] = []
  try {
    activities = (from && to)
      ? await listarPorJanela<RDActivity>('/activities', token, 'activities', from, to)
      : await listarTodos<RDActivity>('/activities', token, 'activities')
  } catch (e: any) {
    return { ...stats, qtd_erros: 1, erros: [`activities: ${e?.message?.slice(0, 100)}`] }
  }
  stats.qtd_lidos = activities.length

  for (const a of activities) {
    try {
      const id = rdId(a)
      if (!id) continue
      const tipoMap: Record<string, string> = { task: 'tarefa', call: 'ligacao', email: 'email', meeting: 'reuniao', note: 'nota' }
      const tipo = tipoMap[(a.type || '').toLowerCase()] || 'tarefa'

      let clienteId: string | null = null
      const cid = rdId(a.contact)
      if (cid) {
        const { data } = await supabaseAdmin().from('clientes').select('id').eq('rd_id', cid).maybeSingle()
        clienteId = data?.id || null
      }
      let negocioId: string | null = null
      const did = rdId(a.deal)
      if (did) {
        const { data } = await supabaseAdmin().from('negocios').select('id').eq('rd_id', did).maybeSingle()
        negocioId = data?.id || null
      }

      const payload: any = {
        rd_id: id,
        titulo: (a.text || 'Atividade RD').slice(0, 255),
        descricao: a.text || null,
        tipo,
        status: a.done ? 'concluida' : 'pendente',
        prazo: a.date ? `${a.date.slice(0, 10)}T${(a.hour || '09:00').slice(0, 5)}:00Z` : null,
        cliente_id: clienteId,
        negocio_id: negocioId,
      }

      const { data: existente } = await supabaseAdmin().from('tarefas').select('id').eq('rd_id', id).maybeSingle()
      if (existente) {
        await supabaseAdmin().from('tarefas').update(payload).eq('id', existente.id)
        stats.qtd_atualizados++
      } else {
        await supabaseAdmin().from('tarefas').insert(payload)
        stats.qtd_criados++
      }
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(`atividade ${a.text?.slice(0, 30)}: ${e?.message?.slice(0, 80)}`)
    }
  }
  return stats
}

async function importarMotivosPerda(token: string) {
  const stats = { qtd_lidos: 0, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  // RD expõe em /deal_lost_reasons (alguns ambientes em /lost_reasons)
  let lista: any[] = []
  for (const path of ['/deal_lost_reasons', '/lost_reasons']) {
    for (const key of ['deal_lost_reasons', 'lost_reasons']) {
      try {
        const r = await listarTodos<any>(path, token, key)
        if (r.length > 0) { lista = r; break }
      } catch {}
    }
    if (lista.length > 0) break
  }
  stats.qtd_lidos = lista.length

  for (const m of lista) {
    try {
      const id = rdId(m)
      const nome = (m?.name || '').trim()
      if (!nome) continue
      // Match por rd_id, depois por nome
      const { data: existente } = await supabaseAdmin().from('motivos_perda')
        .select('id, rd_id').or(`rd_id.eq.${id || 'null'},nome.ilike.${nome.replace(/[,]/g,'')}`).maybeSingle()
      if (existente) {
        await supabaseAdmin().from('motivos_perda').update({ rd_id: id || existente.rd_id, nome }).eq('id', existente.id)
        stats.qtd_atualizados++
      } else {
        await supabaseAdmin().from('motivos_perda').insert({ rd_id: id || null, nome })
        stats.qtd_criados++
      }
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(`motivo ${m?.name}: ${e?.message?.slice(0, 80)}`)
    }
  }
  return stats
}

async function importarProdutos(token: string) {
  const stats = { qtd_lidos: 0, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  let lista: any[] = []
  for (const path of ['/products']) {
    for (const key of ['products']) {
      try {
        const r = await listarTodos<any>(path, token, key)
        if (r.length > 0) { lista = r; break }
      } catch {}
    }
    if (lista.length > 0) break
  }
  stats.qtd_lidos = lista.length

  for (const p of lista) {
    try {
      const id = rdId(p)
      const nome = (p?.name || '').trim()
      if (!nome) continue
      // RD expõe valor do produto em campos diferentes dependendo da
      // configuração: base_price (mais comum), price, amount, value,
      // unit_price, max_discount não conta. Pegamos o primeiro
      // numérico encontrado.
      const camposPreco = [p?.base_price, p?.price, p?.amount, p?.value, p?.unit_price]
      const preco = camposPreco.map((v: any) => Number(v)).find((n: number) => Number.isFinite(n) && n > 0) ?? null
      const { data: existente } = await supabaseAdmin().from('produtos')
        .select('id, rd_id').or(`rd_id.eq.${id || 'null'},nome.ilike.${nome.replace(/[,]/g,'')}`).maybeSingle()
      if (existente) {
        await supabaseAdmin().from('produtos').update({ rd_id: id || existente.rd_id, nome, preco_base: preco }).eq('id', existente.id)
        stats.qtd_atualizados++
      } else {
        await supabaseAdmin().from('produtos').insert({ rd_id: id || null, nome, preco_base: preco })
        stats.qtd_criados++
      }
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(`produto ${p?.name}: ${e?.message?.slice(0, 80)}`)
    }
  }
  return stats
}

// ─── HTTP Handler ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await checarAdmin(request)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const token = getToken(request)
  if (!token) return NextResponse.json({ error: 'Token RD Station não configurado. Defina RDSTATION_CRM_TOKEN ou envie no header x-rd-token.' }, { status: 400 })

  let action: string = ''
  let from: string | undefined
  let to: string | undefined
  let detalhes = false
  try {
    const body = await request.json()
    action = body.action
    from = body.from
    to = body.to
    detalhes = !!body.detalhes
  } catch {}

  try {
    if (action === 'test') {
      return NextResponse.json(await ping(token))
    }

    const ordem = ['usuarios', 'funis', 'motivos_perda', 'produtos', 'contatos', 'negocios', 'atividades']
    const recursos = action === 'all' ? ordem : [action]
    const resultados: Record<string, any> = {}

    for (const r of recursos) {
      const recursoLog = (from && to && (r === 'contatos' || r === 'negocios' || r === 'atividades')) ? `${r} ${from.slice(0,10)}→${to.slice(0,10)}` : r
      const logId = await logSync(recursoLog, auth.userId)
      let stats
      try {
        if (r === 'usuarios')             stats = await importarUsuarios(token)
        else if (r === 'funis')           stats = await importarFunis(token)
        else if (r === 'motivos_perda')   stats = await importarMotivosPerda(token)
        else if (r === 'produtos')        stats = await importarProdutos(token)
        else if (r === 'contatos')        stats = await importarContatos(token, from, to)
        else if (r === 'negocios')        stats = await importarNegocios(token, from, to, detalhes)
        else if (r === 'atividades')      stats = await importarAtividades(token, from, to)
        else { resultados[r] = { error: 'recurso inválido' }; continue }
      } catch (e: any) {
        stats = { qtd_lidos: 0, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 1, erros: [e?.message?.slice(0, 200) || 'erro'] }
      }
      await fecharLog(logId, stats)
      resultados[r] = stats
    }

    return NextResponse.json({ ok: true, resultados })
  } catch (err: any) {
    console.error('[RD Sync] erro:', err)
    return NextResponse.json({ error: err?.message || 'erro' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = await checarAdmin(request)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })
  const { data } = await supabaseAdmin().from('rdstation_syncs').select('*').order('iniciado_em', { ascending: false }).limit(50)
  return NextResponse.json({ syncs: data || [] })
}
