import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chamarClaude } from '@/lib/claude'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Envia uma resposta via Evolution API (mesma que o módulo /whatsapp usa).
async function enviarRespostaEvo(evo_url: string, api_key: string, instance: string, jid: string, texto: string) {
  try {
    const url = `${evo_url.replace(/\/$/,'')}/message/sendText/${instance}`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': api_key },
      body: JSON.stringify({ number: jid, text: texto }),
    })
  } catch (e) {
    console.error('[WhatsApp] erro ao enviar resposta IA:', e)
  }
}

// Extrai o número real de telefone (ignorando IDs internos @lid do Meta).
// Retorna { jid, numero } onde:
//   - jid: JID usado para enviar resposta (preferimos @s.whatsapp.net real)
//   - numero: somente dígitos do telefone, ou '' se não for possível obter
function extrairContato(data: any): { jid: string; numero: string } {
  const jidOriginal = data?.key?.remoteJid || ''

  // Campos que a Evolution / Baileys expõem com o telefone REAL quando o
  // remoteJid vem como @lid (ID interno do Meta). Ordem de prioridade:
  const candidatos: string[] = [
    data?.key?.senderPn,
    data?.key?.senderPnJid,
    data?.senderPn,
    data?.senderPnJid,
    data?.message?.senderPn,
    data?.message?.contextInfo?.senderPn,
    data?.contextInfo?.senderPn,
    data?.key?.participantPn,
    data?.participantPn,
    data?.key?.participant,        // só serve se NÃO for @lid
    data?.participant,
    data?.sender,
  ].filter(Boolean) as string[]

  for (const c of candidatos) {
    if (!c || c.includes('@lid')) continue
    const digitos = String(c).replace(/\D/g, '')
    if (digitos.length >= 10 && digitos.length <= 15) {
      return { jid: c.includes('@') ? c : `${digitos}@s.whatsapp.net`, numero: digitos }
    }
  }

  // remoteJid em si (caso seja @s.whatsapp.net já)
  if (jidOriginal && !jidOriginal.includes('@lid')) {
    const digitos = jidOriginal.replace(/@.*$/, '').replace(/\D/g, '')
    if (digitos.length >= 10 && digitos.length <= 15) {
      return { jid: jidOriginal, numero: digitos }
    }
  }

  // Não conseguimos resolver — devolvemos o jid bruto pra ainda salvar a
  // mensagem, mas SEM "número" pra UI exibir só o pushName.
  return { jid: jidOriginal, numero: '' }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event, instance, data } = body

    // ── MENSAGEM RECEBIDA ─────────────────────
    if (event === 'messages.upsert' && data?.key?.fromMe === false) {
      const { jid: remotoJid, numero: remotoNumero } = extrairContato(data)
      const conteudo = data.message?.conversation
                    || data.message?.extendedTextMessage?.text
                    || data.message?.imageMessage?.caption
                    || '[mídia]'
      // pushName = nome do contato no WhatsApp dele. Se não vier, deixamos
      // null pra UI cair pro número formatado (não pro código @lid).
      const pushName = (data.pushName && String(data.pushName).trim()) || null

      const { data: inst } = await supabase
        .from('whatsapp_instancias')
        .select('id, evolution_url, api_key, nome, agente_id, agente_ativo')
        .eq('nome', instance)
        .single()

      if (inst) {
        // Tentar vincular a cliente pelo número (apenas se temos número real)
        let clienteId: string | null = null
        if (remotoNumero && remotoNumero.length >= 8) {
          const { data: cliente } = await supabase
            .from('clientes')
            .select('id')
            .ilike('telefone', `%${remotoNumero.slice(-8)}%`)
            .maybeSingle()
          clienteId = cliente?.id || null
        }

        await supabase.from('whatsapp_mensagens').insert({
          instancia_id:  inst.id,
          cliente_id:    clienteId,
          remoto_jid:    remotoJid,
          remoto_numero: remotoNumero || null,
          remoto_nome:   pushName,
          conteudo,
          tipo:          'text',
          direcao:       'recebida',
          lida:          false,
          evolution_id:  data.key.id,
        })

        // Auto-resposta com agente IA (se a instância tem agente ativo)
        if (inst.agente_ativo && inst.agente_id && remotoJid) {
          try {
            const { data: agente } = await supabase.from('ai_agentes').select('*').eq('id', inst.agente_id).maybeSingle()
            if (agente?.ativo) {
              // Carrega últimas 10 mensagens da conversa para contexto
              const { data: hist } = await supabase.from('whatsapp_mensagens')
                .select('conteudo, direcao').eq('instancia_id', inst.id).eq('remoto_jid', remotoJid)
                .order('created_at', { ascending: false }).limit(10)
              const historico = (hist || []).reverse().slice(0, -1).map(m => ({
                role: m.direcao === 'enviada' ? 'assistant' as const : 'user' as const,
                content: m.conteudo || '',
              }))
              const resposta = await chamarClaude({
                modelo: agente.modelo,
                systemPrompt: agente.system_prompt,
                mensagem: conteudo,
                historico,
                maxTokens: agente.max_tokens || 1024,
                temperatura: Number(agente.temperatura) || 0.7,
              })
              if (resposta) {
                await enviarRespostaEvo(inst.evolution_url, inst.api_key, inst.nome, remotoJid, resposta)
                await supabase.from('whatsapp_mensagens').insert({
                  instancia_id: inst.id, cliente_id: clienteId,
                  remoto_jid: remotoJid, remoto_numero: remotoNumero || null,
                  remoto_nome: pushName, conteudo: resposta, tipo: 'text',
                  direcao: 'enviada', lida: true,
                })
              }
            }
          } catch (e) {
            console.error('[WhatsApp] auto-resposta IA falhou:', e)
          }
        }
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
