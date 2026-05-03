// Lista os formulários de Lead Ads da Page configurada e gerencia o
// mapeamento "formulário → funil/etapa/vendedor".
//
// GET   → busca forms na Graph API + devolve os mapeamentos salvos
// POST  → upsert de um mapeamento (form_id + funil_id + etapa + vendedor_id + ativo)
// DELETE?form_id=... → remove mapeamento

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// lazy-init: evita que o build do Next falhe quando env vars
// não estão disponíveis na fase 'Collecting page data'.
const admin = new Proxy({} as ReturnType<typeof createClient>, {
  get(_t, prop) {
    const g = globalThis as any
    if (!g['__sa_admin']) g['__sa_admin'] = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    return (g['__sa_admin'] as any)[prop]
  }
})

const GRAPH = 'https://graph.facebook.com/v19.0'

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData, error } = await admin.auth.getUser(token)
  if (error || !userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await admin.from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const, userId: userData.user.id }
}

async function getPageToken(accessToken: string, pageId: string): Promise<string | null> {
  try {
    const r = await fetch(`${GRAPH}/me/accounts?access_token=${encodeURIComponent(accessToken)}`)
    const j = await r.json()
    const page = (j?.data || []).find((p: any) => String(p.id) === String(pageId))
    return page?.access_token || null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const a = await checarAdmin(req)
  if (!a.ok) return NextResponse.json({ error: a.erro }, { status: 401 })

  const { data: cfg } = await admin.from('meta_config')
    .select('access_token, page_id').eq('id', 1).maybeSingle()
  if (!cfg?.access_token || !cfg?.page_id) {
    return NextResponse.json({ error: 'Configure access_token e page_id em /dashboard/integracoes/meta primeiro' }, { status: 400 })
  }

  const pageToken = await getPageToken(cfg.access_token, cfg.page_id) || cfg.access_token
  let forms: any[] = []
  try {
    // Inclui questions{key,label,type} para permitir mapeamento de campos no UI
    const r = await fetch(`${GRAPH}/${cfg.page_id}/leadgen_forms?fields=id,name,status,created_time,leads_count,questions{key,label,type}&limit=200&access_token=${encodeURIComponent(pageToken)}`)
    const j = await r.json()
    if (j.error) return NextResponse.json({ error: j.error.message }, { status: 400 })
    forms = j.data || []
  } catch (e: any) {
    return NextResponse.json({ error: 'Falha buscando forms: ' + e.message }, { status: 500 })
  }

  const { data: mapeamentos } = await admin.from('meta_form_mapeamento').select('*')
  const map = new Map<string, any>((mapeamentos || []).map(m => [m.form_id, m]))

  const out = forms.map(f => ({
    form_id: String(f.id),
    nome: f.name,
    status: f.status,
    leads_count: f.leads_count,
    criado_em: f.created_time,
    questions: Array.isArray(f.questions)
      ? f.questions.map((q: any) => ({ key: q.key, label: q.label, type: q.type }))
      : [],
    mapeamento: map.get(String(f.id)) || null,
  }))

  return NextResponse.json({ ok: true, page_id: cfg.page_id, forms: out })
}

export async function POST(req: NextRequest) {
  const a = await checarAdmin(req)
  if (!a.ok) return NextResponse.json({ error: a.erro }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { form_id, form_nome, page_id, funil_id, etapa, vendedor_id, ativo, criar_negocio, observacoes, campo_map } = body
  if (!form_id) return NextResponse.json({ error: 'form_id obrigatório' }, { status: 400 })

  const { error } = await admin.from('meta_form_mapeamento').upsert({
    form_id: String(form_id),
    form_nome:    form_nome || null,
    page_id:      page_id || null,
    funil_id:     funil_id || null,
    etapa:        etapa || null,
    vendedor_id:  vendedor_id || null,
    ativo:        ativo !== false,
    criar_negocio: criar_negocio !== false,
    observacoes:  observacoes || null,
    campo_map:    campo_map && typeof campo_map === 'object' ? campo_map : {},
    updated_at:   new Date().toISOString(),
  }, { onConflict: 'form_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const a = await checarAdmin(req)
  if (!a.ok) return NextResponse.json({ error: a.erro }, { status: 401 })
  const formId = req.nextUrl.searchParams.get('form_id')
  if (!formId) return NextResponse.json({ error: 'form_id obrigatório' }, { status: 400 })
  await admin.from('meta_form_mapeamento').delete().eq('form_id', formId)
  return NextResponse.json({ ok: true })
}
