// Configura a integração Meta Ads:
// - Guarda access_token, ad_account_id, page_id, app_id, app_secret, verify_token
// - Subscreve a Page no campo 'leadgen' pra começar a receber webhooks
// - Testa o token chamando /me?fields=id,name
//
// Admin only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { GRAPH } from '@/lib/meta-graph'

export const dynamic = 'force-dynamic'

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
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

  const url = new URL(req.url)
  const revelar = url.searchParams.get('revelar') === '1'

  const { data } = await supabaseAdmin().from('meta_config').select('*').eq('id', 1).maybeSingle()
  const base = {
    ok: true,
    conectado: !!data?.access_token,
    ad_account_id: data?.ad_account_id || null,
    page_id: data?.page_id || null,
    app_id: data?.app_id || null,
    pixel_id: data?.pixel_id || null,
    dataset_id: data?.dataset_id || null,
    tem_access_token: !!data?.access_token,
    tem_app_secret: !!data?.app_secret,
    tem_verify_token: !!data?.verify_token,
    tem_conversions_token: !!data?.conversions_token,
    tem_page_access_token: !!data?.page_access_token,
    webhook_subscribed: !!data?.webhook_subscribed,
    expires_at: data?.expires_at || null,
    configurado_em: data?.configurado_em || null,
  }
  if (!revelar) return NextResponse.json(base)
  // Admin pediu pra revelar — devolve secrets em texto claro.
  return NextResponse.json({
    ...base,
    secrets: {
      access_token:       data?.access_token || null,
      page_access_token:  data?.page_access_token || null,
      app_secret:         data?.app_secret || null,
      verify_token:       data?.verify_token || null,
      conversions_token:  data?.conversions_token || null,
    },
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

// PATCH: ações utilitárias. Hoje suporta { acao: 'buscar_page_token' } que
// usa o access_token salvo pra chamar /me/accounts e descobrir o
// page_access_token correspondente ao page_id já configurado.
export async function PATCH(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  if (body.acao !== 'buscar_page_token') {
    return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  }

  const { data: cfg } = await supabaseAdmin().from('meta_config').select('access_token, page_id').eq('id', 1).maybeSingle()
  if (!cfg?.access_token) return NextResponse.json({ error: 'Access Token não está salvo. Salve primeiro o token do System User.' }, { status: 400 })
  if (!cfg?.page_id)      return NextResponse.json({ error: 'page_id não configurado.' }, { status: 400 })

  let resp: any
  try {
    const r = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token&limit=200&access_token=${encodeURIComponent(cfg.access_token as string)}`, {
      signal: AbortSignal.timeout(10000),
    })
    resp = await r.json()
    if (!r.ok || resp?.error) return NextResponse.json({ error: 'Meta: ' + (resp?.error?.message || 'erro') }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: 'Falha ao consultar /me/accounts: ' + e.message }, { status: 500 })
  }

  const lista: any[] = resp?.data || []
  if (lista.length === 0) {
    return NextResponse.json({
      error: 'Nenhuma Page encontrada. O usuário do Access Token não administra nenhuma Página. Adicione esse usuário como admin da Page em facebook.com/{sua-page}/settings → Acesso à Página, depois gere um novo Access Token.',
    }, { status: 400 })
  }

  const page = lista.find((p: any) => String(p.id) === String(cfg.page_id))
  if (!page) {
    const nomes = lista.map((p: any) => `${p.name} (${p.id})`).join(', ')
    return NextResponse.json({
      error: `page_id "${cfg.page_id}" não encontrado entre as Pages do usuário. Pages disponíveis: ${nomes}. Atualize o campo page_id ou troque o Access Token.`,
    }, { status: 400 })
  }
  if (!page.access_token) {
    return NextResponse.json({ error: `Page "${page.name}" não retornou access_token. Verifique se o token tem os escopos pages_show_list e pages_read_engagement.` }, { status: 400 })
  }

  // Tenta subscrever leadgen logo de uma vez.
  let webhook_subscribed = false
  let webhook_erro: string | null = null
  try {
    const rs = await fetch(`${GRAPH}/${cfg.page_id}/subscribed_apps?subscribed_fields=leadgen&access_token=${encodeURIComponent(page.access_token)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
    })
    const js = await rs.json()
    webhook_subscribed = !!js.success
    if (!webhook_subscribed) webhook_erro = js?.error?.message || 'subscribe falhou'
  } catch (e: any) {
    webhook_erro = e?.message || 'erro de rede ao subscrever Page'
  }

  const { error: errUp } = await supabaseAdmin().from('meta_config').update({
    page_access_token: page.access_token,
    webhook_subscribed,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)
  if (errUp) return NextResponse.json({ error: 'Erro ao salvar: ' + errUp.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    page: { id: page.id, name: page.name },
    webhook_subscribed,
    webhook_erro,
  })
}
