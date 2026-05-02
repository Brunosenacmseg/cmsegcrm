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

// POST multipart/form-data:
//   - file: PDF
//   - nome: string (nome do documento)
//   - signatarios: JSON [{email,name?,action?}]
//   - negocio_id, apolice_id, cliente_id (opcionais — vínculos)
//   - mensagem: string (opcional)
export async function POST(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Esperado multipart/form-data' }, { status: 400 }) }

  const file = form.get('file') as File | null
  const nome = (form.get('nome') as string)?.trim()
  const signersRaw = form.get('signatarios') as string
  const negocioId = (form.get('negocio_id') as string) || null
  const apoliceId = (form.get('apolice_id') as string) || null
  const clienteId = (form.get('cliente_id') as string) || null
  const mensagem  = (form.get('mensagem')  as string) || undefined

  if (!file)  return NextResponse.json({ error: 'arquivo obrigatório' }, { status: 400 })
  if (!nome)  return NextResponse.json({ error: 'nome obrigatório' }, { status: 400 })
  if (!signersRaw) return NextResponse.json({ error: 'signatarios obrigatório' }, { status: 400 })

  let signatarios: any[] = []
  try { signatarios = JSON.parse(signersRaw) } catch { return NextResponse.json({ error: 'signatarios JSON inválido' }, { status: 400 }) }
  if (!Array.isArray(signatarios) || !signatarios.length) return NextResponse.json({ error: 'precisa de pelo menos 1 signatário' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const data = await criarDocumento({ nome, signatarios, arquivo: buffer, mensagem })
    const doc: any = (data as any).createDocument
    if (!doc?.id) throw new Error('resposta inválida da Autentique')

    const agg = statusAgregado(doc.signatures || [])

    const { data: assin, error } = await supabaseAdmin().from('assinaturas').insert({
      autentique_id:     doc.id,
      nome_documento:    nome,
      arquivo_nome:      file.name,
      status:            agg.status,
      url_assinatura:    doc.signatures?.[0]?.link?.short_link || null,
      total_signatarios: agg.total,
      total_assinados:   agg.assinados,
      negocio_id:        negocioId,
      apolice_id:        apoliceId,
      cliente_id:        clienteId,
      enviado_por:       user.id,
      payload_resposta:  doc,
    }).select('id').single()
    if (error) throw new Error('Erro ao salvar: '+error.message)

    // Persistir signatários
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
