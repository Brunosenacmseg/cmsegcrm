// Endpoint que sincroniza vendedor_id de negociacoes existentes a partir de
// uma planilha do RD. Casa por titulo (+ cpf_cnpj quando disponivel) e
// resolve o responsavel via tabela user_aliases_rd + users.nome/email.
//
// Body: { linhas: [{ titulo, cpf_cnpj?, responsavel }], dry_run?: boolean }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  if (!userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin.from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const }
}

const norm = (v: any) => (v == null ? '' : String(v).trim())
// Normaliza pra match: lower + colapsa whitespace + remove acentos
// Pega casos como "Lilian  Cruz" (espaço duplo), "lilian cruz", "Lílian Cruz" etc.
const lower = (v: any) =>
  norm(v).toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const linhas: any[] = Array.isArray(body?.linhas) ? body.linhas : []
  const dryRun = !!body?.dry_run
  if (!linhas.length) return NextResponse.json({ error: 'sem linhas' }, { status: 400 })

  // Pre-load usuarios + aliases
  const [{ data: usuarios }, { data: aliases }] = await Promise.all([
    supabaseAdmin.from('users').select('id, nome, email'),
    supabaseAdmin.from('user_aliases_rd').select('user_id, alias'),
  ])
  const userPorNome:  Record<string, string> = {}
  const userPorEmail: Record<string, string> = {}
  const userPorAlias: Record<string, string> = {}
  for (const u of usuarios || []) {
    if (u.nome)  userPorNome[lower(u.nome)]  = u.id
    if (u.email) userPorEmail[lower(u.email)] = u.id
  }
  for (const a of aliases || []) if (a.alias) userPorAlias[lower(a.alias)] = a.user_id

  // Resolve responsavel -> user_id
  const aliasNaoEncontrados = new Set<string>()
  function resolverVendedor(respRaw: string): string | null {
    const k = lower(respRaw)
    if (!k) return null
    const id = userPorAlias[k] || userPorNome[k] || userPorEmail[k] || null
    if (!id) aliasNaoEncontrados.add(respRaw)
    return id
  }

  // Pre-monta busca: titulo -> [cpf,resp][]
  const titulos = Array.from(new Set(linhas.map(r => norm(r.titulo)).filter(Boolean)))
  const negociosPorTitulo: Record<string, any[]> = {}
  // Busca em chunks de 200 pra nao explodir url
  for (let i = 0; i < titulos.length; i += 200) {
    const chunk = titulos.slice(i, i + 200)
    const { data } = await supabaseAdmin
      .from('negocios')
      .select('id, titulo, cpf_cnpj, vendedor_id')
      .in('titulo', chunk)
    for (const n of data || []) {
      const k = norm(n.titulo)
      if (!negociosPorTitulo[k]) negociosPorTitulo[k] = []
      negociosPorTitulo[k].push(n)
    }
  }

  const updates: { id: string, vendedor_id: string }[] = []
  const stats = {
    total: linhas.length,
    sem_titulo: 0,
    sem_responsavel: 0,
    sem_match_negocio: 0,
    multiplos_match: 0,
    ja_correto: 0,
    a_atualizar: 0,
    aliases_faltando: [] as string[],
  }

  for (const r of linhas) {
    const titulo = norm(r.titulo)
    const cpf    = norm(r.cpf_cnpj || r.cpf)
    const resp   = norm(r.responsavel || r['responsável'])

    if (!titulo) { stats.sem_titulo++; continue }
    if (!resp)   { stats.sem_responsavel++; continue }

    const vendId = resolverVendedor(resp)
    if (!vendId) continue // ja contado em aliasNaoEncontrados

    const candidatos = negociosPorTitulo[titulo] || []
    if (candidatos.length === 0) { stats.sem_match_negocio++; continue }

    let alvo = candidatos[0]
    if (candidatos.length > 1) {
      // Desempata por cpf_cnpj quando disponivel
      const comCpf = cpf ? candidatos.filter(n => n.cpf_cnpj === cpf) : []
      if (comCpf.length === 1) alvo = comCpf[0]
      else { stats.multiplos_match += candidatos.length; continue }
    }

    if (alvo.vendedor_id === vendId) { stats.ja_correto++; continue }
    stats.a_atualizar++
    updates.push({ id: alvo.id, vendedor_id: vendId })
  }

  stats.aliases_faltando = Array.from(aliasNaoEncontrados).slice(0, 100)

  if (dryRun) {
    return NextResponse.json({ stats, dry_run: true })
  }

  // Aplica em chunks de 500
  let aplicados = 0
  let erros = 0
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500)
    // Faz updates 1 a 1 — Supabase nao tem bulk update por id em uma chamada
    await Promise.all(chunk.map(async u => {
      const { error } = await supabaseAdmin
        .from('negocios')
        .update({ vendedor_id: u.vendedor_id })
        .eq('id', u.id)
      if (error) erros++
      else aplicados++
    }))
  }

  return NextResponse.json({ stats, aplicados, erros })
}
