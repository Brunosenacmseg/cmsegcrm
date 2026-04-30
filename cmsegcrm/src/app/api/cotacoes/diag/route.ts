// Diagnóstico: mostra a URL do robô configurada na Vercel e tenta um GET /health
// pra confirmar conectividade. Sem segredos sensíveis no output.

import { NextResponse } from 'next/server'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const url1 = process.env.COTACAO_CONSULTA_URL || ''
  const url2 = process.env.COTACAO_ROBO_URL || ''
  const tokenSet = !!process.env.COTACAO_ROBO_TOKEN
  const ROBO_URL = url1 || url2

  if (!ROBO_URL) {
    return NextResponse.json({
      ok: false,
      erro: 'Nenhuma env COTACAO_CONSULTA_URL ou COTACAO_ROBO_URL configurada na Vercel',
      cotacao_consulta_url: url1 || '(vazio)',
      cotacao_robo_url:     url2 || '(vazio)',
    })
  }

  const target = `${ROBO_URL.replace(/\/$/, '')}/health`
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(8000) })
    const body = await res.text().catch(() => '')
    return NextResponse.json({
      ok: res.ok,
      url_usada: ROBO_URL,
      cotacao_consulta_url: url1 || '(vazio)',
      cotacao_robo_url:     url2 || '(vazio)',
      token_configurado:    tokenSet,
      ping_status: res.status,
      ping_body: body.slice(0, 300),
    })
  } catch (err: any) {
    const code = err?.cause?.code || err?.code
    return NextResponse.json({
      ok: false,
      url_usada: ROBO_URL,
      cotacao_consulta_url: url1 || '(vazio)',
      cotacao_robo_url:     url2 || '(vazio)',
      token_configurado:    tokenSet,
      erro: err?.message || 'erro',
      code,
    })
  }
}
