import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { chamarChatGPT } from '@/lib/openai'

export const maxDuration = 60

// lazy-init: evita que o build do Next falhe quando env vars
// não estão disponíveis na fase 'Collecting page data'.
const supabase = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(_t, prop) {
    const g = globalThis as any
    if (!g['__sa_supabase']) g['__sa_supabase'] = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    return (g['__sa_supabase'] as any)[prop]
  }
})

const BUCKET = 'cmsegcrm'

// Envia uma resposta via Evolution API (mesma que o módulo /whatsapp usa).
async function enviarRespostaEvo(evo_url: string, api_key: string, instance: string, jid: string, texto: string) {
  try {
    const url = `${evo_url.replace(/\/$/,'')}/message/sendText/${instance}`
    const numero = String(jid || '').split('@')[0].replace(/\D/g, '')
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': api_key },
      body: JSON.stringify({ number: numero || jid, text: texto, textMessage: { text: texto } }),
    })
  } catch (e) {
    console.error('[WhatsApp] erro ao enviar resposta IA:', e)
  }
}

// Extrai o número real de telefone (ignorando IDs internos @lid do Meta).
// Devolve também o @lid original (quando houver) pra o handler usar tanto pro
// upsert no mapping (lid→canon) quanto pro lookup quando o número não veio.
function extrairContato(data: any): { jid: string; numero: string; lid: string } {
  const jidOriginal = data?.key?.remoteJid || ''
  const lid = jidOriginal.includes('@lid') ? jidOriginal : ''
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
      return { jid: c.includes('@') ? c : `${digitos}@s.whatsapp.net`, numero: digitos, lid }
    }
  }
  if (jidOriginal && !jidOriginal.includes('@lid')) {
    const digitos = jidOriginal.replace(/@.*$/, '').replace(/\D/g, '')
    if (digitos.length >= 10 && digitos.length <= 15) {
      return { jid: jidOriginal, numero: digitos, lid }
    }
  }
  return { jid: jidOriginal, numero: '', lid }
}

