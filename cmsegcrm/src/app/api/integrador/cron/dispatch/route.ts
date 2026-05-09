// Processa a fila integracoes_eventos_pendentes e dispara webhooks de saída.
//
// Pode ser chamado:
//   - manualmente pela página /dashboard/integracoes/integrador
//   - por cron externo (Vercel Cron, GitHub Actions, etc) com header
//     Authorization: Bearer <CRON_SECRET> (opcional — só obrigatório se a env existir)

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin, dispararWebhooksSaida, EventoIntegrador } from '@/lib/integrador'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_TENTATIVAS = 5
const LOTE = 50

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.INTEGRADOR_CRON_SECRET
  if (!cronSecret) {
    console.error('[integrador/cron] INTEGRADOR_CRON_SECRET não configurado — recusando.')
    return NextResponse.json({ ok: false, erro: 'cron secret não configurado' }, { status: 503 })
  }
  const auth = req.headers.get('authorization') || ''
  const provided = auth.replace(/^Bearer\s+/i, '').trim()
  if (!timingSafeEqualStr(provided, cronSecret)) {
    return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  }
  const sa = supabaseAdmin()
  const { data: pend, error } = await sa
    .from('integracoes_eventos_pendentes')
    .select('id, evento, payload, tentativas')
    .is('processado_em', null)
    .lt('tentativas', MAX_TENTATIVAS)
    .order('criado_em', { ascending: true })
    .limit(LOTE)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  if (!pend?.length) return NextResponse.json({ ok: true, processados: 0 })

  let processados = 0
  for (const ev of pend) {
    try {
      await dispararWebhooksSaida(ev.evento as EventoIntegrador, ev.payload)
      await sa.from('integracoes_eventos_pendentes')
        .update({ processado_em: new Date().toISOString(), tentativas: (ev.tentativas as number) + 1 })
        .eq('id', ev.id)
      processados++
    } catch {
      await sa.from('integracoes_eventos_pendentes')
        .update({ tentativas: (ev.tentativas as number) + 1 })
        .eq('id', ev.id)
    }
  }
  return NextResponse.json({ ok: true, processados })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
