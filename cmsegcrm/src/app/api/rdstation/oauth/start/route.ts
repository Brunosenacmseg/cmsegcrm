import { NextRequest, NextResponse } from 'next/server'
import { authorizeUrl } from '@/lib/rdstation-oauth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // O fluxo OAuth precisa funcionar via GET (redirect do navegador).
  // A autenticação do admin é validada no callback ao salvar os tokens.
  const redirectUri = `${request.nextUrl.origin}/api/rdstation/oauth/callback`
  try {
    const url = authorizeUrl(redirectUri)
    return NextResponse.redirect(url)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 400 })
  }
}
