// Endpoint admin pra normalizar funis: encontra duplicados (mesmo nome
// normalizado) e unifica em um só funil. Move negócios e vínculos de
// equipe pro "keeper" e apaga as duplicatas.
//
// Critério de escolha do keeper (em ordem):
//  1) tem rd_id (integração RD Station é fonte de verdade)
//  2) tem mais negócios associados
//  3) created_at mais antigo
//
// Retorna um relatório do que foi feito.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { norm } from '@/lib/rdstation'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

type Funil = {
  id: string
  nome: string
  tipo: string | null
  emoji: string | null
  cor: string | null
  etapas: string[] | null
  ordem: number | null
  descricao: string | null
  rd_id: string | null
  created_at: string
}

// POST /api/funis/normalize  body: { dryRun?: boolean }
// dryRun=true só retorna o que seria feito, sem alterar nada.
export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const dryRun = !!body.dryRun

  const { data: funis, error } = await supabaseAdmin
    .from('funis')
    .select('id, nome, tipo, emoji, cor, etapas, ordem, descricao, rd_id, created_at')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Conta negócios por funil
  const contagem: Record<string, number> = {}
  for (const f of (funis || []) as Funil[]) {
    const { count } = await supabaseAdmin
      .from('negocios')
      .select('*', { count: 'exact', head: true })
      .eq('funil_id', f.id)
    contagem[f.id] = count || 0
  }

  // Agrupa por nome normalizado
  const grupos: Record<string, Funil[]> = {}
  for (const f of (funis || []) as Funil[]) {
    const k = norm(f.nome)
    if (!k) continue
    if (!grupos[k]) grupos[k] = []
    grupos[k].push(f)
  }

  const acoes: any[] = []

  for (const [chave, lista] of Object.entries(grupos)) {
    if (lista.length < 2) continue

    // Escolhe o keeper
    const ordenados = [...lista].sort((a, b) => {
      const ra = a.rd_id ? 1 : 0
      const rb = b.rd_id ? 1 : 0
      if (ra !== rb) return rb - ra
      const ca = contagem[a.id] || 0
      const cb = contagem[b.id] || 0
      if (ca !== cb) return cb - ca
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    const keeper = ordenados[0]
    const duplicatas = ordenados.slice(1)

    // Etapas mescladas (union, preservando ordem do keeper)
    const etapasKeeper = (keeper.etapas || []).slice()
    const setEtapas = new Set(etapasKeeper.map(e => norm(e)))
    for (const d of duplicatas) {
      for (const e of (d.etapas || [])) {
        if (!setEtapas.has(norm(e))) {
          etapasKeeper.push(e)
          setEtapas.add(norm(e))
        }
      }
    }

    const acao = {
      grupo: chave,
      keeper: { id: keeper.id, nome: keeper.nome, rd_id: keeper.rd_id, cards: contagem[keeper.id] || 0 },
      duplicatas: duplicatas.map(d => ({ id: d.id, nome: d.nome, rd_id: d.rd_id, cards: contagem[d.id] || 0 })),
      etapas_finais: etapasKeeper,
      cards_movidos: 0,
      equipes_movidas: 0,
    }

    if (!dryRun) {
      for (const d of duplicatas) {
        // Move negócios da duplicata pro keeper
        const { error: eN, count: nMov } = await supabaseAdmin
          .from('negocios')
          .update({ funil_id: keeper.id }, { count: 'exact' })
          .eq('funil_id', d.id)
        if (eN) return NextResponse.json({ error: `Erro movendo negócios de ${d.id}: ${eN.message}`, parcial: acoes }, { status: 500 })
        acao.cards_movidos += nMov || 0

        // Move vínculos de equipe (ignora conflito de PK)
        const { data: vinculos } = await supabaseAdmin
          .from('funis_equipes')
          .select('equipe_id')
          .eq('funil_id', d.id)
        for (const v of vinculos || []) {
          const { error: eFE } = await supabaseAdmin
            .from('funis_equipes')
            .upsert({ funil_id: keeper.id, equipe_id: (v as any).equipe_id }, { onConflict: 'funil_id,equipe_id' })
          if (!eFE) acao.equipes_movidas++
        }
        await supabaseAdmin.from('funis_equipes').delete().eq('funil_id', d.id)

        // Apaga a duplicata
        const { error: eD } = await supabaseAdmin.from('funis').delete().eq('id', d.id)
        if (eD) return NextResponse.json({ error: `Erro apagando duplicata ${d.id}: ${eD.message}`, parcial: acoes }, { status: 500 })
      }

      // Atualiza etapas do keeper (union)
      await supabaseAdmin.from('funis').update({ etapas: etapasKeeper }).eq('id', keeper.id)
    }

    acoes.push(acao)
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    grupos_duplicados: acoes.length,
    funis_apagados: acoes.reduce((s, a) => s + a.duplicatas.length, 0),
    cards_movidos: acoes.reduce((s, a) => s + a.cards_movidos, 0),
    detalhes: acoes,
  })
}
