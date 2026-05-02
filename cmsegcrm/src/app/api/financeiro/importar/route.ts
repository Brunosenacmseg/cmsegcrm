// Endpoint de importação do módulo Financeiro/DRE.
// Recebe linhas de despesas e/ou faturamento já parseadas no client.
//
// Body: {
//   despesas?: [{ codigo, descricao, tipo_despesa, forma_pagto, condicao,
//                 data_vencimento, data_pgto, valor_previsto, valor, competencia, obs }],
//   faturamento?: [{ seguradora_codigo, bruto, ir_retido, outros_descontos,
//                    competencia, data_recebimento }],
//   tag?: string  // identifica o lote (pra reimport idempotente)
// }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checarAcesso(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  if (!userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const userId = userData.user.id
  const { data: u } = await supabaseAdmin.from('users').select('role').eq('id', userId).single()
  if (u?.role === 'admin') return { ok: true as const, userId }
  const { data: a } = await supabaseAdmin.from('financeiro_acessos').select('user_id').eq('user_id', userId).maybeSingle()
  if (a) return { ok: true as const, userId }
  return { ok: false as const, erro: 'Sem acesso ao financeiro' }
}

const s = (v: any) => v == null || v === '' ? null : String(v).trim()
const n = (v: any) => {
  if (v == null || v === '') return null
  let str = String(v).trim().replace(/[R$\s]/g, '')
  if (!str || str === '-') return null
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.')
  const x = Number(str)
  return isFinite(x) ? x : null
}

export async function POST(req: NextRequest) {
  const auth = await checarAcesso(req)
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const tag = s(body.tag) || `import_${Date.now()}`
  const despesas: any[] = Array.isArray(body.despesas) ? body.despesas : []
  const faturamento: any[] = Array.isArray(body.faturamento) ? body.faturamento : []

  const stats = {
    despesas_inseridas: 0, despesas_skipped: 0,
    categorias_criadas: 0, faturamento_inserido: 0,
    erros: [] as string[],
  }

  // Garante coluna origem_import e valor_previsto (idempotente)
  await supabaseAdmin.rpc('exec_sql', { sql: `
    alter table public.financeiro_despesas add column if not exists valor_previsto numeric(12,2);
    alter table public.financeiro_despesas add column if not exists origem_import text;
  ` }).catch(() => {})

  // Cria categorias que faltam
  const codigosUnicos = [...new Set(despesas.map(d => s(d.codigo)).filter(Boolean))] as string[]
  if (codigosUnicos.length) {
    const { data: existentes } = await supabaseAdmin
      .from('financeiro_categorias').select('codigo').in('codigo', codigosUnicos)
    const existentesSet = new Set((existentes ?? []).map(c => c.codigo))
    const novas = despesas
      .filter(d => d.codigo && !existentesSet.has(s(d.codigo)!))
      .reduce((acc: any[], d) => {
        const codigo = s(d.codigo)!
        if (acc.find(x => x.codigo === codigo)) return acc
        const nome = String(d.descricao || codigo).replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
        acc.push({ codigo, nome, tipo: 'despesa' })
        return acc
      }, [])
    if (novas.length) {
      const { error } = await supabaseAdmin.from('financeiro_categorias').insert(novas)
      if (error) stats.erros.push(`Categorias: ${error.message}`)
      else stats.categorias_criadas = novas.length
    }
  }

  // Mapa codigo -> id
  const { data: cats } = await supabaseAdmin.from('financeiro_categorias').select('id, codigo')
  const codeToId = new Map((cats ?? []).map(c => [c.codigo, c.id]))

  // Apaga lote anterior com mesma tag
  await supabaseAdmin.from('financeiro_despesas').delete().eq('origem_import', tag)
  await supabaseAdmin.from('comissoes_recebidas').delete().eq('origem', 'importacao').eq('obs', tag)

  // Insere despesas
  if (despesas.length) {
    const rows = despesas.map(d => {
      const valor = n(d.valor)
      if (!valor || valor <= 0) { stats.despesas_skipped++; return null }
      const venc = s(d.data_vencimento)
      const pgto = s(d.data_pgto)
      return {
        categoria_id: codeToId.get(s(d.codigo) || '') || null,
        descricao: s(d.descricao) || '(sem descrição)',
        valor,
        valor_previsto: n(d.valor_previsto),
        data: pgto || venc,
        data_vencimento: venc,
        data_pgto: pgto,
        competencia: s(d.competencia),
        tipo_despesa: s(d.tipo_despesa)?.toUpperCase() === 'FIXA' ? 'FIXA' : 'VARIÁVEL',
        forma_pagto: s(d.forma_pagto),
        condicao: s(d.condicao),
        obs: s(d.obs),
        registrado_por: auth.userId,
        origem_import: tag,
      }
    }).filter(Boolean) as any[]

    // Insere em lotes de 100
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)
      const { error } = await supabaseAdmin.from('financeiro_despesas').insert(batch)
      if (error) stats.erros.push(`Despesas batch ${i}: ${error.message}`)
      else stats.despesas_inseridas += batch.length
    }
  }

  // Insere faturamento
  if (faturamento.length) {
    const { data: segs } = await supabaseAdmin.from('financeiro_seguradoras').select('codigo, nome')
    const segMap = new Map((segs ?? []).map(s => [s.codigo, s.nome]))
    const rows = faturamento.map(f => {
      const valor = n(f.bruto)
      if (!valor || valor <= 0) return null
      const codigo = s(f.seguradora_codigo)
      return {
        valor,
        ir_retido: n(f.ir_retido) || 0,
        outros_descontos: n(f.outros_descontos) || 0,
        competencia: s(f.competencia),
        data_recebimento: s(f.data_recebimento),
        seguradora: codigo ? segMap.get(codigo) || codigo : null,
        seguradora_codigo: codigo,
        status: 'recebido',
        origem: 'importacao',
        obs: tag,
        registrado_por: auth.userId,
      }
    }).filter(Boolean) as any[]
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)
      const { error } = await supabaseAdmin.from('comissoes_recebidas').insert(batch)
      if (error) stats.erros.push(`Faturamento batch ${i}: ${error.message}`)
      else stats.faturamento_inserido += batch.length
    }
  }

  return NextResponse.json({ ok: stats.erros.length === 0, tag, ...stats })
}
