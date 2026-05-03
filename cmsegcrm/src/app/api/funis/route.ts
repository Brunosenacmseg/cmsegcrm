// Endpoint server-side pra ações admin em funis (excluir, atualizar, criar)
// usando service_role — bypassa RLS quando o admin client-side às vezes
// falha silenciosamente por causa de políticas mal aplicadas.
//
// Verifica role=admin via JWT do header Authorization.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData } = await supabaseAdmin().auth.getUser(token)
  if (!userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const }
}

// PATCH /api/funis  body: { id, nome?, etapas?, emoji?, cor?, ordem?, descricao?, tipo? }
export async function PATCH(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const { id, ...patch } = body
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  // Whitelist de campos editáveis
  const permitidos = ['nome','etapas','emoji','cor','ordem','descricao','tipo']
  const dados: any = {}
  for (const k of permitidos) if (k in patch) dados[k] = patch[k]
  if (Object.keys(dados).length === 0) return NextResponse.json({ error: 'nada a atualizar' }, { status: 400 })

  const { data, error } = await supabaseAdmin().from('funis').update(dados).eq('id', id).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, funil: data?.[0] })
}

// DELETE /api/funis?id=<uuid>&cascade=1
// cascade=1 apaga negocios do funil primeiro (default).
// cascade=0 retorna erro se houver negocios.
export async function DELETE(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  const cascade = new URL(req.url).searchParams.get('cascade') !== '0'
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  // Conta cards
  const { count } = await supabaseAdmin().from('negocios').select('*', { count: 'exact', head: true }).eq('funil_id', id)

  if ((count || 0) > 0 && !cascade) {
    return NextResponse.json({ error: `Funil tem ${count} card(s). Use cascade=1 ou apague os cards primeiro.` }, { status: 409 })
  }

  // Cascade: apaga negocios primeiro (FK negocios.funil_id é RESTRICT)
  if ((count || 0) > 0) {
    const { error: e1 } = await supabaseAdmin().from('negocios').delete().eq('funil_id', id)
    if (e1) return NextResponse.json({ error: 'Erro ao apagar cards: ' + e1.message }, { status: 500 })
  }

  // Apaga vínculos com equipes (FK on delete cascade já cobriria, mas explicitar é seguro)
  await supabaseAdmin().from('funis_equipes').delete().eq('funil_id', id)

  // Apaga o funil
  const { data, error } = await supabaseAdmin().from('funis').delete().eq('id', id).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true, cards_apagados: count || 0 })
}
