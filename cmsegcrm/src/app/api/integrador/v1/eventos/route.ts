// Endpoint utilitário: lista eventos disponíveis para webhooks de saída.
import { NextResponse } from 'next/server'
import { EVENTOS_DISPONIVEIS } from '@/lib/integrador'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ ok: true, eventos: EVENTOS_DISPONIVEIS })
}
