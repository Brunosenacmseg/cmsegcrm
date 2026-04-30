import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rdId, RDDeal, RDContact } from '@/lib/rdstation'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function soDigitos(v?: string | null): string | null {
  if (!v) return null
  const d = String(v).replace(/\D/g, '')
  return d || null
}

// ─── Mapeamento de Deal RD → negocio CMSEGCRM ──────────────
async function aplicarDeal(d: RDDeal, eventType: string) {
  const id = rdId(d)
  if (!id) return { ok: false, motivo: 'Deal sem id' }

  // Resolver funil pelo pipeline
  let funil: any = null
  const pipelineId = rdId(d.deal_pipeline) || (d.deal_stage as any)?.deal_pipeline_id
  if (pipelineId) {
    const { data } = await supabaseAdmin.from('funis').select('id, etapas, nome, tipo').eq('rd_id', pipelineId).maybeSingle()
    funil = data
  }
  if (!funil) {
    // Procura qualquer funil de venda como fallback
    const { data } = await supabaseAdmin.from('funis').select('id, etapas, nome, tipo').eq('tipo', 'venda').limit(1).maybeSingle()
    funil = data
  }
  if (!funil) return { ok: false, motivo: 'Nenhum funil disponível' }

  // Resolver etapa
  let etapa = d.deal_stage?.name || (funil.etapas?.[0] || 'Novo')
  if (!(funil.etapas as string[]).includes(etapa)) etapa = funil.etapas?.[0] || 'Novo'

  // Override por win/lost
  if (eventType === 'deal_won' || d.win === true) {
    const ganhos = ['Fechado Ganho', 'Ganho', 'Renovado', 'Pago', 'Concluído']
    const m = (funil.etapas as string[]).find(e => ganhos.includes(e))
    if (m) etapa = m
  } else if (eventType === 'deal_lost' || d.win === false) {
    const perdidos = ['Fechado Perdido', 'Perdido', 'Não Renovado', 'Negado']
    const m = (funil.etapas as string[]).find(e => perdidos.includes(e))
    if (m) etapa = m
  }

  // Resolver cliente
  let clienteId: string | null = null
  const primeiro = d.contacts?.[0]
  if (primeiro) {
    const cid = rdId(primeiro)
    if (cid) {
      const { data } = await supabaseAdmin.from('clientes').select('id').eq('rd_id', cid).maybeSingle()
      clienteId = data?.id || null
    }
  }

  const obs = [
    d.name && `Negócio: ${d.name}`,
    d.deal_source?.name && `Origem: ${d.deal_source.name}`,
    d.campaign?.name && `Campanha: ${d.campaign.name}`,
    d.deal_lost_reason?.name && `Motivo perda: ${d.deal_lost_reason.name}`,
    d.user?.name && `Responsável RD: ${d.user.name}`,
  ].filter(Boolean).join(' | ')

  const premio = Number(d.amount_total ?? d.amount_montly ?? d.amount_unique ?? 0) || 0
  const venc = d.prediction_date ? d.prediction_date.slice(0, 10) : null

  const payload: any = {
    rd_id: id,
    funil_id: funil.id,
    etapa,
    produto: d.deal_products?.[0]?.product?.name || d.deal_products?.[0]?.name || null,
    premio,
    vencimento: venc,
    obs: obs || null,
  }
  if (clienteId) payload.cliente_id = clienteId

  const { data: existente } = await supabaseAdmin.from('negocios').select('id, etapa').eq('rd_id', id).maybeSingle()
  if (existente) {
    await supabaseAdmin.from('negocios').update(payload).eq('id', existente.id)
    if (existente.etapa !== etapa) {
      await supabaseAdmin.from('historico').insert({
        negocio_id: existente.id, cliente_id: clienteId, tipo: 'blue',
        titulo: `🔄 Etapa atualizada via RD Station`,
        descricao: `${existente.etapa} → ${etapa}`,
      })
    }
    return { ok: true, action: 'updated', id: existente.id }
  } else {
    if (!payload.cliente_id) {
      const { data: ph } = await supabaseAdmin.from('clientes').insert({
        nome: d.organization?.name || d.name || 'Sem cliente (RD)',
        tipo: d.organization?.name ? 'PJ' : 'PF',
        fonte: 'RD Station CRM',
      }).select('id').single()
      payload.cliente_id = ph?.id
    }
    if (!payload.cliente_id) return { ok: false, motivo: 'Não foi possível criar cliente' }
    const { data: novo } = await supabaseAdmin.from('negocios').insert(payload).select('id').single()
    return { ok: true, action: 'created', id: novo?.id }
  }
}

