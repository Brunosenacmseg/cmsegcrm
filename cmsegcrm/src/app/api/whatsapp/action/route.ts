import { NextRequest, NextResponse } from 'next/server'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

async function evoFetch(url: string, apiKey: string, path: string, method = 'GET', body?: any) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, instance, ...params } = body
    const evo_url = body.evo_url || process.env.EVOLUTION_API_URL
    const api_key = body.api_key || process.env.EVOLUTION_API_KEY
    if (!evo_url || !api_key) {
      return NextResponse.json({ error: 'Evolution API não configurada' }, { status: 500 })
    }

    switch (action) {

      case 'criar_instancia': {
        const data = await evoFetch(evo_url, api_key, '/instance/create', 'POST', {
          instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS',
        })
        return NextResponse.json(data)
      }

      case 'qrcode': {
        const data = await evoFetch(evo_url, api_key, `/instance/connect/${instance}`)
        const base64 = data?.base64 || data?.qrcode?.base64 || data?.code || null
        return NextResponse.json({ base64, raw: data })
      }

      case 'status': {
        const data = await evoFetch(evo_url, api_key, `/instance/connectionState/${instance}`)
        return NextResponse.json(data)
      }

      case 'enviar': {
        const { numero, mensagem } = params
        const data = await evoFetch(evo_url, api_key, `/message/sendText/${instance}`, 'POST', {
          number: numero,
          textMessage: { text: mensagem },
        })
        return NextResponse.json(data)
      }

      case 'enviar_midia': {
        // Envia imagem, vídeo, documento via URL ou base64
        const { numero, base64, mimetype, nome_arquivo, caption } = params
        const data = await evoFetch(evo_url, api_key, `/message/sendMedia/${instance}`, 'POST', {
          number: numero,
          mediaMessage: {
            mediatype: mimetype?.startsWith('image') ? 'image'
                      : mimetype?.startsWith('video') ? 'video'
                      : 'document',
            media: base64,
            mimetype,
            fileName: nome_arquivo,
            caption: caption || '',
          },
        })
        return NextResponse.json(data)
      }

      case 'enviar_audio': {
        // Envia áudio como PTT (mensagem de voz)
        const { numero, base64 } = params
        const data = await evoFetch(evo_url, api_key, `/message/sendWhatsAppAudio/${instance}`, 'POST', {
          number: numero,
          audioMessage: {
            audio: base64,
            encoding: true,
          },
        })
        return NextResponse.json(data)
      }

      case 'enviar_sticker': {
        // Envia figurinha
        const { numero, base64 } = params
        const data = await evoFetch(evo_url, api_key, `/message/sendSticker/${instance}`, 'POST', {
          number: numero,
          stickerMessage: { sticker: base64 },
        })
        return NextResponse.json(data)
      }

      case 'desconectar': {
        const data = await evoFetch(evo_url, api_key, `/instance/logout/${instance}`, 'DELETE')
        return NextResponse.json(data)
      }

      case 'deletar': {
        const data = await evoFetch(evo_url, api_key, `/instance/delete/${instance}`, 'DELETE')
        return NextResponse.json(data)
      }

      default:
        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
    }
  } catch (err: any) {
    console.error('Action error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
