// Exportação HDI — gera o arquivo Cnnnnnnnnn.txt conforme o
// layout de Arquivos de Emissão a partir das apólices selecionadas.
//
// GET  /api/integracoes/hdi/export?ids=<uuid>,<uuid>&susep=000123456
// POST /api/integracoes/hdi/export   { ids: string[], susep?: string }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { montarArquivoHDI, nomeArquivoHDI } from '@/lib/hdi-export'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checarAuth(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  if (!userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin
    .from('users').select('role').eq('id', userData.user.id).single()
  if (!u || (u.role !== 'admin' && u.role !== 'lider')) {
    return { ok: false as const, erro: 'Apenas admin/líder' }
  }
  return { ok: true as const }
}

async function carregarApolices(ids: string[]) {
  const { data: apolices } = await supabaseAdmin
    .from('apolices')
    .select('*, clientes(*)')
    .in('id', ids)
  if (!apolices?.length) return []

  const apoliceIds = apolices.map((a: any) => a.id)

  const [
    { data: itens },
    { data: acessorios },
    { data: coberturas },
    { data: motoristas },
    { data: locais },
    { data: clausulas },
  ] = await Promise.all([
    supabaseAdmin.from('apolice_itens_auto').select('*').in('apolice_id', apoliceIds),
    supabaseAdmin.from('apolice_acessorios').select('*').in('apolice_id', apoliceIds),
    supabaseAdmin.from('apolice_coberturas').select('*').in('apolice_id', apoliceIds),
    supabaseAdmin.from('apolice_motoristas').select('*').in('apolice_id', apoliceIds),
    supabaseAdmin.from('apolice_locais').select('*').in('apolice_id', apoliceIds),
    supabaseAdmin.from('apolice_clausulas').select('*').in('apolice_id', apoliceIds),
  ])

  return apolices.map((a: any) => ({
    apolice: a,
    cliente: a.clientes,
    itens:      (itens      || []).filter((x: any) => x.apolice_id === a.id),
    acessorios: (acessorios || []).filter((x: any) => x.apolice_id === a.id),
    coberturas: (coberturas || []).filter((x: any) => x.apolice_id === a.id),
    motoristas: (motoristas || []).filter((x: any) => x.apolice_id === a.id),
    locais:     (locais     || []).filter((x: any) => x.apolice_id === a.id),
    clausulas:  (clausulas  || []).filter((x: any) => x.apolice_id === a.id),
  }))
}

async function handle(ids: string[], susepParam?: string | null) {
  if (!ids.length) {
    return NextResponse.json({ erro: 'Informe pelo menos uma apólice (ids).' }, { status: 400 })
  }
  const dados = await carregarApolices(ids)
  if (!dados.length) {
    return NextResponse.json({ erro: 'Nenhuma apólice encontrada para os ids informados.' }, { status: 404 })
  }
  const susep = susepParam || dados[0].apolice.susep_corretor || ''
  const conteudo = montarArquivoHDI(dados)
  const filename = nomeArquivoHDI(susep)
  return new NextResponse(conteudo, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(req: NextRequest) {
  const auth = await checarAuth(req)
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: 401 })
  const url = new URL(req.url)
  const ids = (url.searchParams.get('ids') || '').split(',').map((x: string) => x.trim()).filter(Boolean)
  const susep = url.searchParams.get('susep')
  return handle(ids, susep)
}

export async function POST(req: NextRequest) {
  const auth = await checarAuth(req)
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.ids) ? body.ids : []
  return handle(ids, body.susep)
}
