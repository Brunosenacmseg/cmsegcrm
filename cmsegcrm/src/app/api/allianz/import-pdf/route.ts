// Importação de apólice Allianz via PDF.
//
// POST  multipart/form-data
//   file:        PDF da apólice (obrigatório)
//   apolice_id?: vincula o PDF a uma apólice já cadastrada (não cria nova)
//   negocio_id?: usa para puxar cliente_id quando há um negócio em aberto
//   modo?:       'preview' → só extrai e devolve, sem persistir
//                'salvar'  → extrai + persiste (default)
//   tipo?:       'emitida' | 'renovada' (default: 'renovada' se houver
//                apolice_anterior detectada, senão 'emitida')
//
// Etapas (modo=salvar):
//  1. Extrai texto do PDF, identifica produto, monta `dados_extraidos`
//     com TODOS os campos relevantes (cliente, vigência, coberturas,
//     parcelas, cláusulas, condutor, local segurado, etc.).
//  2. Localiza ou cria cliente por CPF/CNPJ.
//  3. Faz upsert em `apolices` com todos os campos parseados.
//  4. Substitui filhos em `apolice_itens_auto` (Auto), `apolice_coberturas`,
//     `apolice_clausulas`, `apolice_locais` (PME/Residência) e
//     `apolice_motoristas` (condutor Auto).
//  5. Snapshot bruto em `allianz_apolices_relatorio`.
//  6. Parcelas em `allianz_parcelas_emitidas`.
//  7. Sobe o PDF no storage e cria anexo (categoria='apolice').
//  8. Loga em `allianz_importacoes`.
//
// Devolve { ok, produto, dados_extraidos, apolice_id, anexo_id, warnings[] }.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  parseAllianzPDF,
  mapApolicePayload,
  mapApoliceRelatorioPayload,
  mapParcelasPayload,
  mapCoberturasPayload,
  mapClausulasPayload,
  mapItemAutoPayload,
  mapLocalSeguradoPayload,
  mapMotoristaPayload,
  produtoLabel,
  type AllianzPDFExtraido,
} from '@/lib/allianz-pdf'

export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

let _sa: ReturnType<typeof createClient> | null = null
function admin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function checarAuth(req: NextRequest) {
  const authH = req.headers.get('authorization') || ''
  const token = authH.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: ud } = await admin().auth.getUser(token)
  if (!ud?.user) return { ok: false as const, erro: 'Sessão inválida' }
  return { ok: true as const, userId: ud.user.id }
}

async function localizarOuCriarCliente(
  d: AllianzPDFExtraido,
  warnings: string[],
): Promise<string | null> {
  if (!d.cpf_cnpj) {
    warnings.push('CPF/CNPJ não encontrado no PDF — não foi possível localizar/criar cliente.')
    return null
  }
  const { data: existente } = await admin()
    .from('clientes')
    .select('id')
    .eq('cpf_cnpj', d.cpf_cnpj)
    .maybeSingle()
  if (existente) return (existente as any).id

  if (!d.cliente_nome) {
    warnings.push('Cliente não existe e nome não foi extraído — não foi possível criar.')
    return null
  }
  const tipoP = d.cpf_cnpj.length > 11 ? 'PJ' : 'PF'
  const { data: novo, error } = await admin()
    .from('clientes')
    .insert({
      nome: d.cliente_nome,
      cpf_cnpj: d.cpf_cnpj,
      tipo: tipoP,
      email: d.email,
      telefone: d.telefone,
      fonte: 'Allianz - PDF',
    })
    .select('id')
    .single()
  if (error || !novo) {
    warnings.push(`Falha ao criar cliente: ${error?.message || 'desconhecido'}`)
    return null
  }
  return (novo as any).id
}

