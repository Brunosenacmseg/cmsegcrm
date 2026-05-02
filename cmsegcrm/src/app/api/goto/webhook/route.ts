import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('[GoTo Webhook]', JSON.stringify(body))

    const { metadata, state } = body
    if (!state || !metadata) return NextResponse.json({ ok: true })

    const conversationId = metadata.conversationSpaceId || metadata.conversationId
    const direction = metadata.direction === 'OUTBOUND' ? 'sainte' : 'entrante'
    const callCreated = metadata.callCreated || new Date().toISOString()

    const stateType = state.type // STARTING, ACTIVE, ENDING, ENDED
    const participants = state.participants || []

    // Extrair números dos participantes
    let numeroOrigem = ''
    let numeroDestino = ''
    let nomeContato = ''

    for (const p of participants) {
      if (p.type?.value === 'PHONE_NUMBER') {
        const num = p.type.number || ''
        if (direction === 'entrante') {
          numeroOrigem = num
          nomeContato = p.type.callee?.name || num
        } else {
          numeroDestino = num
          nomeContato = p.type.callee?.name || num
        }
      }
      if (p.type?.value === 'LINE') {
        if (direction === 'sainte') numeroOrigem = p.type.extensionNumber || ''
        else numeroDestino = p.type.extensionNumber || ''
      }
    }

    if (stateType === 'STARTING') {
      // Verificar se já existe
      const { data: existing } = await supabaseAdmin
        .from('ligacoes')
        .select('id')
        .eq('goto_conversation_id', conversationId)
        .single()

      if (!existing) {
        // Tentar vincular ao cliente pelo número
        let clienteId = null
        const numeroParaBusca = (direction === 'entrante' ? numeroOrigem : numeroDestino).replace(/\D/g, '').slice(-11)
        if (numeroParaBusca) {
          const { data: cliente } = await supabaseAdmin
            .from('clientes')
            .select('id')
            .ilike('telefone', `%${numeroParaBusca}%`)
            .single()
          if (cliente) clienteId = cliente.id
        }

        await supabaseAdmin.from('ligacoes').insert({
          goto_conversation_id: conversationId,
          goto_call_id: state.id,
          direcao: direction,
          numero_origem: numeroOrigem,
          numero_destino: numeroDestino,
          nome_contato: nomeContato,
          status: 'iniciada',
          inicio: callCreated,
          cliente_id: clienteId,
        })
      }
    }

    if (stateType === 'ACTIVE') {
      await supabaseAdmin.from('ligacoes')
        .update({ status: 'em_andamento' })
        .eq('goto_conversation_id', conversationId)
    }

    if (stateType === 'ENDING' || stateType === 'ENDED') {
      const { data: ligacao } = await supabaseAdmin
        .from('ligacoes')
        .select('inicio')
        .eq('goto_conversation_id', conversationId)
        .single()

      let duracaoSeg = 0
      if (ligacao?.inicio) {
        duracaoSeg = Math.round((Date.now() - new Date(ligacao.inicio).getTime()) / 1000)
      }

      await supabaseAdmin.from('ligacoes')
        .update({
          status: stateType === 'ENDED' ? 'encerrada' : 'encerrando',
          fim: new Date().toISOString(),
          duracao_seg: duracaoSeg,
        })
        .eq('goto_conversation_id', conversationId)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[GoTo Webhook Error]', err)
    return NextResponse.json({ ok: true }) // Sempre retorna 200 para o GoTo
  }
}

export async function GET() {
  // Verificação do webhook pelo GoTo
  return NextResponse.json({ status: 'ok', service: 'CM Seguros GoTo Webhook' })
}
