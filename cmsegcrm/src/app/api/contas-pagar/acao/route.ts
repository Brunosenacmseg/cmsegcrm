import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 30

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function autenticar(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data } = await supabaseAdmin.auth.getUser(token)
  return data?.user || null
}

async function ehAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('users').select('role').eq('id', userId).single()
  return data?.role === 'admin'
}

// POST { conta_id, acao: 'aprovar'|'pagar'|'recusar', categoria_id?, forma_pagto?, data_pagamento?, obs? }
// Apenas admin pode aprovar/pagar/recusar.
// Quando "pagar", cria automaticamente uma despesa em financeiro_despesas
// pra alimentar o DRE.
export async function POST(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const isAdmin = await ehAdmin(user.id)
  if (!isAdmin) return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { conta_id, acao, categoria_id, forma_pagto, data_pagamento, obs } = body
  if (!conta_id || !acao) return NextResponse.json({ error: 'conta_id e acao obrigatórios' }, { status: 400 })

  const { data: conta } = await supabaseAdmin.from('contas_pagar').select('*').eq('id', conta_id).maybeSingle()
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  if (acao === 'aprovar') {
    if (conta.status !== 'pendente') return NextResponse.json({ error: 'Já não está pendente' }, { status: 400 })
    await supabaseAdmin.from('contas_pagar').update({
      status: 'aprovado', aprovado_por: user.id, obs_admin: obs || null,
    }).eq('id', conta_id)
    return NextResponse.json({ ok: true, status: 'aprovado' })
  }

  if (acao === 'recusar') {
    await supabaseAdmin.from('contas_pagar').update({
      status: 'recusado', recusado_por: user.id, obs_admin: obs || null,
    }).eq('id', conta_id)
    return NextResponse.json({ ok: true, status: 'recusado' })
  }

  if (acao === 'pagar') {
    if (conta.status === 'pago') return NextResponse.json({ error: 'Já paga' }, { status: 400 })
    const dataPgto = data_pagamento || new Date().toISOString().slice(0, 10)

    // Cria despesa para aparecer no DRE Real
    const { data: despesa, error: errDesp } = await supabaseAdmin.from('financeiro_despesas').insert({
      categoria_id:    categoria_id || conta.categoria_id || null,
      descricao:       conta.nome,
      valor:           conta.valor,
      data:            dataPgto,
      data_vencimento: conta.vencimento,
      data_pgto:       dataPgto,
      tipo_despesa:    'VARIÁVEL',
      forma_pagto:     forma_pagto || conta.forma_pagto || null,
      fornecedor:      conta.fornecedor || null,
      obs:             conta.descricao || null,
      registrado_por:  user.id,
      competencia:     dataPgto.slice(0, 7),
    }).select('id').single()
    if (errDesp) {
      // Se falhar criar despesa (ex: usuário sem acesso ao financeiro,
      // o que não deveria ser admin) ainda marcamos como paga.
      console.warn('[contas_pagar] falha ao criar despesa:', errDesp.message)
    }

    await supabaseAdmin.from('contas_pagar').update({
      status: 'pago', pago_por: user.id, data_pagamento: dataPgto,
      forma_pagto: forma_pagto || conta.forma_pagto || null,
      categoria_id: categoria_id || conta.categoria_id || null,
      despesa_id: despesa?.id || null,
      obs_admin: obs || conta.obs_admin || null,
    }).eq('id', conta_id)

    return NextResponse.json({ ok: true, status: 'pago', despesa_id: despesa?.id || null })
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