async function upsertApolice(
  d: AllianzPDFExtraido,
  cliente_id: string,
  apoliceIdInput: string | null,
  negocio_id: string | null,
  warnings: string[],
): Promise<string | null> {
  const payload: any = mapApolicePayload(d, cliente_id)
  if (negocio_id) payload.negocio_id = negocio_id

  // 1. Se veio apolice_id, atualiza essa
  if (apoliceIdInput) {
    const { error } = await admin().from('apolices').update(payload).eq('id', apoliceIdInput)
    if (error) {
      warnings.push(`Falha ao atualizar apólice: ${error.message}`)
      return null
    }
    return apoliceIdInput
  }

  // 2. Tenta localizar por número
  if (d.numero_apolice) {
    const { data: jaExiste } = await admin()
      .from('apolices')
      .select('id')
      .eq('numero', d.numero_apolice)
      .maybeSingle()
    if (jaExiste) {
      const { error } = await admin().from('apolices').update(payload).eq('id', (jaExiste as any).id)
      if (error) warnings.push(`Falha ao atualizar apólice: ${error.message}`)
      return (jaExiste as any).id
    }
  }

  // 3. Cria nova
  const { data: nova, error } = await admin().from('apolices').insert(payload).select('id').single()
  if (error || !nova) {
    warnings.push(`Falha ao criar apólice: ${error?.message || 'desconhecido'}`)
    return null
  }
  return (nova as any).id
}

/**
 * Substitui as linhas filhas (delete + insert) — assim o reimport do
 * mesmo PDF não duplica coberturas/cláusulas/etc.
 */
async function replaceChildren<T extends Record<string, any>>(
  table: string,
  apolice_id: string,
  rows: T[],
  warnings: string[],
) {
  await admin().from(table).delete().eq('apolice_id', apolice_id)
  if (!rows.length) return
  const { error } = await admin().from(table).insert(rows)
  if (error) warnings.push(`Falha ao gravar ${table}: ${error.message}`)
}

async function gravarPDFAnexo(
  file: File,
  apoliceId: string,
  cliente_id: string | null,
  negocio_id: string | null,
  user_id: string,
  warnings: string[],
): Promise<string | null> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `apolices/${apoliceId}/${Date.now()}_${safeName}`
  const buf = Buffer.from(await file.arrayBuffer())
  const { error: errUp } = await admin().storage
    .from('cmsegcrm')
    .upload(path, buf, { contentType: file.type || 'application/pdf', upsert: false })
  if (errUp) {
    warnings.push(`Falha ao subir PDF no storage: ${errUp.message}`)
    return null
  }
  const { data: anexo, error: errAn } = await admin()
    .from('anexos')
    .insert({
      bucket: 'cmsegcrm',
      path,
      nome_arquivo: file.name,
      tipo_mime: file.type || 'application/pdf',
      tamanho_kb: Math.round(buf.length / 1024),
      categoria: 'apolice',
      apolice_id: apoliceId,
      cliente_id,
      negocio_id,
      user_id,
    })
    .select('id')
    .single()
  if (errAn || !anexo) {
    warnings.push(`Falha ao registrar anexo: ${errAn?.message || 'desconhecido'}`)
    return null
  }
  return (anexo as any).id
}

