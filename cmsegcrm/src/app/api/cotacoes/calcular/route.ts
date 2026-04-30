// Proxy server-to-server para o robô de cálculo de cotação.
// Resolve dois problemas:
//   1. Mixed content: a página HTTPS não pode chamar um endpoint HTTP direto do
//      navegador, então o browser retorna "Failed to fetch". Aqui o request
//      sai do servidor da Vercel sem essa restrição.
//   2. Esconder a URL do robô do bundle do cliente — só fica nas envs do server.

import { NextRequest, NextResponse } from 'next/server'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'
export const maxDuration = 300  // robô leva 100-250s pra cotação completa

const ROBO_URL   = process.env.COTACAO_ROBO_URL || 'http://177.7.38.7:3001'
const ROBO_TOKEN = process.env.COTACAO_ROBO_TOKEN || ''

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body || !body.dados) {
      return NextResponse.json({ ok: false, error: 'Payload inválido (esperado { produto, dados })' }, { status: 400 })
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (ROBO_TOKEN) headers['x-robo-token'] = ROBO_TOKEN

    // O robô v2 expõe /cotacao; v1 expõe / (ambos aceitam o mesmo payload).
    const res = await fetch(`${ROBO_URL.replace(/\/$/, '')}/cotacao`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(280000),
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

    return NextResponse.json(json)
  } catch (err: any) {
    const msg = err?.name === 'TimeoutError'
      ? 'Tempo limite excedido (280s) - o robô não respondeu'
      : err?.cause?.code === 'ECONNREFUSED'
        ? `Robô offline (${ROBO_URL} recusou a conexão)`
        : err?.cause?.code === 'ETIMEDOUT' || err?.cause?.code === 'EHOSTUNREACH'
          ? `Robô inacessível (${ROBO_URL} não respondeu)`
          : err?.message || 'Erro inesperado ao chamar o robô'
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}

// GET para checagem rápida via browser
export async function GET() {
  return NextResponse.json({
    ok: true,
    robo_url: ROBO_URL.replace(/^(https?:\/\/[^@]+@)/, ''),
    token_configurado: !!ROBO_TOKEN,
    nota: 'Use POST para acionar o robô. Configure COTACAO_ROBO_URL no ambiente para mudar a URL.',
  })
}
