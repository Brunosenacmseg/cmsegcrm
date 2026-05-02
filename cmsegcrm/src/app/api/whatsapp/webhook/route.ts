import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chamarClaude } from '@/lib/claude'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'cmsegcrm'

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
function extrairContato(data: any): { jid: string; numero: string } {
  const jidOriginal = data?.key?.remoteJid || ''
  const candidatos: string[] = [
    data?.key?.senderPn, data?.key?.senderPnJid,
    data?.senderPn, data?.senderPnJid,
    data?.message?.senderPn,
    data?.message?.contextInfo?.senderPn,
    data?.contextInfo?.senderPn,
    data?.key?.participantPn, data?.participantPn,
    data?.key?.participant, data?.participant, data?.sender,
  ].filter(Boolean) as string[]

  for (const c of candidatos) {
    if (!c || c.includes('@lid')) continue
    const digitos = String(c).replace(/\D/g, '')
    if (digitos.length >= 10 && digitos.length <= 15) {
      return { jid: c.includes('@') ? c : `${digitos}@s.whatsapp.net`, numero: digitos }
    }
  }
  if (jidOriginal && !jidOriginal.includes('@lid')) {
    const digitos = jidOriginal.replace(/@.*$/, '').replace(/\D/g, '')
    if (digitos.length >= 10 && digitos.length <= 15) {
      return { jid: jidOriginal, numero: digitos }
    }
  }
  return { jid: jidOriginal, numero: '' }
}

// Detecta o tipo da mensagem e extrai metadados de mídia (se houver).
function detectarTipoEMidia(message: any): {
  tipo: string
  caption: string
  mimetype: string | null
  nomeArquivo: string | null
  duracao: number | null
  temMidia: boolean
} {
  if (!message) return { tipo: 'text', caption: '', mimetype: null, nomeArquivo: null, duracao: null, temMidia: false }

  if (message.imageMessage) {
    return {
      tipo: 'image',
      caption: message.imageMessage.caption || '',
      mimetype: message.imageMessage.mimetype || 'image/jpeg',
      nomeArquivo: null,
      duracao: null,
      temMidia: true,
    }
  }
  if (message.videoMessage) {
    return {
      tipo: 'video',
      caption: message.videoMessage.caption || '',
      mimetype: message.videoMessage.mimetype || 'video/mp4',
      nomeArquivo: null,
      duracao: message.videoMessage.seconds || null,
      temMidia: true,
    }
  }
  if (message.audioMessage) {
    return {
      tipo: 'audio',
      caption: '',
      mimetype: message.audioMessage.mimetype || 'audio/ogg',
      nomeArquivo: null,
      duracao: message.audioMessage.seconds || null,
      temMidia: true,
    }
  }
  if (message.documentMessage) {
    return {
      tipo: 'document',
      caption: message.documentMessage.caption || '',
      mimetype: message.documentMessage.mimetype || 'application/octet-stream',
      nomeArquivo: message.documentMessage.fileName || message.documentMessage.title || 'documento',
      duracao: null,
      temMidia: true,
    }
  }
  if (message.documentWithCaptionMessage?.message?.documentMessage) {
    const dm = message.documentWithCaptionMessage.message.documentMessage
    return {
      tipo: 'document',
      caption: dm.caption || '',
      mimetype: dm.mimetype || 'application/octet-stream',
      nomeArquivo: dm.fileName || 'documento',
      duracao: null,
      temMidia: true,
    }
  }
  if (message.stickerMessage) {
    return { tipo: 'sticker', caption: '', mimetype: 'image/webp', nomeArquivo: null, duracao: null, temMidia: true }
  }
  return { tipo: 'text', caption: '', mimetype: null, nomeArquivo: null, duracao: null, temMidia: false }
}

// Pede base64 da mídia para a Evolution API (o webhook costuma vir só com a
// referência criptografada; precisamos pedir para a Evolution decifrar).
async function baixarBase64Evo(evo_url: string, api_key: string, instance: string, msgPayload: any): Promise<string | null> {
  // Evolution pode incluir a mídia direto no webhook (data.message.base64) se
  // a opção estiver ativada. Tentamos primeiro:
  if (msgPayload?.message?.base64) return msgPayload.message.base64
  if (msgPayload?.base64) return msgPayload.base64

  try {
    const url = `${evo_url.replace(/\/$/,'')}/chat/getBase64FromMediaMessage/${instance}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': api_key },
      body: JSON.stringify({ message: { key: msgPayload.key, message: msgPayload.message }, convertToMp4: false }),
    })
    if (!res.ok) {
      console.error('[WhatsApp] getBase64 falhou:', res.status, await res.text())
      return null
    }
    const data = await res.json()
    return data?.base64 || data?.media || null
  } catch (e) {
    console.error('[WhatsApp] erro baixando mídia:', e)
    return null
  }
}

function extensaoDeMime(mime: string | null): string {
  if (!mime) return 'bin'
  const m = mime.toLowerCase()
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('gif')) return 'gif'
  if (m.includes('mp4')) return 'mp4'
  if (m.includes('quicktime')) return 'mov'
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('mpeg')) return 'mp3'
  if (m.includes('wav')) return 'wav'
  if (m.includes('pdf')) return 'pdf'
  if (m.includes('zip')) return 'zip'
  return m.split('/').pop()?.split(';')[0] || 'bin'
}

// Transcreve áudio via OpenAI Whisper. Retorna texto ou null.
async function transcreverAudio(base64: string, mimetype: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    console.warn('[WhatsApp] OPENAI_API_KEY ausente — pulando transcrição')
    return null
  }
  try {
    const buffer = Buffer.from(base64, 'base64')
    const ext = extensaoDeMime(mimetype)
    const blob = new Blob([buffer], { type: mimetype || 'audio/ogg' })
    const form = new FormData()
    form.append('file', blob, `audio.${ext}`)
    form.append('model', 'whisper-1')
    form.append('language', 'pt')
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` },
      body: form,
    })
    if (!res.ok) {
      console.error('[WhatsApp] Whisper falhou:', res.status, await res.text())
      return null
    }
    const data = await res.json()
    return (data?.text || '').trim() || null
  } catch (e) {
    console.error('[WhatsApp] erro transcrevendo:', e)
    return null
  }
}

