// Proxy assíncrono pro robô. Como o Vercel Hobby tem cap de 60s e a cotação
// completa demora 100-250s, esta rota:
//   1. Recebe { cotacao_id, produto, dados } do CRM (cotacao_id já foi
//      criado no Supabase com status='calculando' pelo cliente)
//   2. Chama o robô em /cotacao-async, que retorna 202 imediato e processa
//      em background
//   3. Quando o robô termina, ele escreve o resultado direto no Supabase
//   4. O CRM faz polling no Supabase até status mudar pra concluido/erro

import { NextRequest, NextResponse } from 'next/server'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'
export const maxDuration = 30  // só dispara o robô e volta — não espera

const ROBO_URL   = process.env.COTACAO_ROBO_URL || 'http://177.7.38.7:3001'
const ROBO_TOKEN = process.env.COTACAO_ROBO_TOKEN || ''

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body || !body.dados) {
      return NextResponse.json({ ok: false, error: 'Payload inválido (esperado { cotacao_id, produto, dados })' }, { status: 400 })
    }
    if (!body.cotacao_id) {
      return NextResponse.json({ ok: false, error: 'cotacao_id obrigatório (crie a cotação primeiro com status=calculando)' }, { status: 400 })
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (ROBO_TOKEN) headers['x-robo-token'] = ROBO_TOKEN

    const res = await fetch(`${ROBO_URL.replace(/\/$/, '')}/cotacao-async`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),  // robô só dá ack — deve ser rápido
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({
        ok: false,
        error: `Robô retornou HTTP ${res.status}`,
        detalhe: txt.slice(0, 300),
      }, { status: 502 })
    }

    const json = await res.json().catch(() => null)
    if (!json) return NextResponse.json({ ok: false, error: 'Resposta do robô não é JSON válido' }, { status: 502 })

    // Robô retornou 202 — o CRM agora vai fazer polling no Supabase
    return NextResponse.json(json)
  } catch (err: any) {
    const code = err?.cause?.code || err?.code
    const msg = err?.name === 'TimeoutError'
      ? 'Tempo limite excedido aguardando ack do robô (20s)'
      : code === 'ECONNREFUSED'
        ? `Robô offline (${ROBO_URL} recusou a conexão)`
        : code === 'ETIMEDOUT' || code === 'EHOSTUNREACH'
          ? `Robô inacessível (${ROBO_URL} não respondeu)`
          : err?.message || 'Erro inesperado ao chamar o robô'
    return NextResponse.json({ ok: false, error: msg, code }, { status: 502 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    robo_url: ROBO_URL.replace(/^(https?:\/\/[^@]+@)/, ''),
    token_configurado: !!ROBO_TOKEN,
    nota: 'Use POST com { cotacao_id, produto, dados }. Modo assíncrono: o robô responde 202 e processa em background, escrevendo o resultado no Supabase. O cliente deve fazer polling no Supabase.',
  })
}
