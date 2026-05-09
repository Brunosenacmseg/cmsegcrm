import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

let _sa: ReturnType<typeof createClient<Database>> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function exigirAutenticado(req: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; status: number; msg: string }> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, msg: 'não autenticado' }
  const { data, error } = await supabaseAdmin().auth.getUser(token)
  if (error || !data?.user) return { ok: false, status: 401, msg: 'sessão inválida' }
  return { ok: true, userId: data.user.id }
}

type EvoResp = { ok: boolean; status: number; data: any }

async function evoFetch(url: string, apiKey: string, path: string, method = 'GET', body?: any): Promise<EvoResp> {
  const cleanUrl = String(url || '').replace(/\/$/, '')
  const res = await fetch(`${cleanUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: any = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { _raw: text } }
  return { ok: res.ok, status: res.status, data }
}

function instanciaInexistente(r: EvoResp): boolean {
  if (r.status === 404) return true
  const msg = JSON.stringify(r.data || '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('instance not found')
}

function instanciaJaExiste(r: EvoResp): boolean {
  const msg = JSON.stringify(r.data || '').toLowerCase()
  return msg.includes('already in use') || msg.includes('already exists')
}

function extrairBase64(data: any): string | null {
  if (!data) return null
  const cand = data?.base64
            || data?.qrcode?.base64
            || data?.qr?.base64
            || data?.instance?.qrcode?.base64
            || (typeof data?.code === 'string' && data.code.startsWith('data:image') ? data.code : null)
  return cand || null
}

function mensagemErro(r: EvoResp): string {
  const d = r.data || {}
  const m = d?.response?.message || d?.message || d?.error || d?._raw
  if (Array.isArray(m)) return m.join(' | ')
  if (typeof m === 'string') return m
  return `Evolution API retornou status ${r.status}`
}

export async function POST(request: NextRequest) {
  try {
    const guard = await exigirAutenticado(request)
    if (!guard.ok) return NextResponse.json({ error: guard.msg }, { status: guard.status })

    const body = await request.json()
    const { action, instance, ...params } = body
    const evo_url = process.env.EVOLUTION_API_URL || body.evo_url
    const api_key = process.env.EVOLUTION_API_KEY || body.api_key
    if (!evo_url || !api_key) {
      return NextResponse.json({ error: 'Evolution API não configurada' }, { status: 500 })
    }

    switch (action) {

      case 'criar_instancia': {
        let r = await evoFetch(evo_url, api_key, '/instance/create', 'POST', {
          instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS',
        })
        // Se já existe no servidor Evolution, busca o QR via /instance/connect
        if (!r.ok && instanciaJaExiste(r)) {
          r = await evoFetch(evo_url, api_key, `/instance/connect/${instance}`)
        }
        const base64 = extrairBase64(r.data)
        if (!base64 && !r.ok) {
          return NextResponse.json({ error: mensagemErro(r), raw: r.data }, { status: 502 })
        }
        return NextResponse.json({ ...r.data, base64 })
      }

      case 'qrcode': {
        let r = await evoFetch(evo_url, api_key, `/instance/connect/${instance}`)
        // Auto-recupera: se a instância sumiu no servidor Evolution, recria e tenta de novo
        if (instanciaInexistente(r)) {
          const criar = await evoFetch(evo_url, api_key, '/instance/create', 'POST', {
            instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS',
          })
          const base64Criar = extrairBase64(criar.data)
          if (base64Criar) return NextResponse.json({ base64: base64Criar, raw: criar.data })
          await new Promise(res => setTimeout(res, 500))
          r = await evoFetch(evo_url, api_key, `/instance/connect/${instance}`)
        }
        const base64 = extrairBase64(r.data)
        if (!base64 && !r.ok) {
          return NextResponse.json({ error: mensagemErro(r), raw: r.data }, { status: 502 })
        }
        return NextResponse.json({ base64, raw: r.data })
      }

      case 'status': {
        const r = await evoFetch(evo_url, api_key, `/instance/connectionState/${instance}`)
        return NextResponse.json(r.data)
      }

      case 'enviar': {
        const { numero, mensagem } = params
        const r = await evoFetch(evo_url, api_key, `/message/sendText/${instance}`, 'POST', {
          number: numero,
          text: mensagem,
        })
        if (!r.ok) return NextResponse.json({ error: mensagemErro(r), raw: r.data }, { status: 502 })
        return NextResponse.json(r.data)
      }

      case 'enviar_midia': {
        const { numero, base64, mimetype, nome_arquivo, caption } = params
        const r = await evoFetch(evo_url, api_key, `/message/sendMedia/${instance}`, 'POST', {
          number: numero,
          mediatype: mimetype?.startsWith('image') ? 'image'
                    : mimetype?.startsWith('video') ? 'video'
                    : 'document',
          media: base64,
          mimetype,
          fileName: nome_arquivo,
          caption: caption || '',
        })
        if (!r.ok) return NextResponse.json({ error: mensagemErro(r), raw: r.data }, { status: 502 })
        return NextResponse.json(r.data)
      }

      case 'enviar_audio': {
        const { numero, base64 } = params
        const r = await evoFetch(evo_url, api_key, `/message/sendWhatsAppAudio/${instance}`, 'POST', {
          number: numero,
          audio: base64,
          encoding: true,
        })
        if (!r.ok) return NextResponse.json({ error: mensagemErro(r), raw: r.data }, { status: 502 })
        return NextResponse.json(r.data)
      }

      case 'enviar_sticker': {
        const { numero, base64 } = params
        const r = await evoFetch(evo_url, api_key, `/message/sendSticker/${instance}`, 'POST', {
          number: numero,
          sticker: base64,
        })
        if (!r.ok) return NextResponse.json({ error: mensagemErro(r), raw: r.data }, { status: 502 })
        return NextResponse.json(r.data)
      }

      case 'desconectar': {
        const r = await evoFetch(evo_url, api_key, `/instance/logout/${instance}`, 'DELETE')
        return NextResponse.json(r.data)
      }

      case 'deletar': {
        const r = await evoFetch(evo_url, api_key, `/instance/delete/${instance}`, 'DELETE')
        return NextResponse.json(r.data)
      }

      default:
        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
    }
  } catch (err: any) {
    console.error('Action error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