// Faz upload da mídia no Storage e devolve o path salvo.
async function salvarMidiaStorage(
  instanciaId: string,
  evolutionId: string,
  base64: string,
  mimetype: string,
): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64, 'base64')
    const ext = extensaoDeMime(mimetype)
    const path = `whatsapp/${instanciaId}/${Date.now()}_${evolutionId}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: mimetype,
      upsert: true,
    })
    if (error) {
      console.error('[WhatsApp] upload Storage falhou:', error)
      return null
    }
    return path
  } catch (e) {
    console.error('[WhatsApp] erro upload mídia:', e)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event, instance, data } = body

    // ── MENSAGEM RECEBIDA ─────────────────────
    if (event === 'messages.upsert' && data?.key?.fromMe === false) {
      const { jid: remotoJid, numero: remotoNumero } = extrairContato(data)
      const meta = detectarTipoEMidia(data.message)
      const conteudoTexto = data.message?.conversation
                         || data.message?.extendedTextMessage?.text
                         || meta.caption
                         || ''
      const pushName = (data.pushName && String(data.pushName).trim()) || null

      const { data: instRow } = await supabase
        .from('whatsapp_instancias')
        .select('id, evolution_url, api_key, nome, agente_id, agente_ativo')
        .eq('nome', instance)
        .single()
      const inst = instRow ? {
        ...instRow,
        evolution_url: instRow.evolution_url || process.env.EVOLUTION_API_URL,
        api_key:       instRow.api_key       || process.env.EVOLUTION_API_KEY,
      } : null

      if (inst) {
        let clienteId: string | null = null
        if (remotoNumero && remotoNumero.length >= 8) {
          const { data: cliente } = await supabase
            .from('clientes')
            .select('id')
            .ilike('telefone', `%${remotoNumero.slice(-8)}%`)
            .maybeSingle()
          clienteId = cliente?.id || null
        }

        // Baixa e armazena a mídia (se houver)
        let midiaPath: string | null = null
        let transcricao: string | null = null
        let base64Audio: string | null = null
        if (meta.temMidia) {
          const base64 = await baixarBase64Evo(inst.evolution_url, inst.api_key, instance, data)
          if (base64) {
            midiaPath = await salvarMidiaStorage(inst.id, data.key.id, base64, meta.mimetype || 'application/octet-stream')
            if (meta.tipo === 'audio') base64Audio = base64
          }
        }

        // Transcreve áudio (assíncrono ao usuário, mas dentro do request)
        if (base64Audio) {
          transcricao = await transcreverAudio(base64Audio, meta.mimetype || 'audio/ogg')
        }

        // Conteúdo "texto" salvo: caption (se houver) ou rótulo da mídia
        const rotuloMidia: Record<string, string> = {
          image: '📷 Imagem', video: '🎬 Vídeo', audio: '🎵 Áudio',
          document: `📄 ${meta.nomeArquivo || 'Documento'}`, sticker: '🎭 Figurinha',
        }
        const conteudoFinal = conteudoTexto || rotuloMidia[meta.tipo] || '[mídia]'

        await supabase.from('whatsapp_mensagens').insert({
          instancia_id:   inst.id,
          cliente_id:     clienteId,
          remoto_jid:     remotoJid,
          remoto_numero:  remotoNumero || null,
          remoto_nome:    pushName,
          conteudo:       conteudoFinal,
          tipo:           meta.tipo,
          direcao:        'recebida',
          lida:           false,
          evolution_id:   data.key.id,
          midia_url:      midiaPath,
          midia_mimetype: meta.mimetype,
          midia_nome:     meta.nomeArquivo,
          midia_duracao:  meta.duracao,
          transcricao:    transcricao,
        })

        // Auto-resposta com agente IA. Se for áudio, usa transcrição como
        // entrada; se for outra mídia sem caption, ignora.
        const entradaIA = transcricao || conteudoTexto
        if (inst.agente_ativo && inst.agente_id && remotoJid && entradaIA) {
          try {
            const { data: agente } = await supabase.from('ai_agentes').select('*').eq('id', inst.agente_id).maybeSingle()
            if (agente?.ativo) {
              const { data: hist } = await supabase.from('whatsapp_mensagens')
                .select('conteudo, transcricao, direcao').eq('instancia_id', inst.id).eq('remoto_jid', remotoJid)
                .order('created_at', { ascending: false }).limit(10)
              const historico = (hist || []).reverse().slice(0, -1).map(m => ({
                role: m.direcao === 'enviada' ? 'assistant' as const : 'user' as const,
                content: m.transcricao || m.conteudo || '',
              }))
              const resposta = await chamarClaude({
                modelo: agente.modelo,
                systemPrompt: agente.system_prompt,
                mensagem: entradaIA,
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
  return NextResponse.json({ status: 'CM Seguros WhatsApp Webhook online' })
}
