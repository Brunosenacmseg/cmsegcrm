// Importação de PDF de apólice.
//
// POST  multipart/form-data
//   file:        PDF da apólice (obrigatório)
//   apolice_id?: vincula o PDF a uma apólice já cadastrada
//   negocio_id?: usado quando ainda não existe apolice — cria uma
//                apolice em rascunho a partir do negócio
//   numero?:     pré-preenche o número da apólice no rascunho
//
// Retorna { apolice_id, anexo_id, path }. O PDF é gravado no
// storage do Supabase (bucket 'cmsegcrm') e linkado em public.anexos
// com categoria='apolice' e apolice_id, ficando assim sincronizado
// com o registro digitado.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  return { ok: true as const, userId: userData.user.id }
}

export async function POST(req: NextRequest) {
  const auth = await checarAuth(req)
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ erro: 'Arquivo (file) é obrigatório.' }, { status: 400 })
  if (file.type && !/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
    return NextResponse.json({ erro: 'O arquivo deve ser um PDF.' }, { status: 400 })
  }

  const apoliceIdInput = (form.get('apolice_id') as string) || ''
  const negocioId      = (form.get('negocio_id') as string) || ''
  const numero         = (form.get('numero') as string) || null

  // 1. Resolve a apólice de destino — usa a existente ou cria
  //    uma em rascunho a partir do negócio.
  let apoliceId = apoliceIdInput
  if (!apoliceId) {
    if (!negocioId) {
      return NextResponse.json({ erro: 'Informe apolice_id ou negocio_id.' }, { status: 400 })
    }
    const { data: neg } = await supabaseAdmin
      .from('negocios').select('id, cliente_id, vendedor_id, produto, seguradora, premio, comissao_pct, vencimento, placa')
      .eq('id', negocioId).single()
    if (!neg) return NextResponse.json({ erro: 'Negócio não encontrado.' }, { status: 404 })

    const { data: novaApol, error: errIns } = await supabaseAdmin
      .from('apolices')
      .insert({
        negocio_id:    neg.id,
        cliente_id:    neg.cliente_id,
        numero:        numero || null,
        produto:       neg.produto,
        seguradora:    neg.seguradora || 'HDI',
        premio:        neg.premio,
        comissao_pct:  neg.comissao_pct,
        vigencia_fim:  neg.vencimento,
        placa:         neg.placa,
        status:        'ativo',
      })
      .select('id, cliente_id').single()
    if (errIns || !novaApol) {
      return NextResponse.json({ erro: 'Erro ao criar apólice: '+errIns?.message }, { status: 500 })
    }
    apoliceId = novaApol.id
  }

  // 2. Confirma a apólice e pega cliente_id para link cruzado
  const { data: apo } = await supabaseAdmin
    .from('apolices').select('id, cliente_id, negocio_id').eq('id', apoliceId).single()
  if (!apo) return NextResponse.json({ erro: 'Apólice não encontrada.' }, { status: 404 })

  // 3. Sobe o PDF no storage
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `apolices/${apoliceId}/${Date.now()}_${safeName}`
  const buf = Buffer.from(await file.arrayBuffer())
  const { error: errUp } = await supabaseAdmin.storage
    .from('cmsegcrm')
    .upload(path, buf, { contentType: file.type || 'application/pdf', upsert: false })
  if (errUp) return NextResponse.json({ erro: 'Erro ao subir PDF: '+errUp.message }, { status: 500 })

  // 4. Cria registro em anexos, sincronizado com a apólice
  const { data: anexo, error: errAn } = await supabaseAdmin
    .from('anexos')
    .insert({
      bucket:       'cmsegcrm',
      path,
      nome_arquivo: file.name,
      tipo_mime:    file.type || 'application/pdf',
      tamanho_kb:   Math.round(buf.length / 1024),
      categoria:    'apolice',
      apolice_id:   apoliceId,
      cliente_id:   apo.cliente_id || null,
      negocio_id:   apo.negocio_id || null,
      user_id:      auth.userId,
    })
    .select('id').single()
  if (errAn) return NextResponse.json({ erro: 'Erro ao registrar anexo: '+errAn.message }, { status: 500 })

  // 5. Atualiza o número da apólice se foi informado e ainda vazio
  if (numero) {
    await supabaseAdmin.from('apolices').update({ numero }).eq('id', apoliceId).is('numero', null)
  }

  return NextResponse.json({
    ok: true,
    apolice_id: apoliceId,
    anexo_id:   anexo!.id,
    path,
  })
}
