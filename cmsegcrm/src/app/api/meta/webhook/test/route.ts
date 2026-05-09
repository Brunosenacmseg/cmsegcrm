// Endpoint admin para simular um lead do Meta Lead Ads sem depender da
// Meta enviar webhook real. Usa exatamente a mesma função que o webhook
// (`processarLeadgen`), portanto o que funciona aqui funciona em produção.
//
// POST /api/meta/webhook/test
// Body: {
//   form_id: string                   // ID do formulário no Meta
//   ad_id?: string                    // opcional, default 'TEST_AD'
//   campos?: { name: string; values: string[] }[]   // opcional; default = sample
// }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processarLeadgen, MetaFieldData } from '@/lib/meta-lead'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData, error } = await supabaseAdmin().auth.getUser(token)
  if (error || !userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', userData.user.id).single()
  if ((u as any)?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const, userId: userData.user.id }
}

// Gera um field_data de teste a partir das chaves do `campo_map` salvo —
// assim o teste exercita o mapeamento exato que o admin configurou.
function gerarCamposPadrao(campoMap: Record<string, any> | null | undefined): MetaFieldData[] {
  const stamp = Date.now().toString().slice(-6)
  const padroes: Record<string, string> = {
    full_name:    `Teste Webhook ${stamp}`,
    first_name:   `Teste Webhook ${stamp}`,
    nome:         `Teste Webhook ${stamp}`,
    name:         `Teste Webhook ${stamp}`,
    email:        `teste-webhook-${stamp}@example.com`,
    'e-mail':     `teste-webhook-${stamp}@example.com`,
    phone_number: `+55119${stamp}0000`,
    telefone:     `+55119${stamp}0000`,
    phone:        `+55119${stamp}0000`,
    celular:      `+55119${stamp}0000`,
    cpf:          '12345678909',
    cnpj:         '11222333000181',
    cep:          '01310-100',
    cidade:       'São Paulo',
    estado:       'SP',
  }
  const heur = (key: string): string => {
    const lk = key.toLowerCase()
    for (const [k, v] of Object.entries(padroes)) {
      if (lk.includes(k)) return v
    }
    if (lk.includes('cep'))    return padroes.cep
    if (lk.includes('cidade')) return padroes.cidade
    if (lk.includes('estado')) return padroes.estado
    if (lk.includes('cpf'))    return padroes.cpf
    if (lk.includes('cnpj'))   return padroes.cnpj
    return `valor de teste ${stamp}`
  }

  const keys = Object.keys(campoMap || {})
  const base: MetaFieldData[] = []
  if (keys.length === 0) {
    // Sem mapping — usa nomes padrão Meta
    base.push({ name: 'full_name',    values: [padroes.full_name] })
    base.push({ name: 'email',        values: [padroes.email] })
    base.push({ name: 'phone_number', values: [padroes.phone_number] })
  } else {
    for (const k of keys) base.push({ name: k, values: [heur(k)] })
  }
  return base
}

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}

  const formId: string | null = body.form_id ? String(body.form_id) : null
  if (!formId) return NextResponse.json({ error: 'form_id é obrigatório' }, { status: 400 })

  // Busca mapping pra gerar campos padrão alinhados com o que o admin configurou
  const { data: mapping } = await supabaseAdmin().from('meta_form_mapeamento')
    .select('campo_map, page_id, form_nome').eq('form_id', formId).maybeSingle()

  const fieldData: MetaFieldData[] = Array.isArray(body.campos) && body.campos.length > 0
    ? body.campos
    : gerarCamposPadrao((mapping as any)?.campo_map)

  const stamp = Date.now().toString().slice(-8)
  const resultado = await processarLeadgen(supabaseAdmin(), {
    leadgenId:  body.leadgen_id ? String(body.leadgen_id) : `TEST_${stamp}`,
    formId,
    adId:       body.ad_id ? String(body.ad_id) : 'TEST_AD',
    adsetId:    body.adset_id ? String(body.adset_id) : 'TEST_ADSET',
    campaignId: body.campaign_id ? String(body.campaign_id) : 'TEST_CAMP',
    pageId:     body.page_id ? String(body.page_id) : ((mapping as any)?.page_id || null),
    fieldData,
  })

  // Quando a negociação não foi criada apesar de tentarmos, devolve 500 pra
  // o botão "Enviar lead de teste" na UI mostrar erro em vermelho. Antes
  // sempre era 200 e o vendedor confiava no `ok` no JSON, que ficava
  // ignorado se o front tratasse só pelo status HTTP.
  const status = resultado.ok ? 200 : 500
  return NextResponse.json({
    ok: resultado.ok,
    cliente_id: resultado.clienteId,
    negocio_id: resultado.negocioId,
    meta_lead_id: resultado.metaLeadId,
    vendedor_id: resultado.vendedorId,
    motivo: resultado.motivo || null,
    erros: resultado.erros,
    campos_enviados: fieldData,
    form_nome: (mapping as any)?.form_nome || null,
  }, { status })
}
