import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const maxDuration = 30

let _admin: SupabaseClient | null = null
function admin() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _admin
}
const BUCKET = 'cmsegcrm'

// GET /api/whatsapp/midia?path=whatsapp/...   → { url } (assinada por 1h)
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path obrigatório' }, { status: 400 })
  const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  if (error || !data) return NextResponse.json({ error: error?.message || 'erro' }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}

// POST /api/whatsapp/midia/transcrever  body: { mensagem_id }
// Transcreve (ou re-transcreve) o áudio de uma mensagem usando OpenAI Whisper.
export async function POST(request: NextRequest) {
  try {
    const { mensagem_id } = await request.json()
    if (!mensagem_id) return NextResponse.json({ error: 'mensagem_id obrigatório' }, { status: 400 })

    const { data: msg, error: e1 } = await admin()
      .from('whatsapp_mensagens')
      .select('id, tipo, midia_url, midia_mimetype')
      .eq('id', mensagem_id)
      .single()
    if (e1 || !msg) return NextResponse.json({ error: 'mensagem não encontrada' }, { status: 404 })
    if (msg.tipo !== 'audio' || !msg.midia_url) {
      return NextResponse.json({ error: 'mensagem não é áudio' }, { status: 400 })
    }

    const { data: file, error: e2 } = await admin().storage.from(BUCKET).download(msg.midia_url)
    if (e2 || !file) return NextResponse.json({ error: 'falha baixando áudio' }, { status: 500 })

    const key = process.env.OPENAI_API_KEY
    if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY não configurada' }, { status: 500 })

    const form = new FormData()
    form.append('file', file, 'audio.ogg')
    form.append('model', 'whisper-1')
    form.append('language', 'pt')
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` },
      body: form,
    })
    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({ error: `Whisper: ${txt}` }, { status: 500 })
    }
    const data = await res.json()
    const transcricao = (data?.text || '').trim() || null

    await admin().from('whatsapp_mensagens').update({ transcricao }).eq('id', mensagem_id)
    return NextResponse.json({ ok: true, transcricao })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
