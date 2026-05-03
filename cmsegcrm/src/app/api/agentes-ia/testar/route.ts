import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chamarChatGPT } from '@/lib/openai'

export const dynamic = 'force-dynamic'

export const maxDuration = 60

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: userData, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !userData?.user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const { data: u } = await supabaseAdmin.from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return NextResponse.json({ error: 'Apenas admin' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { agente_id, mensagem } = body
  if (!agente_id || !mensagem) return NextResponse.json({ error: 'agente_id e mensagem obrigatórios' }, { status: 400 })

  const { data: agente } = await supabaseAdmin.from('ai_agentes').select('*').eq('id', agente_id).maybeSingle()
  if (!agente) return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })

  try {
    const resposta = await chamarChatGPT({
      modelo: agente.modelo,
      systemPrompt: agente.base_conhecimento
        ? `${agente.system_prompt}\n\n=== BASE DE CONHECIMENTO ===\n${agente.base_conhecimento}`
        : agente.system_prompt,
      mensagem,
      maxTokens: agente.max_tokens || 1024,
      temperatura: Number(agente.temperatura) || 0.7,
    })
    return NextResponse.json({ resposta })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao chamar ChatGPT' }, { status: 500 })
  }
}
