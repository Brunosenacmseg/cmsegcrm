// Purge controlado de negocios. Exige confirm=='RESETAR NEGOCIOS' e role=admin.
// Usado antes de uma re-sincronização limpa do RD Station.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

let _supabaseAdmin: SupabaseClient | null = null
function supabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: userData, error } = await supabaseAdmin().auth.getUser(token)
  if (error || !userData?.user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return NextResponse.json({ error: 'Apenas admin' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch {}
  if (body?.confirm !== 'RESETAR NEGOCIOS') {
    return NextResponse.json({ error: 'Confirmação inválida — envie { "confirm": "RESETAR NEGOCIOS" } no body' }, { status: 400 })
  }

  const resumo: Record<string, any> = {}

  // 1) Desvincula apolices (FK negocio_id sem ON DELETE — bloquearia a exclusão)
  try {
    const { error: e } = await supabaseAdmin().from('apolices').update({ negocio_id: null }).not('negocio_id', 'is', null)
    resumo['apolices.negocio_id=null'] = { erro: e?.message || null }
  } catch (e: any) { resumo['apolices.negocio_id=null'] = { erro: e?.message?.slice(0,200) } }

  // 2) Desvincula comissoes_recebidas (FK ON DELETE SET NULL já existe, mas ajudamos caso a 007 não tenha rodado)
  try {
    const { error: e } = await supabaseAdmin().from('comissoes_recebidas').update({ negocio_id: null }).not('negocio_id', 'is', null)
    resumo['comissoes_recebidas.negocio_id=null'] = { erro: e?.message || null }
  } catch (e: any) {
    resumo['comissoes_recebidas.negocio_id=null'] = { aviso: 'tabela inexistente (migration 007 não rodou)', erro: e?.message?.slice(0,200) }
  }

  // 3) Conta antes de apagar
  const { count: antes } = await supabaseAdmin().from('negocios').select('*', { count: 'exact', head: true })

  // 4) Apaga negocios — historico/tarefas/anexos cascadeiam automaticamente conforme FKs
  try {
    const { error: e } = await supabaseAdmin().from('negocios').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    resumo['negocios.delete'] = { erro: e?.message || null }
  } catch (e: any) { resumo['negocios.delete'] = { erro: e?.message?.slice(0,200) } }

  const { count: depois } = await supabaseAdmin().from('negocios').select('*', { count: 'exact', head: true })

  return NextResponse.json({
    ok: true,
    negocios_antes: antes ?? null,
    negocios_depois: depois ?? null,
    apagados: (antes || 0) - (depois || 0),
    resumo,
  })
}
