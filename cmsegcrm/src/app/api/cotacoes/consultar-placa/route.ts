// Endpoint de consulta de veículo por placa.
// Chama o robô em /consultar-placa que loga no aggilizador e captura
// modelo, ano, fipe, etc. auto-preenchidos quando a placa é digitada.

import { NextRequest, NextResponse } from 'next/server'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'
export const maxDuration = 90

const ROBO_URL   = process.env.COTACAO_CONSULTA_URL || process.env.COTACAO_ROBO_URL || ''
const ROBO_TOKEN = process.env.COTACAO_ROBO_TOKEN || ''

export async function POST(request: NextRequest) {
  try {
    const { placa } = await request.json()
    const placaLimpa = (placa || '').toUpperCase().replace(/\W/g, '')
    if (placaLimpa.length < 7) {
      return NextResponse.json({ ok: false, error: 'Placa inválida' }, { status: 400 })
    }

    if (!ROBO_URL) {
      return NextResponse.json({ ok: true, encontrado: false, motivo: 'Robô não configurado' })
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (ROBO_TOKEN) headers['x-robo-token'] = ROBO_TOKEN
      const res = await fetch(`${ROBO_URL.replace(/\/$/, '')}/consultar-placa`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ placa: placaLimpa }),
        signal: AbortSignal.timeout(75000),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        return NextResponse.json({ ok: false, error: `Robô retornou HTTP ${res.status}`, detalhe: txt.slice(0, 200) }, { status: 502 })
      }
      const json = await res.json().catch(() => null)
      if (!json) return NextResponse.json({ ok: false, error: 'Resposta do robô não é JSON' }, { status: 502 })
      return NextResponse.json(json)
    } catch (err: any) {
      const code = err?.cause?.code || err?.code
      const msg = err?.name === 'TimeoutError'
        ? `Tempo limite excedido (75s) chamando ${ROBO_URL}`
        : code === 'ECONNREFUSED'
          ? `Robô offline em ${ROBO_URL}`
          : code === 'ENOTFOUND'
            ? `DNS não resolveu para ${ROBO_URL}`
            : code === 'ETIMEDOUT'
              ? `Timeout TCP conectando em ${ROBO_URL}`
              : code
                ? `${err.message} (${code}) — URL: ${ROBO_URL}`
                : `${err?.message || 'erro desconhecido'} — URL: ${ROBO_URL}`
      return NextResponse.json({ ok: false, error: msg, code, url: ROBO_URL }, { status: 502 })
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Erro inesperado' }, { status: 500 })
  }
}
