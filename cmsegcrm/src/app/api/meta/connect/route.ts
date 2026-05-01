// Configura a integração Meta Ads:
// - Guarda access_token, ad_account_id, page_id, app_id, app_secret, verify_token
// - Subscreve a Page no campo 'leadgen' pra começar a receber webhooks
// - Testa o token chamando /me?fields=id,name
//
// Admin only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GRAPH = 'https://graph.facebook.com/v19.0'

async function checarAdmin(req: NextRequest): Promise<{ ok: boolean; userId?: string; erro?: string }> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, erro: 'Não autenticado' }
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !userData?.user) return { ok: false, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin.from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return { ok: false, erro: 'Apenas admin' }
  return { ok: true, userId: userData.user.id }
}

export async function GET(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const { data } = await supabaseAdmin.from('meta_config').select('*').eq('id', 1).maybeSingle()
  // Não devolve secrets crus, só status
  return NextResponse.json({
    ok: true,
    conectado: !!data?.access_token,
    ad_account_id: data?.ad_account_id || null,
    page_id: data?.page_id || null,
    app_id: data?.app_id || null,
    pixel_id: data?.pixel_id || null,
    tem_conversions_token: !!data?.conversions_token,
    webhook_subscribed: !!data?.webhook_subscribed,
    expires_at: data?.expires_at || null,
    configurado_em: data?.configurado_em || null,
  })
}

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}

  const access_token      = (body.access_token      || '').trim()
  const ad_account_id     = (body.ad_account_id     || '').trim()
  const page_id           = (body.page_id           || '').trim()
  const app_id            = (body.app_id            || '').trim()
  const app_secret        = (body.app_secret        || '').trim()
  const verify_token      = (body.verify_token      || '').trim()
  const pixel_id          = (body.pixel_id          || '').trim()
  const conversions_token = (body.conversions_token || '').trim()

  if (!access_token) return NextResponse.json({ error: 'access_token é obrigatório' }, { status: 400 })

  // Testa o token
  let me: any = null
  try {
    const r = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(access_token)}`, {
      signal: AbortSignal.timeout(8000),
    })
    me = await r.json()
    if (!r.ok || me.error) return NextResponse.json({ error: 'Token inválido', detalhe: me.error?.message || 'falha' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: 'Falha ao verificar token: '+e.message }, { status: 400 })
  }

  // Salva config (upsert na linha id=1)
  const { error: errSave } = await supabaseAdmin.from('meta_config').upsert({
    id: 1,
    access_token,
    ad_account_id:     ad_account_id || null,
    page_id:           page_id || null,
    app_id:            app_id || null,
    app_secret:        app_secret || null,
    verify_token:      verify_token || null,
    pixel_id:          pixel_id || null,
    conversions_token: conversions_token || null,
    connected_by:      auth.userId,
    configurado_em:    new Date().toISOString(),
    updated_at:        new Date().toISOString(),
  })
  if (errSave) return NextResponse.json({ error: 'Erro ao salvar: ' + errSave.message }, { status: 500 })

  // Tenta subscrever a Page no leadgen (webhook)
  let webhook_subscribed = false
  let webhook_erro: string | null = null
  if (page_id) {
    try {
      // Precisa de page_access_token. Busca via /me/accounts.
      const ra = await fetch(`${GRAPH}/me/accounts?access_token=${encodeURIComponent(access_token)}`)
      const ja = await ra.json()
      const page = (ja?.data || []).find((p: any) => String(p.id) === String(page_id))
      const pageToken = page?.access_token
      if (pageToken) {
        const rs = await fetch(`${GRAPH}/${page_id}/subscribed_apps?subscribed_fields=leadgen&access_token=${encodeURIComponent(pageToken)}`, {
          method: 'POST',
        })
        const js = await rs.json()
        webhook_subscribed = !!js.success
        if (!webhook_subscribed) webhook_erro = js.error?.message || 'subscribe falhou'
      } else {
        webhook_erro = 'Page access token não encontrado em /me/accounts. Verifique se a page_id é válida e o usuário do token administra a Page.'
      }
    } catch (e: any) {
      webhook_erro = e.message
    }
    await supabaseAdmin.from('meta_config').update({ webhook_subscribed }).eq('id', 1)
  }

  return NextResponse.json({
    ok: true,
    me: { id: me.id, name: me.name },
    webhook_subscribed,
    webhook_erro,
  })
}

export async function DELETE(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })
  await supabaseAdmin.from('meta_config').delete().eq('id', 1)
  return NextResponse.json({ ok: true })
}
