// Resolve @lid → telefone consultando Evolution /chat/findContacts e
// atualiza whatsapp_mensagens.remoto_numero faltantes.
//
// Uso: GET /api/whatsapp/resolver-lid?instancia=corretor_bruno

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function admin(): any {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const sa = admin()
  const inst_param = req.nextUrl.searchParams.get('instancia')
  const tStart = Date.now()
  const HARD_LIMIT = 50_000

  const { data: insts } = await sa.from('whatsapp_instancias')
    .select('id, nome, evolution_url, api_key')
  const ativas = (insts || []).filter((i: any) => !inst_param || i.nome === inst_param)
  if (!ativas.length) return NextResponse.json({ error: 'instancia nao encontrada' }, { status: 404 })

  const evoUrl = (i: any) => i.evolution_url || process.env.EVOLUTION_API_URL || ''
  const evoKey = (i: any) => i.api_key       || process.env.EVOLUTION_API_KEY || ''

  let totalAtualizados = 0
  const detalhe: Array<{ instancia: string; lid: string; numero: string; atualizadas: number }> = []
  const erros: string[] = []
  const naoResolvidos: string[] = []
  const debug: any = { contatos_total: 0, contatos_com_lid: 0, primeiro_contato_keys: [], primeiro_contato: null }

  for (const inst of ativas) {
    if (Date.now() - tStart > HARD_LIMIT) break
    if (!evoUrl(inst) || !evoKey(inst)) { erros.push(`${inst.nome}: sem evolution_url/api_key`); continue }

    // Pega todos os contatos da instancia uma vez (mais eficiente que 1 call por lid)
    let contatos: any[] = []
    try {
      const r = await fetch(`${evoUrl(inst).replace(/\/$/, '')}/chat/findContacts/${encodeURIComponent(inst.nome)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': evoKey(inst) },
        body: JSON.stringify({ where: {} }),
      })
      if (r.ok) {
        const j: any = await r.json()
        contatos = Array.isArray(j) ? j : (j?.records || j?.data || [])
      }
    } catch (e: any) {
      erros.push(`${inst.nome}: findContacts ${e?.message || e}`)
      continue
    }

    // Evolution v2 não retorna campo 'lid' nos contatos — só id+pushName.
    // Estratégia: matching por pushName, mas SÓ se o pushName for UNICO na
    // lista (caso contrario, ambiguidade — pode mapear pro contato errado).
    const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    const telPorNome: Record<string, Set<string>> = {}
    debug.contatos_total = contatos.length
    if (contatos[0]) {
      debug.primeiro_contato_keys = Object.keys(contatos[0])
      debug.primeiro_contato = JSON.stringify(contatos[0]).slice(0, 800)
    }
    for (const c of contatos) {
      const nome = norm(c?.pushName || '')
      const idJid = c?.id || c?.remoteJid || c?.jid || ''
      if (!nome || !idJid || idJid.includes('@lid')) continue
      const numero = String(idJid).replace(/@.*$/, '').replace(/\D/g, '')
      if (numero.length >= 10 && numero.length <= 15) {
        if (!telPorNome[nome]) telPorNome[nome] = new Set()
        telPorNome[nome].add(numero)
      }
    }
    // Só mantem nomes que apontam pra exatamente 1 telefone
    const mapNomeTel: Record<string, string> = {}
    for (const [nome, tels] of Object.entries(telPorNome)) {
      if (tels.size === 1) mapNomeTel[nome] = Array.from(tels)[0]
    }
    debug.nomes_unicos = Object.keys(mapNomeTel).length
    debug.nomes_ambiguos = Object.keys(telPorNome).length - Object.keys(mapNomeTel).length

    // @lid distintos na nossa base SEM numero, com pushName
    const { data: faltantes } = await sa
      .from('whatsapp_mensagens')
      .select('remoto_jid, remoto_nome')
      .eq('instancia_id', inst.id)
      .like('remoto_jid', '%@lid')
      .or('remoto_numero.is.null,remoto_numero.eq.')
      .limit(5000)
    const porJid: Record<string, string> = {}
    for (const r of (faltantes || []) as any[]) {
      if (!porJid[r.remoto_jid] && r.remoto_nome) porJid[r.remoto_jid] = r.remoto_nome
    }

    for (const lid of Object.keys(porJid)) {
      if (Date.now() - tStart > HARD_LIMIT) break
      const nome = norm(porJid[lid])
      const numero = mapNomeTel[nome]
      if (!numero) { naoResolvidos.push(`${inst.nome} ${lid} (${porJid[lid]})`); continue }
      const { error, count } = await sa
        .from('whatsapp_mensagens')
        .update({ remoto_numero: numero }, { count: 'exact' })
        .eq('instancia_id', inst.id)
        .eq('remoto_jid', lid)
      if (error) erros.push(`${inst.nome} ${lid}: update ${error.message}`)
      else {
        totalAtualizados += count || 0
        if (detalhe.length < 50) detalhe.push({ instancia: inst.nome, lid, numero, atualizadas: count || 0 })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    instancias: ativas.length,
    msgs_atualizadas: totalAtualizados,
    lids_nao_resolvidos: naoResolvidos.length,
    erros: erros.slice(0, 30),
    duracao_ms: Date.now() - tStart,
    amostra: detalhe.slice(0, 30),
    amostra_nao_resolvidos: naoResolvidos.slice(0, 20),
    debug,
  })
}
