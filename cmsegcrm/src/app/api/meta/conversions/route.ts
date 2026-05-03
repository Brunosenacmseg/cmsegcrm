import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enviarEventoCRM } from '@/lib/meta-conversions'

export const dynamic = 'force-dynamic'

export const maxDuration = 30

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function autenticarUsuario(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data: userData } = await supabaseAdmin().auth.getUser(token)
  if (!userData?.user) return null
  return userData.user
}

// POST: envia evento de CRM (Lead/MQL/SQL/Customer/...) pra Meta.
// Body: { negocio_id?, event_name, event_time?, test? }
// - Se negocio_id vier, pegamos cliente vinculado pra montar user_data.
// - Se test=true, manda com test_event_code (ENV META_TEST_EVENT_CODE).
export async function POST(request: NextRequest) {
  const user = await autenticarUsuario(request)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { negocio_id, event_name, event_time, test } = body
  if (!event_name) return NextResponse.json({ error: 'event_name obrigatório' }, { status: 400 })

  // Carrega config Meta
  const { data: cfg } = await supabaseAdmin().from('meta_config').select('*').eq('id', 1).maybeSingle()
  const datasetId   = cfg?.dataset_id
  const accessToken = cfg?.conversions_token || cfg?.access_token
  if (!datasetId)   return NextResponse.json({ error: 'dataset_id não configurado em /dashboard/integracoes/meta' }, { status: 400 })
  if (!accessToken) return NextResponse.json({ error: 'access_token (ou conversions_token) não configurado' }, { status: 400 })

  // Carrega cliente do negócio (se houver)
  let cliente: any = null
  let negocio: any = null
  if (negocio_id) {
    const { data: neg } = await supabaseAdmin().from('negocios')
      .select('id, cliente_id, meta_lead_id, etapa, funil_id, funis(nome)')
      .eq('id', negocio_id).maybeSingle()
    negocio = neg

    // REGRA DE NEGÓCIO: a API de Conversão só dispara para o funil
    // "META + MULTICANAL". Outros funis ficam fora da otimização da Meta.
    const nomeFunil = (neg as any)?.funis?.nome || ''
    const ehMetaMulticanal = /meta\s*\+\s*multicanal/i.test(nomeFunil)
    if (!ehMetaMulticanal && !test) {
      return NextResponse.json({
        ok: false, ignorado: true,
        motivo: `Funil "${nomeFunil}" não é META + MULTICANAL — evento não enviado.`,
      })
    }

    if (neg?.cliente_id) {
      const { data: cli } = await supabaseAdmin().from('clientes')
        .select('id, email, telefone, nome, cpf_cnpj, cidade, estado, cep, meta_lead_id')
        .eq('id', neg.cliente_id).maybeSingle()
      cliente = cli
      if (cli && !cli.meta_lead_id && neg.meta_lead_id) cliente.meta_lead_id = neg.meta_lead_id
    }
  }

  try {
    const { resposta, payload } = await enviarEventoCRM({
      datasetId,
      accessToken,
      eventName: event_name,
      eventTime: event_time,
      cliente,
      testEventCode: test ? (process.env.META_TEST_EVENT_CODE || 'TEST_CODE') : undefined,
    })

    await supabaseAdmin().from('meta_eventos_log').insert({
      negocio_id: negocio?.id || null,
      cliente_id: cliente?.id || null,
      event_name,
      event_time: payload.data[0].event_time,
      payload,
      resposta,
      status: test ? 'teste' : 'enviado',
      enviado_por: user.id,
    })

    return NextResponse.json({ ok: true, resposta })
  } catch (e: any) {
    await supabaseAdmin().from('meta_eventos_log').insert({
      negocio_id: negocio?.id || null,
      cliente_id: cliente?.id || null,
      event_name,
      event_time: event_time || Math.floor(Date.now() / 1000),
      status: 'erro',
      erro_msg: e?.message?.slice(0, 500) || 'erro',
      enviado_por: user.id,
    })
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 })
  }
}

// GET: histórico de eventos enviados
export async function GET(request: NextRequest) {
  const user = await autenticarUsuario(request)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { data } = await supabaseAdmin().from('meta_eventos_log').select('*').order('enviado_em', { ascending: false }).limit(50)
  return NextResponse.json({ eventos: data || [] })
}
