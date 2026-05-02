// Inicia o fluxo OAuth do Facebook. Redireciona o admin para o diálogo
// de login do Meta com os escopos necessários para Lead Ads + páginas.
//
// Pré-requisito: app_id e app_secret salvos em meta_config (ou em env
// META_APP_ID / META_APP_SECRET). Configure também a Redirect URI no
// painel do app: https://SEU-DOMINIO/api/meta/oauth/callback

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

let _admin: SupabaseClient | null = null
function admin() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _admin
}
const SCOPES = [
  'public_profile',
  'email',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'leads_retrieval',
  'ads_read',
  'ads_management',
  'business_management',
].join(',')

export async function GET(req: NextRequest) {
  const { data: cfg } = await admin().from('meta_config').select('app_id').eq('id', 1).maybeSingle()
  const appId = cfg?.app_id || process.env.META_APP_ID
  if (!appId) {
    return NextResponse.json({ error: 'app_id não configurado em meta_config' }, { status: 400 })
  }

  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/meta/oauth/callback`
  const state = randomBytes(16).toString('hex')

  const url = new URL('https://www.facebook.com/v19.0/dialog/oauth')
  url.searchParams.set('client_id', String(appId))
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('response_type', 'code')

  const res = NextResponse.redirect(url.toString())
  res.cookies.set('meta_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' })
  return res
}