export async function POST(req: NextRequest) {
  const auth = await checarAuth(req)
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ erro: 'Esperado multipart/form-data' }, { status: 400 })
  }

  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ erro: 'Arquivo (file) é obrigatório.' }, { status: 400 })
  if (file.type && !/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
    return NextResponse.json({ erro: 'O arquivo deve ser um PDF.' }, { status: 400 })
  }

  const apoliceIdInput = (form.get('apolice_id') as string) || null
  const negocioId      = (form.get('negocio_id') as string) || null
  const modo           = ((form.get('modo') as string) || 'salvar') as 'preview' | 'salvar'
  const tipoForm       = (form.get('tipo') as 'emitida' | 'renovada' | null) || null

  const warnings: string[] = []
  const buf = Buffer.from(await file.arrayBuffer())

  // 1. Parser
  let dados: AllianzPDFExtraido
  try {
    dados = await parseAllianzPDF(buf)
  } catch (e: any) {
    return NextResponse.json({
      erro: 'Falha ao ler o PDF: ' + (e?.message || 'desconhecido'),
    }, { status: 422 })
  }
  warnings.push(...dados.warnings)

  if (modo === 'preview') {
    return NextResponse.json({
      ok: true,
      modo: 'preview',
      produto: produtoLabel(dados.produto),
      dados_extraidos: { ...dados, texto_bruto: undefined },
      warnings,
    })
  }

  // 2. cliente
  let cliente_id: string | null = null
  if (negocioId) {
    const { data: neg } = await admin()
      .from('negocios')
      .select('cliente_id')
      .eq('id', negocioId)
      .maybeSingle()
    if (neg && (neg as any).cliente_id) cliente_id = (neg as any).cliente_id as string
  }
  if (!cliente_id) cliente_id = await localizarOuCriarCliente(dados, warnings)
  if (!cliente_id) {
    return NextResponse.json({
      ok: false,
      erro: 'Não foi possível localizar/criar o cliente (informe negocio_id ou ajuste o PDF).',
      produto: produtoLabel(dados.produto),
      dados_extraidos: { ...dados, texto_bruto: undefined },
      warnings,
    }, { status: 422 })
  }

  // 3. apolice
  const apoliceId = await upsertApolice(dados, cliente_id, apoliceIdInput, negocioId, warnings)
  if (!apoliceId) {
    return NextResponse.json({
      ok: false,
      erro: warnings[warnings.length - 1] || 'Falha ao criar apólice',
      produto: produtoLabel(dados.produto),
      dados_extraidos: { ...dados, texto_bruto: undefined },
      warnings,
    }, { status: 500 })
  }

  // 4. linhas filhas (substitui — idempotente)
  const itemAuto = mapItemAutoPayload(dados, apoliceId)
  if (itemAuto) await replaceChildren('apolice_itens_auto', apoliceId, [itemAuto], warnings)
  const motorista = mapMotoristaPayload(dados, apoliceId)
  if (motorista) await replaceChildren('apolice_motoristas', apoliceId, [motorista], warnings)
  const local = mapLocalSeguradoPayload(dados, apoliceId)
  if (local) await replaceChildren('apolice_locais', apoliceId, [local], warnings)

  await replaceChildren('apolice_coberturas', apoliceId, mapCoberturasPayload(dados, apoliceId), warnings)
  await replaceChildren('apolice_clausulas', apoliceId, mapClausulasPayload(dados, apoliceId), warnings)

  // 5. relatório bruto Allianz (audit / fonte da verdade do PDF)
  const tipoRel: 'emitida' | 'renovada' =
    tipoForm || (dados.apolice_anterior ? 'renovada' : 'emitida')
  try {
    const relPayload = mapApoliceRelatorioPayload(dados, tipoRel)
    await admin()
      .from('allianz_apolices_relatorio')
      .upsert({ ...relPayload, cliente_id, apolice_id: apoliceId }, {
        onConflict: 'tipo,numero_apolice',
        ignoreDuplicates: false,
      })
  } catch (e: any) {
    warnings.push('Falha ao gravar relatório Allianz: ' + (e?.message || 'desconhecido'))
  }

  // 6. parcelas
  const parcelas = mapParcelasPayload(dados)
  if (parcelas.length) {
    try {
      await admin()
        .from('allianz_parcelas_emitidas')
        .upsert(
          parcelas.map(p => ({ ...p, cliente_id, apolice_id: apoliceId })),
          { onConflict: 'numero_apolice,parcela', ignoreDuplicates: false },
        )
    } catch (e: any) {
      warnings.push('Falha ao gravar parcelas: ' + (e?.message || 'desconhecido'))
    }
  }

  // 7. PDF como anexo
  const fileForUpload = new File([buf], file.name, { type: file.type || 'application/pdf' })
  const anexo_id = await gravarPDFAnexo(
    fileForUpload, apoliceId, cliente_id, negocioId, auth.userId, warnings,
  )

  // 8. log
  try {
    await admin().from('allianz_importacoes').insert({
      user_id: auth.userId,
      nome_arquivo: file.name,
      tipo: tipoRel === 'renovada' ? 'apolices_renovadas' : 'apolices_emitidas',
      qtd_lidos: 1,
      qtd_criados: 1,
      qtd_erros: 0,
      erros: warnings.slice(0, 10),
      concluido_em: new Date().toISOString(),
    })
  } catch {/* log opcional */}

  return NextResponse.json({
    ok: true,
    produto: produtoLabel(dados.produto),
    apolice_id: apoliceId,
    cliente_id,
    anexo_id,
    tipo: tipoRel,
    qtd_coberturas: dados.coberturas.length,
    qtd_clausulas: dados.clausulas.length,
    qtd_parcelas: dados.parcelas.length,
    dados_extraidos: { ...dados, texto_bruto: undefined },
    warnings,
  })
}
