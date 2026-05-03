// Endpoint que vincula apolices nao associadas a clientes, casando por
// cpf_cnpj_segurado (digits-only) ou por nome_segurado (normalizado).
// Body: { dry_run?: boolean }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
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
  if ((u as any)?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const }
}

const onlyDigits = (v: any) => String(v ?? '').replace(/\D/g, '')
const normNome = (v: any) => String(v ?? '').toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/\s+/g, ' ').trim()

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const dryRun = !!body?.dry_run

  // 1) Carrega TODAS as apolices sem cliente_id (paginado)
  const PAGE = 1000
  const apolices: any[] = []
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin()
      .from('apolices')
      .select('id, cpf_cnpj_segurado, nome_segurado')
      .is('cliente_id', null)
      .range(off, off + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || !data.length) break
    apolices.push(...data)
    if (data.length < PAGE) break
    if (off > 200_000) break
  }

  // 2) Carrega TODOS os clientes (id, nome, cpf_cnpj) — paginado
  const clientesPorCpf: Record<string, string> = {}
  const clientesPorNome: Record<string, string> = {}
  for (let off = 0; ; off += PAGE) {
    const { data } = await supabaseAdmin()
      .from('clientes')
      .select('id, nome, cpf_cnpj')
      .range(off, off + PAGE - 1)
    if (!data || !data.length) break
    for (const c of data as any[]) {
      if (c.cpf_cnpj) {
        clientesPorCpf[c.cpf_cnpj] = c.id
        const dig = onlyDigits(c.cpf_cnpj)
        if (dig) clientesPorCpf[dig] = c.id
      }
      if (c.nome) {
        const k = normNome(c.nome)
        if (k && !clientesPorNome[k]) clientesPorNome[k] = c.id
      }
    }
    if (data.length < PAGE) break
    if (off > 500_000) break
  }

  // 3) Resolve cada apolice
  const updates: { id: string, cliente_id: string }[] = []
  let porCpf = 0, porNome = 0, semMatch = 0
  for (const a of apolices) {
    const cpf = a.cpf_cnpj_segurado as string | null
    const nome = a.nome_segurado as string | null
    let cid: string | null = null
    if (cpf) {
      const dig = onlyDigits(cpf)
      cid = clientesPorCpf[cpf] || (dig ? clientesPorCpf[dig] : null) || null
      if (cid) porCpf++
    }
    if (!cid && nome) {
      cid = clientesPorNome[normNome(nome)] || null
      if (cid) porNome++
    }
    if (!cid) { semMatch++; continue }
    updates.push({ id: a.id, cliente_id: cid })
  }

  const stats = {
    total_apolices_sem_cliente: apolices.length,
    a_vincular: updates.length,
    casadas_por_cpf: porCpf,
    casadas_por_nome: porNome,
    sem_match: semMatch,
  }

  if (dryRun) return NextResponse.json({ stats, dry_run: true })

  // 4) Aplica em chunks (UPDATE row-a-row mesmo, é o que o Supabase suporta)
  let aplicados = 0, erros = 0
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500)
    await Promise.all(chunk.map(async u => {
      const { error } = await supabaseAdmin()
        .from('apolices')
        .update({ cliente_id: u.cliente_id })
        .eq('id', u.id)
      if (error) erros++
      else aplicados++
    }))
  }

  return NextResponse.json({ stats, aplicados, erros })
}
