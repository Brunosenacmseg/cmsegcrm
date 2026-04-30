import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function extrairNumero(data: any): string {
  // Tentar pegar número real em vários campos possíveis
  const jid = data?.key?.remoteJid || ''
  
  // Se for @lid, tentar pegar número real de outros campos
  if (jid.includes('@lid')) {
    // Número pode estar em pushName, verifiedBizName ou notify
    const notify = data?.message?.extendedTextMessage?.contextInfo?.participant
      || data?.participant
      || data?.verifiedBizName
      || ''
    
    // Tentar pegar do campo sender
    const sender = data?.sender || data?.key?.participant || ''
    
    if (sender && !sender.includes('@lid')) return sender
    if (notify && !notify.includes('@lid')) return notify
    
    // Último recurso: usar o número do @lid sem o sufixo
    return jid.replace('@lid', '@s.whatsapp.net')
  }
  
  return jid
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event, instance, data } = body

    // ── MENSAGEM RECEBIDA ─────────────────────
    if (event === 'messages.upsert' && data?.key?.fromMe === false) {
      const remotoJidOriginal = data.key.remoteJid || ''
      const remotoJid = extrairNumero(data)
      const remotoNumero = remotoJid.replace('@s.whatsapp.net','').replace('@lid','').replace('@g.us','')
      const conteudo = data.message?.conversation
                    || data.message?.extendedTextMessage?.text
                    || data.message?.imageMessage?.caption
                    || '[mídia]'
      const pushName = data.pushName || remotoNumero

      const { data: inst } = await supabase
        .from('whatsapp_instancias')
        .select('id')
        .eq('nome', instance)
        .single()

      if (inst) {
        // Tentar vincular a cliente pelo número
        const { data: cliente } = await supabase
          .from('clientes')
          .select('id')
          .ilike('telefone', `%${remotoNumero.slice(-8)}%`)
          .single()

        await supabase.from('whatsapp_mensagens').insert({
          instancia_id:  inst.id,
          cliente_id:    cliente?.id || null,
          remoto_jid:    remotoJid,        // JID real para envio
          remoto_numero: remotoNumero,     // Número formatado
          remoto_nome:   pushName,
          conteudo,
          tipo:          'text',
          direcao:       'recebida',
          lida:          false,
          evolution_id:  data.key.id,
        })
      }
    }

    // ── STATUS DE CONEXÃO ────────────────────
    if (event === 'connection.update') {
      const status = data?.state === 'open' ? 'connected'
                   : data?.state === 'close' ? 'disconnected'
                   : 'connecting'
      await supabase
        .from('whatsapp_instancias')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('nome', instance)
    }

    // ── QR CODE ───────────────────────────────
    if (event === 'qrcode.updated') {
      await supabase
        .from('whatsapp_instancias')
        .update({ qrcode: data?.qrcode?.base64, status: 'qrcode', updated_at: new Date().toISOString() })
        .eq('nome', instance)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'CM.segCRM WhatsApp Webhook online' })
}