// ─── Mapeamento de Contact RD → cliente CMSEGCRM ───────────
async function aplicarContact(c: RDContact) {
  const id = rdId(c)
  if (!id) return { ok: false, motivo: 'Contact sem id' }
  const cnpj = soDigitos(c.cnpj)
  const cpf = soDigitos(c.cpf)
  const payload: any = {
    rd_id: id,
    nome: c.name?.trim() || (c.organization?.name?.trim() || 'Sem nome'),
    tipo: cnpj ? 'PJ' : 'PF',
    cpf_cnpj: cnpj || cpf || null,
    email: c.emails?.[0]?.email?.trim().toLowerCase() || null,
    telefone: c.phones?.[0]?.phone?.trim() || null,
    cep: soDigitos(c.zip_code),
    cidade: c.city || null,
    estado: c.state || null,
    fonte: c.source?.name || 'RD Station CRM',
  }

  const { data: existente } = await supabaseAdmin.from('clientes').select('id').eq('rd_id', id).maybeSingle()
  if (existente) {
    await supabaseAdmin.from('clientes').update(payload).eq('id', existente.id)
    return { ok: true, action: 'updated', id: existente.id }
  } else {
    const { data: novo } = await supabaseAdmin.from('clientes').insert(payload).select('id').single()
    return { ok: true, action: 'created', id: novo?.id }
  }
}

// ─── Detectar tipo de evento e payload ─────────────────────
function extrairDeal(body: any): RDDeal | null {
  if (body?.deal && typeof body.deal === 'object') return body.deal
  if (body?._id || body?.id) {
    if (body?.deal_stage || body?.deal_pipeline || body?.contacts) return body as RDDeal
  }
  return null
}

function extrairContact(body: any): RDContact | null {
  if (body?.contact && typeof body.contact === 'object') return body.contact
  if ((body?._id || body?.id) && (body?.emails || body?.phones || body?.cpf || body?.cnpj)) return body as RDContact
  return null
}

function detectarEvento(body: any): string {
  return body?.event_identifier || body?.event || body?.action || 'unknown'
}

// ─── Handler principal ─────────────────────────────────────
export async function POST(request: NextRequest) {
  // Validar secret
  const expected = process.env.RDSTATION_WEBHOOK_SECRET
  const provided = request.nextUrl.searchParams.get('secret') || request.headers.get('x-webhook-secret') || ''
  if (expected && provided !== expected) {
    return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
  }

  let body: any = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const evento = detectarEvento(body)

  // Logar payload para debug (limitado)
  await supabaseAdmin.from('rdstation_syncs').insert({
    recurso: `webhook:${evento}`,
    status: 'processando',
    qtd_lidos: 1,
    erros: [JSON.stringify(body).slice(0, 1500)],
  }).select('id').single().then(async ({ data }) => {
    if (!data?.id) return
    try {
      const deal = extrairDeal(body)
      const contact = extrairContact(body)
      let resultado: any = null

      if (evento === 'deal_deleted') {
        const id = body?.deal?._id || body?.deal?.id || body?._id || body?.id
        if (id) {
          const { data: existe } = await supabaseAdmin.from('negocios').select('id').eq('rd_id', id).maybeSingle()
          if (existe) {
            await supabaseAdmin.from('negocios').delete().eq('id', existe.id)
            resultado = { ok: true, action: 'deleted', id: existe.id }
          }
        }
      } else if (deal) {
        resultado = await aplicarDeal(deal, evento)
      } else if (contact) {
        resultado = await aplicarContact(contact)
      } else {
        resultado = { ok: false, motivo: 'Tipo de evento não suportado' }
      }

      await supabaseAdmin.from('rdstation_syncs').update({
        status: resultado?.ok ? 'concluido' : 'erro',
        qtd_criados: resultado?.action === 'created' ? 1 : 0,
        qtd_atualizados: resultado?.action === 'updated' ? 1 : 0,
        qtd_erros: resultado?.ok ? 0 : 1,
        erros: resultado?.ok ? null : [resultado?.motivo || 'erro desconhecido'],
        concluido_em: new Date().toISOString(),
      }).eq('id', data.id)
    } catch (err: any) {
      await supabaseAdmin.from('rdstation_syncs').update({
        status: 'erro', qtd_erros: 1,
        erros: [err?.message?.slice(0, 200) || 'erro'],
        concluido_em: new Date().toISOString(),
      }).eq('id', data.id)
    }
  })

  // Responder rápido pra RD não fazer retry
  return NextResponse.json({ ok: true, evento })
}

// Health-check (RD valida URL com GET)
export async function GET(request: NextRequest) {
  return NextResponse.json({ ok: true, service: 'rdstation-webhook' })
}
