// Detecta e remove apolices duplicadas. Criterio de duplicidade:
// mesmo (nome_segurado normalizado, numero, seguradora normalizada).
// Mantem a mais ANTIGA (created_at) e remove as outras.
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

const norm = (v: any) => String(v ?? '').toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/\s+/g, ' ').trim()

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const dryRun = !!body?.dry_run

  // Carrega TODAS as apolices (paginado) com os campos necessarios
  const PAGE = 1000
  const apolices: any[] = []
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin()
      .from('apolices')
      .select('id, numero, nome_segurado, seguradora, created_at, cliente_id')
      .order('created_at', { ascending: true })
      .range(off, off + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || !data.length) break
    apolices.push(...data)
    if (data.length < PAGE) break
    if (off > 500_000) break
  }

  // Agrupa por chave composta. Mantem o primeiro (mais antigo).
  const grupos: Record<string, any[]> = {}
  for (const a of apolices) {
    const numero = String(a.numero ?? '').trim()
    const nome   = norm(a.nome_segurado)
    const seg    = norm(a.seguradora)
    if (!numero || !nome) continue // sem chave -> nao agrupa
    const k = `${nome}|||${numero}|||${seg}`
    if (!grupos[k]) grupos[k] = []
    grupos[k].push(a)
  }

  const idsParaRemover: string[] = []
  let gruposComDup = 0
  for (const k of Object.keys(grupos)) {
    const g = grupos[k]
    if (g.length < 2) continue
    gruposComDup++
    // Mantem o mais antigo (primeiro do array, ja ordenado por created_at asc)
    for (let i = 1; i < g.length; i++) idsParaRemover.push(g[i].id)
  }

  const stats = {
    total_apolices: apolices.length,
    grupos_com_duplicatas: gruposComDup,
    apolices_a_remover: idsParaRemover.length,
  }

  if (dryRun) return NextResponse.json({ stats, dry_run: true })

  // Remove em chunks de 500 (limite do .in)
  let removidas = 0, erros = 0
  for (let i = 0; i < idsParaRemover.length; i += 500) {
    const chunk = idsParaRemover.slice(i, i + 500)
    const { error } = await supabaseAdmin().from('apolices').delete().in('id', chunk)
    if (error) erros++
    else removidas += chunk.length
  }

  return NextResponse.json({ stats, removidas, erros })
}
