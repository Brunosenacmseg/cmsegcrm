// Configura a integração Meta Ads:
// - Guarda access_token, ad_account_id, page_id, app_id, app_secret, verify_token
// - Subscreve a Page no campo 'leadgen' pra começar a receber webhooks
// - Testa o token chamando /me?fields=id,name
//
// Admin only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GRAPH } from '@/lib/meta-graph'

export const dynamic = 'force-dynamic'

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function checarAdmin(req: NextRequest): Promise<{ ok: boolean; userId?: string; erro?: string }> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, erro: 'Não autenticado' }
  const { data: userData, error } = await supabaseAdmin().auth.getUser(token)
  if (error || !userData?.user) return { ok: false, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return { ok: false, erro: 'Apenas admin' }
  return { ok: true, userId: userData.user.id }
}

export async function GET(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const { data } = await supabaseAdmin().from('meta_config').select('*').eq('id', 1).maybeSingle()
  // Não devolve secrets crus, só status
  return NextResponse.json({
    ok: true,
    conectado: !!data?.access_token,
    ad_account_id: data?.ad_account_id || null,
    page_id: data?.page_id || null,
    app_id: data?.app_id || null,
    pixel_id: data?.pixel_id || null,
    dataset_id: data?.dataset_id || null,
    tem_conversions_token: !!data?.conversions_token,
    tem_page_access_token: !!data?.page_access_token,
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

  const access_token       = (body.access_token       || '').trim()
  const ad_account_id      = (body.ad_account_id      || '').trim()
  const page_id            = (body.page_id            || '').trim()
  const page_access_token  = (body.page_access_token  || '').trim()
  const app_id             = (body.app_id             || '').trim()
  const app_secret         = (body.app_secret         || '').trim()
  const verify_token       = (body.verify_token       || '').trim()
  const pixel_id           = (body.pixel_id           || '').trim()
  const conversions_token  = (body.conversions_token  || '').trim()
  const dataset_id         = (body.dataset_id         || '').trim()

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

  // Tenta descobrir / validar o page_access_token. A ordem é:
  //   1) Se admin colou um page_access_token explícito, usa esse.
  //   2) Senão, tenta /me/accounts com o user/system token.
  //   3) Como último recurso, mantém o que já estava salvo (não apaga).
  // Esse token é OBRIGATÓRIO pra leadgen_forms e leads_retrieval — o user
  // token sozinho costuma retornar "API access blocked".
  const { data: existente } = await supabaseAdmin().from('meta_config')
    .select('page_access_token').eq('id', 1).maybeSingle()
  let pageAccessTokenFinal: string | null = page_access_token || (existente?.page_access_token as string) || null
  let webhook_erro: string | null = null
  if (page_id && !pageAccessTokenFinal) {
    try {
      const ra = await fetch(`${GRAPH}/me/accounts?access_token=${encodeURIComponent(access_token)}`, {
        signal: AbortSignal.timeout(8000),
      })
      const ja = await ra.json()
      if (ja?.error) {
        console.error('[meta-connect] /me/accounts error:', ja.error)
        webhook_erro = `Não consegui listar suas Pages (${ja.error.message}). Cole o Page Access Token manualmente.`
      } else {
        const page = (ja?.data || []).find((p: any) => String(p.id) === String(page_id))
        if (page?.access_token) {
          pageAccessTokenFinal = page.access_token
        } else {
          webhook_erro = 'Page access token não encontrado em /me/accounts. Cole-o manualmente no campo "Page Access Token" ou verifique se o usuário do token administra essa Page com leads_retrieval.'
        }
      }
    } catch (e: any) {
      console.error('[meta-connect] /me/accounts fetch failed:', e)
      webhook_erro = 'Falha ao consultar /me/accounts: ' + (e?.message || 'rede')
    }
  }

  // Salva config (upsert na linha id=1)
  const { error: errSave } = await supabaseAdmin().from('meta_config').upsert({
    id: 1,
    access_token,
    ad_account_id:     ad_account_id || null,
    page_id:           page_id || null,
    page_access_token: pageAccessTokenFinal,
    app_id:            app_id || null,
    app_secret:        app_secret || null,
    verify_token:      verify_token || null,
    pixel_id:          pixel_id || null,
    conversions_token: conversions_token || null,
    dataset_id:        dataset_id || null,
    connected_by:      auth.userId,
    configurado_em:    new Date().toISOString(),
    updated_at:        new Date().toISOString(),
  })
  if (errSave) return NextResponse.json({ error: 'Erro ao salvar: ' + errSave.message }, { status: 500 })

  // Subscreve a Page no leadgen (precisa do page_access_token)
  let webhook_subscribed = false
  if (page_id && pageAccessTokenFinal) {
    try {
      const rs = await fetch(`${GRAPH}/${page_id}/subscribed_apps?subscribed_fields=leadgen&access_token=${encodeURIComponent(pageAccessTokenFinal)}`, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
      })
      const js = await rs.json()
      webhook_subscribed = !!js.success
      if (!webhook_subscribed) {
        webhook_erro = js?.error?.message || 'subscribe falhou'
        console.error('[meta-connect] subscribed_apps failed:', js?.error)
      }
    } catch (e: any) {
      console.error('[meta-connect] subscribed_apps fetch failed:', e)
      webhook_erro = e?.message || 'erro de rede ao subscrever Page'
    }
    await supabaseAdmin().from('meta_config').update({ webhook_subscribed }).eq('id', 1)
  }

  return NextResponse.json({
    ok: true,
    me: { id: me.id, name: me.name },
    page_access_token_resolvido: !!pageAccessTokenFinal,
    webhook_subscribed,
    webhook_erro,
  })
}

export async function DELETE(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })
  await supabaseAdmin().from('meta_config').delete().eq('id', 1)
  return NextResponse.json({ ok: true })
}
