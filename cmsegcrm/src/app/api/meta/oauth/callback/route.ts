// Callback OAuth do Meta:
//   1) Troca o code por short-lived token
//   2) Troca por long-lived token (~60 dias)
//   3) Lista as Pages do usuário e oferece a primeira (ou pré-existente)
//   4) Salva tudo em meta_config e tenta subscrever a Page no leadgen

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

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
const GRAPH = 'https://graph.facebook.com/v19.0'

function html(msg: string, ok = true) {
  return new NextResponse(
    `<!doctype html><meta charset=utf-8><title>Meta OAuth</title>
<style>body{font-family:system-ui;background:#0a1628;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.box{max-width:520px;padding:32px;background:#0e2040;border:1px solid #1f3358;border-radius:14px;text-align:center}h1{margin:0 0 12px;font-size:18px;color:${ok?'#1cb5a0':'#e05252'}}p{font-size:13px;color:#9aa7c2;line-height:1.5}a{color:#c9a84c;text-decoration:none}</style>
<div class=box><h1>${ok?'✅ Conectado ao Meta':'❌ Erro na conexão'}</h1><p>${msg}</p>
<p><a href="/dashboard/integracoes/meta/formularios">→ Voltar para Formulários</a></p></div>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const cookieState = req.cookies.get('meta_oauth_state')?.value
  const erro = searchParams.get('error_description') || searchParams.get('error')

  if (erro) return html('Meta retornou erro: ' + erro, false)
  if (!code) return html('Code ausente na resposta do Meta.', false)
  if (!state || !cookieState || state !== cookieState) {
    return html('State OAuth inválido (possível CSRF).', false)
  }

  const { data: cfg } = await admin().from('meta_config')
    .select('app_id, app_secret').eq('id', 1).maybeSingle()
  const appId = cfg?.app_id || process.env.META_APP_ID
  const appSecret = cfg?.app_secret || process.env.META_APP_SECRET
  if (!appId || !appSecret) return html('app_id/app_secret não configurados.', false)

  const redirectUri = `${req.nextUrl.origin}/api/meta/oauth/callback`

  // 1) Short-lived token
  let shortToken: string
  try {
    const u = new URL(`${GRAPH}/oauth/access_token`)
    u.searchParams.set('client_id', String(appId))
    u.searchParams.set('client_secret', String(appSecret))
    u.searchParams.set('redirect_uri', redirectUri)
    u.searchParams.set('code', code)
    const r = await fetch(u.toString())
    const j = await r.json()
    if (!r.ok || j.error) return html('Falha trocando code: ' + (j.error?.message || 'erro'), false)
    shortToken = j.access_token
  } catch (e: any) { return html('Erro: ' + e.message, false) }

  // 2) Long-lived token (~60 dias)
  let longToken = shortToken
  let expiresAt: string | null = null
  try {
    const u = new URL(`${GRAPH}/oauth/access_token`)
    u.searchParams.set('grant_type', 'fb_exchange_token')
    u.searchParams.set('client_id', String(appId))
    u.searchParams.set('client_secret', String(appSecret))
    u.searchParams.set('fb_exchange_token', shortToken)
    const r = await fetch(u.toString())
    const j = await r.json()
    if (j.access_token) {
      longToken = j.access_token
      if (j.expires_in) expiresAt = new Date(Date.now() + Number(j.expires_in) * 1000).toISOString()
    }
  } catch {}

  // 3) Pega primeira Page disponível (admin pode trocar manualmente depois)
  let pageId: string | null = null
  let pageNome: string | null = null
  try {
    const r = await fetch(`${GRAPH}/me/accounts?access_token=${encodeURIComponent(longToken)}`)
    const j = await r.json()
    const existente = (await admin().from('meta_config').select('page_id').eq('id', 1).maybeSingle()).data?.page_id
    const page = (j?.data || []).find((p: any) => existente && String(p.id) === String(existente)) || (j?.data || [])[0]
    if (page) { pageId = String(page.id); pageNome = page.name }
  } catch {}

  // 4) Salva
  await admin().from('meta_config').upsert({
    id: 1,
    access_token: longToken,
    page_id: pageId,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  })

  // 5) Subscreve Page no leadgen
  let webhookOk = false
  if (pageId) {
    try {
      const r = await fetch(`${GRAPH}/me/accounts?access_token=${encodeURIComponent(longToken)}`)
      const j = await r.json()
      const page = (j?.data || []).find((p: any) => String(p.id) === pageId)
      if (page?.access_token) {
        const rs = await fetch(`${GRAPH}/${pageId}/subscribed_apps?subscribed_fields=leadgen&access_token=${encodeURIComponent(page.access_token)}`, { method: 'POST' })
        const js = await rs.json()
        webhookOk = !!js.success
      }
    } catch {}
    await admin().from('meta_config').update({ webhook_subscribed: webhookOk }).eq('id', 1)
  }

  const res = html(
    `Conectado${pageNome ? ' à página <b>' + pageNome + '</b>' : ''}.${webhookOk ? ' Webhook leadgen ativo.' : ' (Webhook não foi assinado — verifique as permissões.)'}`,
    true
  )
  res.cookies.delete('meta_oauth_state')
  return res
}
