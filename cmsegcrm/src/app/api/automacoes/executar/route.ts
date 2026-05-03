import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export const maxDuration = 60

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function autenticar(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data } = await supabaseAdmin().auth.getUser(token)
  return data?.user || null
}

type Trigger = 'negocio_criado' | 'etapa_alterada' | 'status_ganho' | 'status_perdido'

interface Acao {
  tipo: string
  [k: string]: any
}

async function executarAcao(acao: Acao, negocio: any, userId?: string): Promise<{ ok: boolean; detalhe?: any; erro?: string }> {
  try {
    if (acao.tipo === 'mover_etapa') {
      await supabaseAdmin().from('negocios').update({ etapa: acao.etapa }).eq('id', negocio.id)
      return { ok: true, detalhe: { etapa: acao.etapa } }
    }

    if (acao.tipo === 'criar_negocio_em_funil') {
      // Funil reverso: cria nova negociação a partir do cliente atual
      // num outro funil/etapa (geralmente reciclagem).
      const { data: funilDestino } = await supabaseAdmin().from('funis').select('id, etapas').eq('id', acao.funil_id).maybeSingle()
      if (!funilDestino) return { ok: false, erro: 'Funil destino não encontrado' }
      const etapa = acao.etapa || (funilDestino.etapas?.[0]) || 'Novo'

      const copiar: string[] = Array.isArray(acao.copiar) ? acao.copiar : ['cliente','produto','vendedor','equipe']
      const payload: any = {
        funil_id:    funilDestino.id,
        etapa,
        titulo:      acao.titulo || `↺ ${negocio.titulo || 'Reciclado'}`,
        fonte:       'Automação',
        obs:         `Criado automaticamente pela automação a partir do negócio ${negocio.id}`,
      }
      if (copiar.includes('cliente'))  payload.cliente_id  = negocio.cliente_id
      if (copiar.includes('produto'))  payload.produto     = negocio.produto
      if (copiar.includes('vendedor')) payload.vendedor_id = negocio.vendedor_id
      if (copiar.includes('equipe'))   payload.equipe_id   = negocio.equipe_id
      if (copiar.includes('cpf'))      payload.cpf_cnpj    = negocio.cpf_cnpj
      if (copiar.includes('origem'))   payload.origem_id   = negocio.origem_id
      if (copiar.includes('premio'))   payload.premio      = negocio.premio

      const { data: novo, error } = await supabaseAdmin().from('negocios').insert(payload).select('id').single()
      if (error) return { ok: false, erro: error.message }
      return { ok: true, detalhe: { negocio_criado_id: novo?.id, funil_id: funilDestino.id, etapa } }
    }

    if (acao.tipo === 'criar_tarefa') {
      const prazo = acao.prazo_dias ? new Date(Date.now() + Number(acao.prazo_dias) * 24*60*60*1000).toISOString() : null
      const { error } = await supabaseAdmin().from('tarefas').insert({
        titulo:        acao.titulo || 'Nova tarefa (automação)',
        descricao:     acao.descricao || null,
        tipo:          acao.tipo_tarefa || 'tarefa',
        status:        'pendente',
        prazo,
        cliente_id:    negocio.cliente_id || null,
        negocio_id:    negocio.id,
        responsavel_id: acao.responsavel_id || negocio.vendedor_id || userId || null,
        criado_por:    userId || null,
      })
      if (error) return { ok: false, erro: error.message }
      return { ok: true, detalhe: { titulo: acao.titulo } }
    }

    if (acao.tipo === 'notificar') {
      const userTarget = acao.user_id || negocio.vendedor_id
      if (!userTarget) return { ok: false, erro: 'sem user para notificar' }
      const { error } = await supabaseAdmin().from('notificacoes').insert({
        user_id:    userTarget,
        tipo:       'sistema',
        titulo:     acao.titulo || 'Notificação automática',
        descricao:  acao.descricao || null,
        link:       acao.link || '/dashboard/funis',
      })
      if (error) return { ok: false, erro: error.message }
      return { ok: true }
    }

    if (acao.tipo === 'set_custom_field') {
      if (!acao.chave) return { ok: false, erro: 'chave obrigatória' }
      const cf = { ...(negocio.custom_fields || {}), [acao.chave]: acao.valor }
      await supabaseAdmin().from('negocios').update({ custom_fields: cf }).eq('id', negocio.id)
      return { ok: true, detalhe: { [acao.chave]: acao.valor } }
    }

    return { ok: false, erro: `tipo de ação desconhecido: ${acao.tipo}` }
  } catch (e: any) {
    return { ok: false, erro: e?.message?.slice(0, 200) || 'erro' }
  }
}

// POST { trigger, negocio_id, etapa_anterior?, etapa_atual? }
// Roda todas as automações ativas que casam com o trigger e
// (se houver) com o funil + etapa do negócio.
export async function POST(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const trigger: Trigger = body?.trigger
  const negocioId: string = body?.negocio_id
  if (!trigger || !negocioId) return NextResponse.json({ error: 'trigger e negocio_id obrigatórios' }, { status: 400 })

  const { data: negocio } = await supabaseAdmin().from('negocios').select('*').eq('id', negocioId).maybeSingle()
  if (!negocio) return NextResponse.json({ error: 'negócio não encontrado' }, { status: 404 })

  // Carrega automações ativas que batem com o trigger e o funil
  const { data: automacoes } = await supabaseAdmin().from('automacoes').select('*')
    .eq('ativo', true).eq('trigger', trigger)
    .or(`funil_id.is.null,funil_id.eq.${negocio.funil_id}`)

  const resultados: any[] = []
  for (const a of automacoes || []) {
    // Filtro de etapa: se etapa_filtro setado, só dispara quando bater
    if (a.etapa_filtro && trigger === 'etapa_alterada' && a.etapa_filtro !== negocio.etapa) continue

    const acoes: Acao[] = Array.isArray(a.acoes) ? a.acoes : []
    const execs: any[] = []
    let sucessoGeral = true
    let primeiroErro = null
    for (const acao of acoes) {
      const r = await executarAcao(acao, negocio, user.id)
      execs.push({ acao: acao.tipo, ...r })
      if (!r.ok && !primeiroErro) { sucessoGeral = false; primeiroErro = r.erro || null }
    }

    await supabaseAdmin().from('automacoes_logs').insert({
      automacao_id:     a.id,
      negocio_id:       negocio.id,
      trigger,
      sucesso:          sucessoGeral,
      erro:             primeiroErro,
      acoes_executadas: execs,
    })

    resultados.push({ automacao: a.nome, sucesso: sucessoGeral, acoes: execs })
  }

  return NextResponse.json({ ok: true, executadas: resultados.length, resultados })
}
