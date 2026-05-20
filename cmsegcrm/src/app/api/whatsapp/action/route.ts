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

// Evolution v2 espera só dígitos no campo `number` (com DDI/DDD).
// Remove @s.whatsapp.net, @g.us, espaços, parênteses, hífens. Se for número
// brasileiro de celular sem DDI, prepende 55. Mantém grupo (16+ dígitos)
// como está.
function normalizarNumero(raw: string): string {
  if (!raw) return ''
  let n = String(raw).split('@')[0].replace(/\D/g, '')
  if (n.length >= 10 && n.length <= 11 && !n.startsWith('55')) n = '55' + n
  return n
}

// Quando o JID é @lid (WhatsApp Local ID), os dígitos antes do `@` NÃO são
// um número real — só funcionam se mapearmos para o telefone verdadeiro.
// Usa o `remoto_numero` que já foi resolvido em mensagens passadas (rotina
// /api/whatsapp/resolver-lid) ou tenta extrair de outras mensagens da mesma
// conversa.
async function resolverNumeroParaEnvio(jidRaw: string, instanceName: string | null): Promise<string> {
  const jid = String(jidRaw || '').trim()
  if (!jid) return ''
  if (jid.endsWith('@g.us')) return jid
  if (!jid.includes('@lid')) return normalizarNumero(jid)
  // @lid: tenta achar remoto_numero já resolvido na mesma instância
  let instanciaId: string | null = null
  if (instanceName) {
    const { data: inst } = await supabaseAdmin()
      .from('whatsapp_instancias').select('id').eq('nome', instanceName).maybeSingle()
    instanciaId = inst?.id || null
  }
  if (instanciaId) {
    const { data } = await supabaseAdmin()
      .from('whatsapp_mensagens').select('remoto_numero')
      .eq('remoto_jid', jid).eq('instancia_id', instanciaId)
      .not('remoto_numero', 'is', null).limit(1).maybeSingle()
    if (data?.remoto_numero) return normalizarNumero(data.remoto_numero)
  }
  const { data: any2 } = await supabaseAdmin()
    .from('whatsapp_mensagens').select('remoto_numero')
    .eq('remoto_jid', jid).not('remoto_numero', 'is', null)
    .limit(1).maybeSingle()
  if (any2?.remoto_numero) return normalizarNumero(any2.remoto_numero)
  return ''
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
        let numClean = await resolverNumeroParaEnvio(numero, instance)
        // Última tentativa: Evolution v2 também aceita o jid completo
        if (!numClean && numero) numClean = String(numero)
        if (!numClean) return NextResponse.json({ error: 'Número de destino inválido' }, { status: 400 })
        // Envia em ambos formatos: `text` (Evolution v2) e
        // `textMessage.text` (Evolution v1) — servidores aceitam um e
        // ignoram o outro. Evita 400 "instance requires property textMessage".
        const r = await evoFetch(evo_url, api_key, `/message/sendText/${instance}`, 'POST', {
          number: numClean,
          text: mensagem,
          textMessage: { text: mensagem },
        })
        if (!r.ok) {
          console.error('[wpp:enviar] falha', { instance, numero, numClean, status: r.status, data: r.data })
          return NextResponse.json({ error: mensagemErro(r), numero_enviado: numClean, raw: r.data }, { status: 502 })
        }
        return NextResponse.json(r.data)
      }

      case 'enviar_midia': {
        const { numero, base64, mimetype, nome_arquivo, caption } = params
        const numClean = await resolverNumeroParaEnvio(numero, instance)
        if (!numClean) return NextResponse.json({ error: 'Não foi possível resolver o número de destino (contato @lid).' }, { status: 400 })
        const r = await evoFetch(evo_url, api_key, `/message/sendMedia/${instance}`, 'POST', {
          number: numClean,
          mediatype: mimetype?.startsWith('image') ? 'image'
                    : mimetype?.startsWith('video') ? 'video'
                    : 'document',
          media: base64,
          mimetype,
          fileName: nome_arquivo,
          caption: caption || '',
        })
        if (!r.ok) {
          console.error('[wpp:enviar_midia] falha', { instance, numero, numClean, status: r.status })
          return NextResponse.json({ error: mensagemErro(r), numero_enviado: numClean, raw: r.data }, { status: 502 })
        }
        return NextResponse.json(r.data)
      }

      case 'enviar_audio': {
        const { numero, base64 } = params
        const numClean = await resolverNumeroParaEnvio(numero, instance)
        if (!numClean) return NextResponse.json({ error: 'Não foi possível resolver o número de destino (contato @lid).' }, { status: 400 })
        const r = await evoFetch(evo_url, api_key, `/message/sendWhatsAppAudio/${instance}`, 'POST', {
          number: numClean,
          audio: base64,
          encoding: true,
        })
        if (!r.ok) {
          console.error('[wpp:enviar_audio] falha', { instance, numero, numClean, status: r.status })
          return NextResponse.json({ error: mensagemErro(r), numero_enviado: numClean, raw: r.data }, { status: 502 })
        }
        return NextResponse.json(r.data)
      }

      case 'enviar_sticker': {
        const { numero, base64 } = params
        const numClean = await resolverNumeroParaEnvio(numero, instance)
        if (!numClean) return NextResponse.json({ error: 'Não foi possível resolver o número de destino (contato @lid).' }, { status: 400 })
        const r = await evoFetch(evo_url, api_key, `/message/sendSticker/${instance}`, 'POST', {
          number: numClean,
          sticker: base64,
        })
        if (!r.ok) {
          console.error('[wpp:enviar_sticker] falha', { instance, numero, numClean, status: r.status })
          return NextResponse.json({ error: mensagemErro(r), numero_enviado: numClean, raw: r.data }, { status: 502 })
        }
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
