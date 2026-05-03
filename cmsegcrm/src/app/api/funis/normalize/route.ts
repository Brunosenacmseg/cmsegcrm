// Endpoint admin pra normalizar NEGOCIAÇÕES duplicadas.
//
// Agrupa por (funil_id, cliente_id, titulo normalizado) — quando 2+ negócios
// caem no mesmo grupo, mantém um (keeper) e remove os outros, transferindo
// histórico, tarefas, comissões e anexos para o keeper.
//
// Critério do keeper, em ordem:
//   1) tem rd_id (RD Station é fonte de verdade)
//   2) status='ganho' antes de 'em_andamento' antes de 'perdido'
//   3) prêmio maior
//   4) updated_at mais recente
//
// POST { dryRun?: boolean }
//   dryRun=true → só relata o que seria feito.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { norm } from '@/lib/rdstation'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData } = await supabaseAdmin().auth.getUser(token)
  if (!userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', userData.user.id).single()
  if ((u as any)?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const }
}

const STATUS_RANK: Record<string, number> = { ganho: 3, em_andamento: 2, perdido: 1 }

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const dryRun = !!body.dryRun

  // Carrega negócios em lotes (a tabela pode ser grande)
  const PAGE = 1000
  let from = 0
  const todos: any[] = []
  while (true) {
    const { data, error } = await supabaseAdmin().from('negocios')
      .select('id, funil_id, cliente_id, titulo, rd_id, status, premio, updated_at, created_at')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || !data.length) break
    todos.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  // Agrupa por (funil_id, cliente_id, titulo normalizado)
  const grupos: Record<string, any[]> = {}
  for (const n of todos) {
    if (!n.titulo || !n.cliente_id || !n.funil_id) continue
    const k = `${n.funil_id}::${n.cliente_id}::${norm(String(n.titulo))}`
    if (!grupos[k]) grupos[k] = []
    grupos[k].push(n)
  }

  const acoes: any[] = []
  let totalApagados = 0

  for (const [chave, lista] of Object.entries(grupos)) {
    if (lista.length < 2) continue

    const ordenados = [...lista].sort((a, b) => {
      const ra = a.rd_id ? 1 : 0, rb = b.rd_id ? 1 : 0
      if (ra !== rb) return rb - ra
      const sa = STATUS_RANK[a.status || 'em_andamento'] || 2
      const sb = STATUS_RANK[b.status || 'em_andamento'] || 2
      if (sa !== sb) return sb - sa
      const pa = Number(a.premio || 0), pb = Number(b.premio || 0)
      if (pa !== pb) return pb - pa
      return new Date(b.updated_at || b.created_at).getTime() -
             new Date(a.updated_at || a.created_at).getTime()
    })
    const keeper = ordenados[0]
    const duplicatas = ordenados.slice(1)

    const acao = {
      grupo: chave,
      titulo: keeper.titulo,
      keeper: { id: keeper.id, status: keeper.status, premio: keeper.premio, rd_id: keeper.rd_id },
      duplicatas: duplicatas.map(d => ({ id: d.id, status: d.status, premio: d.premio, rd_id: d.rd_id })),
      historico_movido: 0,
      tarefas_movidas: 0,
      comissoes_movidas: 0,
      anexos_movidos: 0,
    }

    if (!dryRun) {
      for (const d of duplicatas) {
        // Move histórico
        const { count: hCount } = await supabaseAdmin().from('historico')
          .update({ negocio_id: keeper.id }, { count: 'exact' }).eq('negocio_id', d.id)
        acao.historico_movido += hCount || 0

        // Move tarefas
        const { count: tCount } = await supabaseAdmin().from('tarefas')
          .update({ negocio_id: keeper.id }, { count: 'exact' }).eq('negocio_id', d.id)
        acao.tarefas_movidas += tCount || 0

        // Move comissões recebidas
        const { count: cCount } = await supabaseAdmin().from('comissoes_recebidas')
          .update({ negocio_id: keeper.id }, { count: 'exact' }).eq('negocio_id', d.id)
        acao.comissoes_movidas += cCount || 0

        // Anexos (se a tabela referenciar negocio_id)
        const { count: aCount } = await supabaseAdmin().from('anexos')
          .update({ negocio_id: keeper.id }, { count: 'exact' }).eq('negocio_id', d.id)
        acao.anexos_movidos += aCount || 0

        // Apaga a duplicata
        const { error } = await supabaseAdmin().from('negocios').delete().eq('id', d.id)
        if (error) return NextResponse.json({
          error: `Erro apagando negócio ${d.id}: ${error.message}`,
          parcial: acoes,
        }, { status: 500 })
        totalApagados++
      }
    } else {
      totalApagados += duplicatas.length
    }

    acoes.push(acao)
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    grupos_duplicados: acoes.length,
    negocios_apagados: totalApagados,
    detalhes: acoes,
  })
}
