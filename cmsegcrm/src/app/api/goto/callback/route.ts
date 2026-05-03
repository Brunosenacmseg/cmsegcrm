import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cmsegcrm.vercel.app'

  if (error) {
    console.error('[GoTo Callback] Erro OAuth:', error)
    return NextResponse.redirect(`${appUrl}/dashboard/telefone?erro=${error}`)
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/dashboard/telefone?erro=sem_codigo`)
  }

  try {
    const clientId     = process.env.GOTO_CLIENT_ID!
    const clientSecret = process.env.GOTO_CLIENT_SECRET!
    const redirectUri  = process.env.GOTO_REDIRECT_URI!

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const body = new URLSearchParams()
    body.append('grant_type', 'authorization_code')
    body.append('code', code)
    body.append('redirect_uri', redirectUri)

    console.log('[GoTo Callback] Trocando code por token...')

    const tokenRes = await fetch('https://authentication.logmeininc.com/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    })

    const tokenText = await tokenRes.text()
    console.log('[GoTo Callback] Token response status:', tokenRes.status)
    console.log('[GoTo Callback] Token response:', tokenText.slice(0, 200))

    let tokenData: any
    try { tokenData = JSON.parse(tokenText) } catch { tokenData = {} }

    if (!tokenData.access_token) {
      console.error('[GoTo Callback] Sem access_token:', tokenData)
      return NextResponse.redirect(`${appUrl}/dashboard/telefone?erro=token_invalido`)
    }

    // Buscar info do usuário
    let accountKey = ''
    try {
      const meRes = await fetch('https://api.goto.com/users/v1/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      })
      const meData = await meRes.json()
      accountKey = meData?.accountKey || meData?.account_key || meData?.organizerKey || ''
      console.log('[GoTo Callback] User data:', JSON.stringify(meData).slice(0, 200))
    } catch (e) {
      console.error('[GoTo Callback] Erro ao buscar user:', e)
    }

    // Salvar token
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000)

    if (state) {
      await supabaseAdmin().from('goto_tokens').upsert({
        user_id:       state,
        access_token:  tokenData.access_token,
        refresh_token: tokenData.refresh_token || '',
        expires_at:    expiresAt.toISOString(),
        account_key:   accountKey,
      })
    }

    return NextResponse.redirect(`${appUrl}/dashboard/telefone?conectado=1`)
  } catch (err: any) {
    console.error('[GoTo Callback] Erro:', err.message)
    return NextResponse.redirect(`${appUrl}/dashboard/telefone?erro=falha_interna`)
  }
}
