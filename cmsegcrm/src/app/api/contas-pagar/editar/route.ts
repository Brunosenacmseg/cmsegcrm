import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function autenticar(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data } = await supabaseAdmin().auth.getUser(token)
  return data?.user || null
}

async function ehAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from('users').select('role').eq('id', userId).single()
  return (data as any)?.role === 'admin'
}

// PATCH /api/contas-pagar/editar
// body: { conta_id, nome?, valor?, categoria_id?, fornecedor?, descricao?, vencimento? }
//
// Permite edição mesmo quando status = 'pago'. Apenas admin.
// Se a conta já estiver paga e tiver despesa_id, propaga as mudanças
// relevantes (descricao=nome, valor, categoria_id, fornecedor) para
// `financeiro_despesas` para o DRE refletir a correção.
export async function PATCH(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await ehAdmin(user.id))) return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { conta_id, nome, valor, categoria_id, fornecedor, descricao, vencimento } = body
  if (!conta_id) return NextResponse.json({ error: 'conta_id obrigatório' }, { status: 400 })

  const sa = supabaseAdmin()
  const { data: conta, error: errConta } = await sa.from('contas_pagar').select('*').eq('id', conta_id).maybeSingle()
  if (errConta || !conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  const c = conta as any

  const updates: Record<string, any> = {}
  if (typeof nome === 'string' && nome.trim()) updates.nome = nome.trim()
  if (valor !== undefined && valor !== null && valor !== '') {
    const v = typeof valor === 'number'
      ? valor
      : parseFloat(String(valor).replace(/[R$\s.]/g, '').replace(',', '.'))
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
    updates.valor = v
  }
  if (categoria_id !== undefined) updates.categoria_id = categoria_id || null
  if (fornecedor !== undefined) updates.fornecedor = fornecedor || null
  if (descricao !== undefined) updates.descricao = descricao || null
  if (vencimento !== undefined && vencimento) updates.vencimento = vencimento

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada a atualizar' }, { status: 400 })
  }

  const { error: errUpd } = await sa.from('contas_pagar').update(updates).eq('id', conta_id)
  if (errUpd) return NextResponse.json({ error: errUpd.message }, { status: 500 })

  // Se já paga e existe despesa vinculada, propaga ao DRE
  if (c.status === 'pago' && c.despesa_id) {
    const desp: Record<string, any> = {}
    if (updates.nome !== undefined) desp.descricao = updates.nome
    if (updates.valor !== undefined) desp.valor = updates.valor
    if (updates.categoria_id !== undefined) desp.categoria_id = updates.categoria_id
    if (updates.fornecedor !== undefined) desp.fornecedor = updates.fornecedor
    if (updates.descricao !== undefined) desp.obs = updates.descricao
    if (updates.vencimento !== undefined) desp.data_vencimento = updates.vencimento
    if (Object.keys(desp).length > 0) {
      const { error: errDesp } = await sa.from('financeiro_despesas').update(desp).eq('id', c.despesa_id)
      if (errDesp) console.warn('[contas_pagar/editar] falha sync despesa:', errDesp.message)
    }
  }

  return NextResponse.json({ ok: true })
}
