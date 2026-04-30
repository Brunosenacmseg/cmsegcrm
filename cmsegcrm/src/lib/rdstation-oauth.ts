// ═════════════════════════════════════════════════════════════
// OAuth 2.0 do RD Station CRM v2
// Docs: https://developers.rdstation.com/crm-v2-authentication
// Endpoint: https://api.rd.services/oauth2/
// Tokens: access_token expira em 2h; refresh_token rotaciona a cada uso.
// ═════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const OAUTH_BASE = 'https://api.rd.services/oauth2'

export interface RdOAuthTokens {
  access_token: string
  refresh_token: string
  expires_at: string // ISO
}

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export function authorizeUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.RDSTATION_OAUTH_CLIENT_ID
  if (!clientId) throw new Error('RDSTATION_OAUTH_CLIENT_ID não configurado')
  const qs = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
  })
  if (state) qs.set('state', state)
  // RD usa /auth/dialog para iniciar o fluxo
  return `https://api.rd.services/auth/dialog?${qs.toString()}`
}

export async function trocarCodePorTokens(code: string, redirectUri: string): Promise<RdOAuthTokens> {
  const clientId = process.env.RDSTATION_OAUTH_CLIENT_ID
  const clientSecret = process.env.RDSTATION_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Credenciais OAuth não configuradas')

  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(20000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    throw new Error(`Falha ao trocar code: HTTP ${res.status} — ${JSON.stringify(data).slice(0, 200)}`)
  }
  const expiresIn = Number(data.expires_in || 7200)
  const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString()
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expiresAt }
}

export async function renovarTokens(refreshToken: string): Promise<RdOAuthTokens> {
  const clientId = process.env.RDSTATION_OAUTH_CLIENT_ID
  const clientSecret = process.env.RDSTATION_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Credenciais OAuth não configuradas')

  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(20000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    throw new Error(`Falha ao renovar token: HTTP ${res.status} — ${JSON.stringify(data).slice(0, 200)}`)
  }
  const expiresIn = Number(data.expires_in || 7200)
  const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: expiresAt,
  }
}

export async function salvarTokens(tokens: RdOAuthTokens): Promise<void> {
  await admin().from('rdstation_oauth').upsert({
    id: 1,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
    updated_at: new Date().toISOString(),
  })
}

export async function lerTokens(): Promise<RdOAuthTokens | null> {
  const { data } = await admin().from('rdstation_oauth').select('access_token, refresh_token, expires_at').eq('id', 1).maybeSingle()
  if (!data?.access_token || !data?.refresh_token) return null
  return data as RdOAuthTokens
}

// Retorna access_token válido, renovando se faltar < 60s pra expirar
export async function getAccessTokenValido(): Promise<string> {
  const tokens = await lerTokens()
  if (!tokens) throw new Error('OAuth não conectado. Acesse /dashboard/rdstation e clique em "Conectar conta RD Station".')

  const expirou = !tokens.expires_at || new Date(tokens.expires_at).getTime() < Date.now() + 30000
  if (!expirou) return tokens.access_token

  const novos = await renovarTokens(tokens.refresh_token)
  await salvarTokens(novos)
  return novos.access_token
}

export async function statusOAuth(): Promise<{ conectado: boolean; expiraEm?: string; clientIdConfigurado: boolean }> {
  const clientIdConfigurado = !!process.env.RDSTATION_OAUTH_CLIENT_ID && !!process.env.RDSTATION_OAUTH_CLIENT_SECRET
  const tokens = await lerTokens()
  return {
    conectado: !!tokens?.access_token,
    expiraEm: tokens?.expires_at,
    clientIdConfigurado,
  }
}