// Consulta whatsapp_lid_map pra resolver um @lid no JID canônico
// (@s.whatsapp.net). Retorna null se não houver mapeamento conhecido.
async function resolverLidNoCanon(instanciaId: string, jidLid: string): Promise<{ jid: string; numero: string } | null> {
  if (!jidLid || !jidLid.includes('@lid')) return null
  const { data } = await supabase
    .from('whatsapp_lid_map' as any)
    .select('jid_canon')
    .eq('instancia_id', instanciaId)
    .eq('jid_lid', jidLid)
    .maybeSingle()
  const canon = (data as any)?.jid_canon as string | undefined
  if (!canon) return null
  return { jid: canon, numero: canon.split('@')[0].replace(/\D/g, '') }
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

    // ── MENSAGEM (recebida ou enviada do celular) ─────────────────────
    // fromMe=false → cliente mandou para nós (direcao='recebida')
    // fromMe=true  → operador mandou pelo celular (direcao='enviada')
    //               — replicamos no CRM pra histórico ficar completo nos dois lados.
    if (event === 'messages.upsert' && (data?.key?.fromMe === false || data?.key?.fromMe === true)) {
      const direcaoMsg: 'recebida' | 'enviada' = data?.key?.fromMe === true ? 'enviada' : 'recebida'
      let { jid: remotoJid, numero: remotoNumero } = extrairContato(data)
      const lidOriginal = data?.key?.remoteJid?.includes('@lid') ? data.key.remoteJid : ''
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
        evolution_url: instRow.evolution_url || process.env.EVOLUTION_API_URL || '',
        api_key:       instRow.api_key       || process.env.EVOLUTION_API_KEY || '',
      } : null

      if (inst) {
        // Mapping @lid → JID canônico. O WhatsApp moderno entrega muitos
        // eventos com remoteJid=@lid (privacy ID do Meta), sem expor o número
        // real. Sem isso, cada contato vira "duas conversas" e a config do
        // agente IA (gravada sob o JID canônico) some quando a resposta volta.
        //
        // 1) Aprende: se temos os DOIS (número real + @lid), grava o par.
        // 2) Resolve: se só temos @lid (sem senderPn no payload), consulta
        //    o que já aprendemos pra trocar pro JID canônico.
        if (lidOriginal && remotoNumero && remotoJid && !remotoJid.includes('@lid')) {
          await supabase.from('whatsapp_lid_map' as any).upsert({
            instancia_id: inst.id,
            jid_lid:      lidOriginal,
            jid_canon:    remotoJid,
            pushname:     (data.pushName && String(data.pushName).trim()) || null,
            updated_at:   new Date().toISOString(),
          }, { onConflict: 'instancia_id,jid_lid' })
        } else if (remotoJid && remotoJid.includes('@lid')) {
          const canon = await resolverLidNoCanon(inst.id, remotoJid)
          if (canon) {
            remotoJid    = canon.jid
            remotoNumero = canon.numero || remotoNumero
          }
        }

        // Dedup global por evolution_id: Evolution/WhatsApp às vezes
        // re-entrega o mesmo evento (retry, ack atrasado). Sem isso, a IA
        // responde 2x à mesma mensagem do cliente. Faz isso ANTES de baixar
        // mídia ou chamar a IA pra economizar tudo.
        if (data?.key?.id) {
          const { data: jaProcessada } = await supabase
            .from('whatsapp_mensagens')
            .select('id')
            .eq('instancia_id', inst.id)
            .eq('evolution_id', data.key.id)
            .limit(1)
          if (jaProcessada && jaProcessada.length) {
            return NextResponse.json({ ok: true, deduped: true })
          }
        }

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

        // Dedup: para mensagens enviadas pelo celular (fromMe=true) que ECOAM
        // mensagens que o CRM acabou de enviar (insert sem evolution_id), pula
        // se já existe registro 'enviada' com mesmo conteúdo nos últimos 60s.
        let pulaInsert = false
        if (direcaoMsg === 'enviada') {
          const { data: jaExiste } = await supabase
            .from('whatsapp_mensagens')
            .select('id, evolution_id')
            .eq('instancia_id', inst.id)
            .eq('remoto_jid', remotoJid)
            .eq('direcao', 'enviada')
            .eq('conteudo', conteudoFinal)
            .gt('created_at', new Date(Date.now() - 60_000).toISOString())
            .limit(1)
          if (jaExiste && jaExiste.length) {
            // Atualiza só pra carimbar evolution_id (e mídia se tiver)
            if (!jaExiste[0].evolution_id) {
              await supabase.from('whatsapp_mensagens')
                .update({ evolution_id: data.key.id, midia_url: midiaPath, midia_mimetype: meta.mimetype })
                .eq('id', jaExiste[0].id)
            }
            pulaInsert = true
          }
        }
        // remoto_nome só faz sentido em mensagens RECEBIDAS — em enviadas,
        // pushName seria o nome do operador, não do contato.
        const nomeContato = direcaoMsg === 'recebida' ? pushName : null
        if (!pulaInsert) await supabase.from('whatsapp_mensagens').insert({
          instancia_id:   inst.id,
          cliente_id:     clienteId,
          remoto_jid:     remotoJid,
          remoto_numero:  remotoNumero || null,
          remoto_nome:    nomeContato,
          conteudo:       conteudoFinal,
          tipo:           meta.tipo,
          direcao:        direcaoMsg,
          lida:           direcaoMsg === 'enviada' ? true : false,
          evolution_id:   data.key.id,
          midia_url:      midiaPath,
          midia_mimetype: meta.mimetype,
          midia_nome:     meta.nomeArquivo,
          midia_duracao:  meta.duracao,
          transcricao:    transcricao,
        })

        // SDR e auto-resposta IA só fazem sentido para mensagens RECEBIDAS.
        // Mensagens enviadas pelo celular (direcao='enviada') foram replicadas
        // só pra fins de histórico — não acionam fluxos.
        if (direcaoMsg === 'recebida') {
        // Detecção SDR: se essa conversa pertence a um fluxo SDR ativo
        // (qualquer tentativa em qualquer fluxo configurado), o cliente
        // respondeu — encerra o fluxo automático e move o card pra
        // etapa_interacao do fluxo (configurada por flow).
        try {
          const tentativasSdr = ['tentativa_1','tentativa_2','tentativa_3','tentativa_4','tentativa_5','tentativa_6','tentativa_7','tentativa_8','tentativa_9','tentativa_10']
          const { data: stateSdr } = await supabase
            .from('negocios_suhai_state')
            .select('negocio_id, etapa_sdr, fluxo_id')
            .eq('instancia_id', inst.id)
            .eq('remoto_jid', remotoJid)
            .is('finalizado_em', null)
            .in('etapa_sdr', tentativasSdr)
            .maybeSingle()
          if (stateSdr?.negocio_id) {
            // Etapa de "interação" depende do fluxo. Se não houver
            // fluxo_id (state legado de #185), default pra 'INTERAÇÃO'.
            let etapaInteracao = 'INTERAÇÃO'
            if (stateSdr.fluxo_id) {
              const { data: f } = await supabase.from('sdr_fluxos')
                .select('etapa_interacao').eq('id', stateSdr.fluxo_id).maybeSingle()
              if (f?.etapa_interacao) etapaInteracao = f.etapa_interacao
            }
            await supabase.from('negocios_suhai_state').update({
              etapa_sdr: 'interagiu',
              finalizado_em: new Date().toISOString(),
              motivo: 'Cliente respondeu — encerrado pelo webhook',
            }).eq('negocio_id', stateSdr.negocio_id)
            await supabase.from('negocios')
              .update({ etapa: etapaInteracao })
              .eq('id', stateSdr.negocio_id)
          }
        } catch (e) {
          console.error('[SDR webhook] falha ao processar resposta:', e)
        }

        // Auto-resposta com agente IA. Se for áudio, usa transcrição como
        // entrada; se for outra mídia sem caption, ignora.
        // A configuração da CONVERSA (whatsapp_conversa_agentes) sobrepõe a
        // da instância: se houver linha pra esse remoto_jid, manda nela;
        // senão, cai no agente padrão da instância.
        const entradaIA = transcricao || conteudoTexto
        const { data: convCfg } = await supabase
          .from('whatsapp_conversa_agentes')
          .select('agente_id, agente_ativo')
          .eq('instancia_id', inst.id)
          .eq('remoto_jid', remotoJid)
          .maybeSingle()
        const agenteAtivo = convCfg ? convCfg.agente_ativo : inst.agente_ativo
        const agenteId    = convCfg?.agente_id ?? inst.agente_id
        if (agenteAtivo && agenteId && remotoJid && entradaIA) {
          try {
            const { data: agente } = await supabase.from('ai_agentes').select('*').eq('id', agenteId).maybeSingle()
            if (agente?.ativo) {
              const { data: hist } = await supabase.from('whatsapp_mensagens')
                .select('conteudo, transcricao, direcao').eq('instancia_id', inst.id).eq('remoto_jid', remotoJid)
                .order('created_at', { ascending: false }).limit(10)
              const historico = (hist || []).reverse().slice(0, -1).map(m => ({
                role: m.direcao === 'enviada' ? 'assistant' as const : 'user' as const,
                content: m.transcricao || m.conteudo || '',
              }))
              // Usa o primeiro nome do contato (capitalizado) como {{nome}}
              // no system_prompt — agente espera ver o nome do cliente
              // em exemplos como "Oi, {{nome}}!".
              const minusculas = new Set(['de','da','do','das','dos','e','di','du','del','la'])
              const tituloCase = (s: string) => s.toLowerCase().split(/(\s+)/).map((w,i)=>{
                if (/^\s+$/.test(w)) return w
                if (i>0 && minusculas.has(w)) return w
                return w.charAt(0).toUpperCase()+w.slice(1)
              }).join('')
              const primeiroNome = pushName ? tituloCase(String(pushName).trim().split(/\s+/)[0] || '') : 'amigo(a)'
              const systemRaw = (agente.base_conhecimento
                ? `${agente.system_prompt}\n\n=== BASE DE CONHECIMENTO ===\n${agente.base_conhecimento}`
                : agente.system_prompt) +
`\n\n=== INTERVENÇÃO HUMANA ===\nSe o cliente pedir explicitamente para falar com um humano/atendente, se a pergunta exigir uma decisão fora do seu escopo, se houver reclamação séria, ou se você não conseguir ajudar com segurança, responda APENAS com o token exato: [INTERVENCAO_HUMANA]\nNada mais. Sem explicações, sem despedida, sem texto adicional. Esse token NÃO será enviado ao cliente — apenas alerta o time interno.`
              const systemPrompt = systemRaw.replace(/\{\{\s*nome\s*\}\}/g, primeiroNome)
              const resposta = await chamarChatGPT({
                modelo: agente.modelo,
                systemPrompt,
                mensagem: entradaIA,
                historico,
                maxTokens: agente.max_tokens || 1024,
                temperatura: Number(agente.temperatura) || 0.7,
              })
              if (resposta) {
                const pedeIntervencao = /\[INTERVENCAO_HUMANA\]/i.test(resposta)
                if (pedeIntervencao) {
                  // Não envia mensagem ao cliente. Registra aviso interno e pausa o agente.
                  await supabase.from('whatsapp_mensagens').insert({
                    instancia_id: inst.id, cliente_id: clienteId,
                    remoto_jid: remotoJid, remoto_numero: remotoNumero || null,
                    remoto_nome: pushName, conteudo: '🚨 SOLICITADO INTERVENÇÃO HUMANA',
                    tipo: 'sistema', direcao: 'enviada', lida: false,
                  })
                  await supabase.from('whatsapp_conversa_agentes').upsert({
                    instancia_id: inst.id,
                    remoto_jid: remotoJid,
                    agente_id: agenteId,
                    agente_ativo: false,
                    intervencao_solicitada: true,
                    intervencao_solicitada_em: new Date().toISOString(),
                  }, { onConflict: 'instancia_id,remoto_jid' })
                } else {
                  await enviarRespostaEvo(inst.evolution_url, inst.api_key, inst.nome, remotoJid, resposta)
                  await supabase.from('whatsapp_mensagens').insert({
                    instancia_id: inst.id, cliente_id: clienteId,
                    remoto_jid: remotoJid, remoto_numero: remotoNumero || null,
                    remoto_nome: pushName, conteudo: resposta, tipo: 'text',
                    direcao: 'enviada', lida: true,
                  })
                }
              }
            }
          } catch (e) {
            console.error('[WhatsApp] auto-resposta IA falhou:', e)
          }
        }
        } // if (direcaoMsg === 'recebida')
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
