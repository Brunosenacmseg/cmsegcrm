import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { criarDocumento, statusAgregado } from '@/lib/autentique'

export const maxDuration = 60

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
async function autenticar(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data } = await supabaseAdmin().auth.getUser(token)
  return data?.user || null
}

interface Signatario { email: string; name?: string }

// POST { anexo_id, signatarios, mensagem?, negocio_id?, cliente_id?, apolice_id? }
// Pega o anexo do Storage, manda pra Autentique, salva como assinatura
// vinculada à negociação.
export async function POST(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { anexo_id, signatarios, mensagem, negocio_id, cliente_id, apolice_id } = body
  if (!anexo_id) return NextResponse.json({ error: 'anexo_id obrigatório' }, { status: 400 })
  if (!Array.isArray(signatarios) || !signatarios.length) {
    return NextResponse.json({ error: 'signatarios obrigatório (array)' }, { status: 400 })
  }

  // 1) Carrega o anexo
  const { data: anexo } = await supabaseAdmin().from('anexos').select('*').eq('id', anexo_id).maybeSingle()
  if (!anexo) return NextResponse.json({ error: 'anexo não encontrado' }, { status: 404 })
  if (!/\.pdf$/i.test(anexo.nome_arquivo) && !/pdf/i.test(anexo.tipo_mime || '')) {
    return NextResponse.json({ error: 'Apenas arquivos PDF podem ser enviados para assinatura' }, { status: 400 })
  }

  // 2) Baixa do Storage
  const { data: blob, error: errBaixar } = await supabaseAdmin().storage
    .from(anexo.bucket || 'cmsegcrm').download(anexo.path)
  if (errBaixar || !blob) return NextResponse.json({ error: 'Falha ao baixar PDF do storage: '+(errBaixar?.message||'') }, { status: 500 })

  const arrayBuf = await blob.arrayBuffer()
  const buffer = Buffer.from(arrayBuf)

  // 3) Envia pra Autentique
  try {
    const data = await criarDocumento({
      nome: anexo.nome_arquivo.replace(/\.pdf$/i, ''),
      signatarios: (signatarios as Signatario[]).map(s => ({ email: s.email, name: s.name })),
      arquivo: buffer,
      mensagem: mensagem || undefined,
    })
    const doc: any = (data as any).createDocument
    if (!doc?.id) throw new Error('resposta inválida da Autentique')

    const agg = statusAgregado(doc.signatures || [])
    const { data: assin, error: errInsert } = await supabaseAdmin().from('assinaturas').insert({
      autentique_id:     doc.id,
      nome_documento:    anexo.nome_arquivo,
      arquivo_nome:      anexo.nome_arquivo,
      arquivo_url:       null,
      status:            agg.status,
      url_assinatura:    doc.signatures?.[0]?.link?.short_link || null,
      total_signatarios: agg.total,
      total_assinados:   agg.assinados,
      negocio_id:        negocio_id || anexo.negocio_id || null,
      apolice_id:        apolice_id || null,
      cliente_id:        cliente_id || anexo.cliente_id || null,
      enviado_por:       user.id,
      payload_resposta:  doc,
    }).select('id').single()
    if (errInsert) throw new Error(errInsert.message)

    const linhas = (doc.signatures || []).map((s: any) => ({
      assinatura_id: assin.id,
      autentique_id: s.public_id,
      nome:          s.name || null,
      email:         s.email,
      funcao:        (s.action?.name || 'SIGN').toLowerCase(),
      link_assinatura: s.link?.short_link || null,
      status:        'pendente',
    }))
    if (linhas.length) await supabaseAdmin().from('assinaturas_signatarios').insert(linhas)

    return NextResponse.json({ ok: true, assinatura_id: assin.id, autentique_id: doc.id, signatures: doc.signatures })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 })
  }
}
