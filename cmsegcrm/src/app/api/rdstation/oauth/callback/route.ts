import { NextRequest, NextResponse } from 'next/server'
import { trocarCodePorTokens, salvarTokens } from '@/lib/rdstation-oauth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${request.nextUrl.origin}/dashboard/rdstation?oauth_erro=${encodeURIComponent(error)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${request.nextUrl.origin}/dashboard/rdstation?oauth_erro=sem_code`)
  }

  try {
    const redirectUri = `${request.nextUrl.origin}/api/rdstation/oauth/callback`
    const tokens = await trocarCodePorTokens(code, redirectUri)
    await salvarTokens(tokens)
    return NextResponse.redirect(`${request.nextUrl.origin}/dashboard/rdstation?oauth_ok=1`)
  } catch (e: any) {
    return NextResponse.redirect(`${request.nextUrl.origin}/dashboard/rdstation?oauth_erro=${encodeURIComponent(e?.message?.slice(0, 200) || 'erro')}`)
  }
}
