import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import {
  listarTodos, ping, rdId,
  RDContact, RDDeal, RDPipeline, RDActivity, RDUser, RDStage,
} from '@/lib/rdstation'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getToken(request: NextRequest): string | null {
  return request.headers.get('x-rd-token') || process.env.RDSTATION_CRM_TOKEN || null
}

async function checarAdmin(): Promise<{ ok: boolean; userId?: string; erro?: string }> {
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado' }
  const { data: u } = await supabaseAdmin.from('users').select('role').eq('id', session.user.id).single()
  if (u?.role !== 'admin') return { ok: false, erro: 'Apenas admin pode sincronizar' }
  return { ok: true, userId: session.user.id }
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
  const { data } = await supabaseAdmin.from('rdstation_syncs').insert({
    recurso, status: 'processando', user_id: userId || null,
  }).select('id').single()
  return data?.id as string | undefined
}

async function fecharLog(id: string | undefined, dados: { qtd_lidos: number; qtd_criados: number; qtd_atualizados: number; qtd_erros: number; erros: string[] }) {
  if (!id) return
  const status = dados.qtd_erros === 0 ? 'concluido' : (dados.qtd_criados + dados.qtd_atualizados > 0 ? 'parcial' : 'erro')
  await supabaseAdmin.from('rdstation_syncs').update({
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
      const { data: existente } = await supabaseAdmin.from('users').select('id, rd_id').eq('email', email).maybeSingle()
      if (existente) {
        if (existente.rd_id !== id) {
          await supabaseAdmin.from('users').update({ rd_id: id }).eq('id', existente.id)
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
  const pipelines = await listarTodos<RDPipeline>('/deal_pipelines', token, 'deal_pipelines')
  stats.qtd_lidos = pipelines.length

  for (const p of pipelines) {
    try {
      const id = rdId(p)
      if (!id) continue
      const stages: RDStage[] = (p.deal_stages || p.stages || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      const etapas = stages.map(s => s.name || 'Etapa').filter(Boolean)
      if (etapas.length === 0) etapas.push('Novo', 'Em andamento', 'Ganho', 'Perdido')

      const nome = `RD: ${p.name || 'Pipeline'}`
      const { data: existente } = await supabaseAdmin.from('funis').select('id').eq('rd_id', id).maybeSingle()
      if (existente) {
        await supabaseAdmin.from('funis').update({ nome, etapas }).eq('id', existente.id)
        stats.qtd_atualizados++
      } else {
        await supabaseAdmin.from('funis').insert({ rd_id: id, nome, tipo: 'venda', emoji: '📊', cor: '#1cb5a0', etapas, ordem: 99 })
        stats.qtd_criados++
      }
    } catch (e: any) {
      stats.qtd_erros++
      stats.erros.push(`pipeline ${p.name}: ${e?.message?.slice(0, 80)}`)
    }
  }
  return stats
}

async function importarContatos(token: string) {
  const stats = { qtd_lidos: 0, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  const contatos = await listarTodos<RDContact>('/contacts', token, 'contacts')
  stats.qtd_lidos = contatos.length

  // Carregar mapas existentes
  const rdIds = contatos.map(c => rdId(c)).filter(Boolean) as string[]
  const mapaExistentes: Record<string, string> = {}

  for (let i = 0; i < rdIds.length; i += 500) {
    const lote = rdIds.slice(i, i + 500)
    const { data } = await supabaseAdmin.from('clientes').select('id, rd_id').in('rd_id', lote)
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
    const { error } = await supabaseAdmin.from('clientes').insert(lote)
    if (error) {
      for (const item of lote) {
        const { error: e2 } = await supabaseAdmin.from('clientes').insert(item)
        if (e2) { stats.qtd_erros++; if (stats.erros.length < 20) stats.erros.push(`${item.nome}: ${e2.message?.slice(0, 80)}`) }
        else stats.qtd_criados++
      }
    } else {
      stats.qtd_criados += lote.length
    }
  }

  // Update
  for (const { id, data } of updates) {
    const { error } = await supabaseAdmin.from('clientes').update(data).eq('id', id)
    if (error) { stats.qtd_erros++; if (stats.erros.length < 20) stats.erros.push(`${data.nome}: ${error.message?.slice(0, 80)}`) }
    else stats.qtd_atualizados++
  }

  return stats
}

async function importarNegocios(token: string) {
  const stats = { qtd_lidos: 0, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }

  // Mapas auxiliares
  const { data: funis } = await supabaseAdmin.from('funis').select('id, rd_id, etapas, nome, tipo')
  const funilPorRd: Record<string, any> = {}
  for (const f of funis || []) if (f.rd_id) funilPorRd[f.rd_id] = f

  // Funil fallback (caso pipeline do deal não exista)
  let funilFallback: any = (funis || []).find((f: any) => f.tipo === 'venda')
  if (!funilFallback) {
    const { data } = await supabaseAdmin.from('funis').insert({
      nome: 'RD: Importados', tipo: 'venda', emoji: '📥', cor: '#c9a84c',
      etapas: ['Novo', 'Em andamento', 'Ganho', 'Perdido'], ordem: 99,
    }).select('id, etapas, nome, tipo').single()
    funilFallback = data
  }

  // Stages → pipeline (para deals que vêm com deal_stage mas não com deal_pipeline)
  const stages = await listarTodos<RDStage>('/deal_stages', token, 'deal_stages')
  const pipelinePorStage: Record<string, string> = {}
  for (const s of stages) {
    const sid = rdId(s)
    if (sid && s.deal_pipeline_id) pipelinePorStage[sid] = s.deal_pipeline_id
  }

  const deals = await listarTodos<RDDeal>('/deals', token, 'deals')
  stats.qtd_lidos = deals.length

  // Pré-carrega clientes por rd_id
  const contactRds = new Set<string>()
  for (const d of deals) for (const c of d.contacts || []) { const cid = rdId(c); if (cid) contactRds.add(cid) }
  const clientePorRd: Record<string, string> = {}
  const arr = Array.from(contactRds)
  for (let i = 0; i < arr.length; i += 500) {
    const lote = arr.slice(i, i + 500)
    const { data } = await supabaseAdmin.from('clientes').select('id, rd_id').in('rd_id', lote)
    for (const c of data || []) if (c.rd_id) clientePorRd[c.rd_id] = c.id
  }

  for (const d of deals) {
    try {
      const id = rdId(d)
      if (!id) continue

      // Resolver funil
      const stageId = rdId(d.deal_stage)
      const pipelineId = rdId(d.deal_pipeline) || (stageId ? pipelinePorStage[stageId] : null)
      const funil = (pipelineId && funilPorRd[pipelineId]) || funilFallback
      if (!funil) { stats.qtd_erros++; stats.erros.push(`deal ${d.name}: funil não encontrado`); continue }

      const etapaNome = d.deal_stage?.name || (funil.etapas?.[0] || 'Novo')
      const etapa = (funil.etapas as string[])?.includes(etapaNome) ? etapaNome : (funil.etapas?.[0] || 'Novo')

      // Resolver cliente
      let clienteId: string | null = null
      const primeiro = d.contacts?.[0]
      if (primeiro) {
        const cid = rdId(primeiro)
        if (cid && clientePorRd[cid]) clienteId = clientePorRd[cid]
      }

      // Definir etapa final se win/hold
      let etapaFinal = etapa
      if (d.win === true) {
        const ganhos = ['Fechado Ganho', 'Ganho', 'Renovado', 'Pago', 'Concluído']
        const m = (funil.etapas as string[]).find(e => ganhos.includes(e))
        if (m) etapaFinal = m
      } else if (d.win === false) {
        const perdidos = ['Fechado Perdido', 'Perdido', 'Não Renovado', 'Negado']
        const m = (funil.etapas as string[]).find(e => perdidos.includes(e))
        if (m) etapaFinal = m
      }

      const obs = [
        d.name && `Negócio: ${d.name}`,
        d.deal_source?.name && `Origem: ${d.deal_source.name}`,
        d.campaign?.name && `Campanha: ${d.campaign.name}`,
        d.deal_lost_reason?.name && `Motivo perda: ${d.deal_lost_reason.name}`,
        d.user?.name && `Responsável RD: ${d.user.name}`,
      ].filter(Boolean).join(' | ')

      const premio = Number(d.amount_total ?? d.amount_montly ?? d.amount_unique ?? 0) || 0
      const venc = d.prediction_date ? d.prediction_date.slice(0, 10) : null

      const payload: any = {
        rd_id: id,
        funil_id: funil.id,
        etapa: etapaFinal,
        produto: d.deal_products?.[0]?.product?.name || d.deal_products?.[0]?.name || null,
        premio,
        vencimento: venc,
        obs: obs || null,
        cliente_id: clienteId,
      }

      const { data: existente } = await supabaseAdmin.from('negocios').select('id').eq('rd_id', id).maybeSingle()
      if (existente) {
        await supabaseAdmin.from('negocios').update(payload).eq('id', existente.id)
        stats.qtd_atualizados++
      } else {
        // Negócios sem cliente exigem cliente_id NOT NULL no schema original.
        // Se não há cliente_id, criamos um placeholder com o nome do deal.
        if (!payload.cliente_id) {
          const { data: ph } = await supabaseAdmin.from('clientes').insert({
            nome: d.organization?.name || d.name || 'Sem cliente (RD)',
            tipo: d.organization?.name ? 'PJ' : 'PF',
            fonte: 'RD Station CRM',
          }).select('id').single()
          payload.cliente_id = ph?.id
        }
        if (payload.cliente_id) {
          await supabaseAdmin.from('negocios').insert(payload)
          stats.qtd_criados++
        }
      }
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(`deal ${d.name}: ${e?.message?.slice(0, 80)}`)
    }
  }

  return stats
}

async function importarAtividades(token: string) {
  const stats = { qtd_lidos: 0, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  let activities: RDActivity[] = []
  try {
    activities = await listarTodos<RDActivity>('/activities', token, 'activities')
  } catch (e: any) {
    // Algumas contas RD não têm /activities habilitado
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
        const { data } = await supabaseAdmin.from('clientes').select('id').eq('rd_id', cid).maybeSingle()
        clienteId = data?.id || null
      }
      let negocioId: string | null = null
      const did = rdId(a.deal)
      if (did) {
        const { data } = await supabaseAdmin.from('negocios').select('id').eq('rd_id', did).maybeSingle()
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

      const { data: existente } = await supabaseAdmin.from('tarefas').select('id').eq('rd_id', id).maybeSingle()
      if (existente) {
        await supabaseAdmin.from('tarefas').update(payload).eq('id', existente.id)
        stats.qtd_atualizados++
      } else {
        await supabaseAdmin.from('tarefas').insert(payload)
        stats.qtd_criados++
      }
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(`atividade ${a.text?.slice(0, 30)}: ${e?.message?.slice(0, 80)}`)
    }
  }
  return stats
}

// ─── HTTP Handler ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await checarAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const token = getToken(request)
  if (!token) return NextResponse.json({ error: 'Token RD Station não configurado. Defina RDSTATION_CRM_TOKEN ou envie no header x-rd-token.' }, { status: 400 })

  let action: string = ''
  try { ({ action } = await request.json()) } catch {}

  try {
    if (action === 'test') {
      return NextResponse.json(await ping(token))
    }

    const ordem = ['usuarios', 'funis', 'contatos', 'negocios', 'atividades']
    const recursos = action === 'all' ? ordem : [action]
    const resultados: Record<string, any> = {}

    for (const r of recursos) {
      const logId = await logSync(r, auth.userId)
      let stats
      try {
        if (r === 'usuarios')        stats = await importarUsuarios(token)
        else if (r === 'funis')      stats = await importarFunis(token)
        else if (r === 'contatos')   stats = await importarContatos(token)
        else if (r === 'negocios')   stats = await importarNegocios(token)
        else if (r === 'atividades') stats = await importarAtividades(token)
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

export async function GET() {
  const auth = await checarAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })
  const { data } = await supabaseAdmin.from('rdstation_syncs').select('*').order('iniciado_em', { ascending: false }).limit(50)
  return NextResponse.json({ syncs: data || [] })
}
