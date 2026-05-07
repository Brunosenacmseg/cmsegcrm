// Endpoint de configuração do mapeamento RD → CMSEGCRM (negócios).
//
// GET  → retorna { mapeamento, rd_fields, local_fields }. Os custom_fields
//        do RD são puxados dinamicamente via /deal_custom_fields (cacheados
//        1h em rdstation_cache).
// POST → salva { mapeamento: [{ rd_path, local_col }, ...] } na linha
//        singleton (id=1).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listarTodos } from '@/lib/rdstation'
import { CAMPOS_RD_PADRAO, COLUNAS_LOCAIS_NEGOCIOS, RegraMapeamento } from '@/lib/rdstation-mapeamento'

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
  return { ok: true as const, userId: userData.user.id as string }
}

function getToken(request: NextRequest): string | null {
  return request.headers.get('x-rd-token') || process.env.RDSTATION_CRM_TOKEN || null
}

// Cache 1h dos custom_fields do RD pra não bater no rate limit toda vez
// que abrir a tela de mapeamento.
const CACHE_TTL_MS = 60 * 60 * 1000
async function lerCacheRD<T>(chave: string): Promise<T | null> {
  const { data } = await supabaseAdmin().from('rdstation_cache')
    .select('valor, atualizado_em').eq('chave', chave).maybeSingle()
  if (!data) return null
  const idade = Date.now() - new Date(data.atualizado_em as any).getTime()
  if (idade > CACHE_TTL_MS) return null
  return data.valor as T
}
async function gravarCacheRD(chave: string, valor: any) {
  await supabaseAdmin().from('rdstation_cache').upsert({
    chave, valor, atualizado_em: new Date().toISOString(),
  })
}

// Busca custom_fields tolerando: nome de path/key diferentes entre versões
// e ausência total (RD pode bloquear /deal_custom_fields em algumas contas).
async function listarCustomFieldsDeal(token: string): Promise<{ rd_path: string; label: string }[]> {
  const cached = await lerCacheRD<any[]>('deal_custom_fields')
  let lista: any[] = cached || []
  if (!lista.length) {
    for (const path of ['/deal_custom_fields', '/custom_fields']) {
      for (const key of ['deal_custom_fields', 'custom_fields']) {
        try { const r = await listarTodos<any>(path, token, key); if (r.length) { lista = r; break } } catch {}
      }
      if (lista.length) break
    }
    if (lista.length) await gravarCacheRD('deal_custom_fields', lista)
  }
  return lista
    .map((cf: any) => {
      const label = (cf?.label || cf?.name || '').toString().trim()
      if (!label) return null
      return { rd_path: `deal_custom_fields[${label}].value`, label: `🔧 ${label}` }
    })
    .filter(Boolean) as { rd_path: string; label: string }[]
}

export async function GET(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  const { data } = await supabaseAdmin()
    .from('rdstation_mapeamento_campos')
    .select('mapeamento, atualizado_em, atualizado_por')
    .eq('id', 1)
    .maybeSingle()

  let rdCustom: { rd_path: string; label: string }[] = []
  let rdCustomErro: string | null = null
  const token = getToken(req)
  if (token) {
    try { rdCustom = await listarCustomFieldsDeal(token) }
    catch (e: any) { rdCustomErro = e?.message || 'falha ao listar custom_fields do RD' }
  } else {
    rdCustomErro = 'RDSTATION_CRM_TOKEN não configurado — só campos padrão disponíveis'
  }

  return NextResponse.json({
    ok: true,
    mapeamento: (data?.mapeamento as RegraMapeamento[]) || [],
    atualizado_em: data?.atualizado_em || null,
    rd_fields: [...CAMPOS_RD_PADRAO, ...rdCustom],
    local_fields: COLUNAS_LOCAIS_NEGOCIOS,
    rd_custom_erro: rdCustomErro,
  })
}

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const regras: any[] = Array.isArray(body?.mapeamento) ? body.mapeamento : []
  const limpas: RegraMapeamento[] = regras
    .map((r: any) => ({
      rd_path: String(r?.rd_path || '').trim(),
      local_col: String(r?.local_col || '').trim(),
    }))
    .filter(r => r.rd_path && r.local_col)

  // Valida que local_col existe na lista de colunas conhecidas — evita
  // gravar mapeamento pra coluna inexistente que falharia no insert.
  const colsValidas = new Set(COLUNAS_LOCAIS_NEGOCIOS.map(c => c.col))
  const invalidas = limpas.filter(r => !colsValidas.has(r.local_col))
  if (invalidas.length) {
    return NextResponse.json({
      error: `Colunas locais inválidas: ${invalidas.map(r => r.local_col).join(', ')}`,
    }, { status: 400 })
  }

  const { error } = await supabaseAdmin()
    .from('rdstation_mapeamento_campos')
    .upsert({
      id: 1,
      entidade: 'negocios',
      mapeamento: limpas,
      atualizado_em: new Date().toISOString(),
      atualizado_por: auth.userId,
    })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, salvas: limpas.length })
}
