// Backfill de mensagens enviadas pelo celular (fromMe=true) que nao estao no
// historico do CRM. Para cada conversa de uma instancia, consulta Evolution
// /chat/findMessages e insere as faltantes (filtra por evolution_id ja gravado).
//
// Uso: GET /api/whatsapp/backfill-celular?instancia=corretor_bruno&limite=20
//   ou GET /api/whatsapp/backfill-celular  (todas instancias, batch limitado)

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
  const limite = Math.max(1, Math.min(500, Number(req.nextUrl.searchParams.get('limite') || 50)))
  const conv_limit = Math.max(1, Math.min(500, Number(req.nextUrl.searchParams.get('conversas') || 80)))
  const tStart = Date.now()
  const HARD_LIMIT = 50_000

  const { data: insts } = await sa.from('whatsapp_instancias')
    .select('id, nome, evolution_url, api_key')
    .order('nome')
  const ativas = (insts || []).filter((i: any) => !inst_param || i.nome === inst_param)
  if (!ativas.length) return NextResponse.json({ error: 'instancia nao encontrada' }, { status: 404 })

  const evoUrl = (i: any) => i.evolution_url || process.env.EVOLUTION_API_URL || ''
  const evoKey = (i: any) => i.api_key       || process.env.EVOLUTION_API_KEY || ''

  let totalInseridas = 0, totalConversas = 0, totalConsultadas = 0
  const erros: string[] = []
  const detalhe: Array<{ instancia: string; jid: string; inseridas: number; consultadas: number }> = []
  const debug_first_response: any = { hash: null, raw_keys: [], msg_keys: [], primeira_msg: null, fromMe_count: 0, total: 0 }

  for (const inst of ativas) {
    if (Date.now() - tStart > HARD_LIMIT) break
    if (!evoUrl(inst) || !evoKey(inst)) { erros.push(`${inst.nome}: sem evolution_url/api_key`); continue }

    // Conversas distintas dessa instancia (ordenadas pelo mais recente)
    const { data: convs } = await sa
      .from('whatsapp_mensagens')
      .select('remoto_jid')
      .eq('instancia_id', inst.id)
      .order('created_at', { ascending: false })
      .limit(5000)
    const jids: string[] = (Array.from(new Set((convs || []).map((c: any) => String(c.remoto_jid || '')).filter(Boolean))) as string[]).slice(0, conv_limit)

    for (const jid of jids) {
      if (Date.now() - tStart > HARD_LIMIT) break
      totalConversas++

      // Busca msgs no Evolution (fromMe=true)
      let msgs: any[] = []
      try {
        const url = `${evoUrl(inst).replace(/\/$/, '')}/chat/findMessages/${encodeURIComponent(inst.nome)}`
        // Evolution ignora `fromMe` no where e o `limit` raw — passamos via
        // `page`/`offset` se disponivel. Buscamos TODAS as msgs do remoteJid
        // (sem filtro fromMe) e filtramos client-side. Limite alto pra puxar
        // historico completo.
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': evoKey(inst) },
          body: JSON.stringify({
            where: { key: { remoteJid: jid } },
            limit: limite,
            page: 1,
            offset: 0,
          }),
        })
        if (!r.ok) { erros.push(`${inst.nome} ${jid}: HTTP ${r.status}`); continue }
        const j: any = await r.json()
        msgs = Array.isArray(j) ? j : (j?.messages?.records || j?.records || j?.data || [])
        totalConsultadas += msgs.length
        if (debug_first_response.hash === null) {
          debug_first_response.hash = jid
          debug_first_response.raw_keys = j && typeof j === 'object' && !Array.isArray(j) ? Object.keys(j) : ['<array>']
          debug_first_response.total = msgs.length
          if (msgs[0]) {
            debug_first_response.msg_keys = Object.keys(msgs[0])
            debug_first_response.primeira_msg = JSON.stringify(msgs[0]).slice(0, 800)
          }
          debug_first_response.fromMe_count = msgs.filter((m: any) => m?.key?.fromMe === true || m?.fromMe === true).length
        }
      } catch (e: any) {
        erros.push(`${inst.nome} ${jid}: ${e?.message || e}`)
        continue
      }
      if (!msgs.length) continue

      // Filtra apenas fromMe=true (extrai do shape variante)
      const enviadas = msgs.filter((m: any) => m?.key?.fromMe === true || m?.fromMe === true)
      if (!enviadas.length) continue

      // Quais evolution_id ja temos?
      const ids = enviadas.map((m: any) => m?.key?.id || m?.id).filter(Boolean)
      let jaTemos = new Set<string>()
      if (ids.length) {
        const { data: ja } = await sa.from('whatsapp_mensagens')
          .select('evolution_id').in('evolution_id', ids)
        jaTemos = new Set((ja || []).map((r: any) => r.evolution_id).filter(Boolean))
      }

      // Conteudos enviados pelo CRM (sem evolution_id) nos ultimos 30d — pra dedup
      const { data: semId } = await sa.from('whatsapp_mensagens')
        .select('conteudo').is('evolution_id', null)
        .eq('instancia_id', inst.id).eq('remoto_jid', jid).eq('direcao', 'enviada')
        .gt('created_at', new Date(Date.now() - 30*24*60*60*1000).toISOString())
        .limit(500)
      const conteudosSemId = new Set((semId || []).map((r: any) => String(r.conteudo || '')))

      // Lookup cliente por numero (sufixo de 8 digitos)
      const numero = String(jid).split('@')[0].replace(/\D+/g, '')
      let clienteId: string | null = null
      if (numero.length >= 8) {
        const { data: cli } = await sa.from('clientes').select('id')
          .ilike('telefone', `%${numero.slice(-8)}%`).maybeSingle()
        clienteId = cli?.id || null
      }

      const linhas: any[] = []
      for (const m of enviadas) {
        const evoId = m?.key?.id || m?.id
        if (!evoId || jaTemos.has(evoId)) continue
        const conteudo = m?.message?.conversation
                      || m?.message?.extendedTextMessage?.text
                      || m?.message?.imageMessage?.caption
                      || m?.message?.videoMessage?.caption
                      || m?.message?.documentMessage?.caption
                      || ''
        if (!conteudo) continue // skip pure midia (no caption) por hora
        if (conteudosSemId.has(conteudo)) continue
        const ts = Number(m?.messageTimestamp || m?.timestamp || 0)
        linhas.push({
          instancia_id: inst.id,
          cliente_id:   clienteId,
          remoto_jid:   jid,
          remoto_numero: numero || null,
          conteudo,
          tipo:         'text',
          direcao:      'enviada',
          lida:         true,
          evolution_id: evoId,
          created_at:   ts ? new Date(ts * 1000).toISOString() : undefined,
        })
      }
      if (linhas.length) {
        const { error } = await sa.from('whatsapp_mensagens').insert(linhas)
        if (error) erros.push(`${inst.nome} ${jid}: insert ${error.message}`)
        else { totalInseridas += linhas.length; detalhe.push({ instancia: inst.nome, jid, inseridas: linhas.length, consultadas: msgs.length }) }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    instancias_processadas: ativas.length,
    conversas: totalConversas,
    msgs_consultadas_evo: totalConsultadas,
    msgs_inseridas: totalInseridas,
    erros: erros.slice(0, 30),
    duracao_ms: Date.now() - tStart,
    amostra: detalhe.slice(0, 20),
    debug_first_response,
  })
}
