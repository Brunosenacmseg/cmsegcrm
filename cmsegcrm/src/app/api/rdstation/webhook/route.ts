import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rdId, RDDeal, RDContact } from '@/lib/rdstation'

export const dynamic = 'force-dynamic'

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

function soDigitos(v?: string | null): string | null {
  if (!v) return null
  const d = String(v).replace(/\D/g, '')
  return d || null
}

// Descarta CPFs/CNPJs com tamanho inválido ou todos os dígitos iguais
// (000.000.000-00, 111.111.111-11 etc — placeholders comuns).
function docValido(v?: string | null): string | null {
  const d = soDigitos(v)
  if (!d) return null
  if (d.length !== 11 && d.length !== 14) return null
  if (/^(\d)\1+$/.test(d)) return null
  return d
}

// ─── Mapeamento de Deal RD → negocio CMSEGCRM ──────────────
async function aplicarDeal(d: RDDeal, eventType: string) {
  const id = rdId(d)
  if (!id) return { ok: false, motivo: 'Deal sem id' }

  // Resolver funil pelo pipeline
  let funil: any = null
  const pipelineId = rdId(d.deal_pipeline) || (d.deal_stage as any)?.deal_pipeline_id
  if (pipelineId) {
    const { data } = await supabaseAdmin().from('funis').select('id, etapas, nome, tipo').eq('rd_id', pipelineId).maybeSingle()
    funil = data
  }
  if (!funil) {
    // Procura qualquer funil de venda como fallback
    const { data } = await supabaseAdmin().from('funis').select('id, etapas, nome, tipo').eq('tipo', 'venda').limit(1).maybeSingle()
    funil = data
  }
  if (!funil) return { ok: false, motivo: 'Nenhum funil disponível' }

  // Resolver etapa
  let etapa = d.deal_stage?.name || (funil.etapas?.[0] || 'Novo')
  if (!(funil.etapas as string[]).includes(etapa)) etapa = funil.etapas?.[0] || 'Novo'

  // Override por status/win/lost (v1: win bool, v2: status enum)
  const status = (d as any).status as string | undefined
  const ganhou = eventType.includes('won') || d.win === true || status === 'won'
  const perdeu = eventType.includes('lost') || d.win === false || status === 'lost'
  if (ganhou) {
    const ganhos = ['Fechado Ganho', 'Ganho', 'Renovado', 'Pago', 'Concluído']
    const m = (funil.etapas as string[]).find(e => ganhos.includes(e))
    if (m) etapa = m
  } else if (perdeu) {
    const perdidos = ['Fechado Perdido', 'Perdido', 'Não Renovado', 'Negado']
    const m = (funil.etapas as string[]).find(e => perdidos.includes(e))
    if (m) etapa = m
  }

  // Resolver cliente: primeiro por rd_id, depois por CPF/CNPJ, depois por email.
  // Importante porque o RD frequentemente envia eventos de deal sem antes ter
  // mandado o evento de contact — sem esse fallback o webhook cria placeholders
  // duplicados sem CPF e perdemos o vínculo com o cliente real.
  let clienteId: string | null = null
  const primeiro = d.contacts?.[0]
  const docContato = docValido(primeiro?.cnpj) || docValido(primeiro?.cpf)
  const emailContato = primeiro?.emails?.[0]?.email?.trim().toLowerCase() || null
  if (primeiro) {
    const cid = rdId(primeiro)
    if (cid) {
      const { data } = await supabaseAdmin().from('clientes').select('id').eq('rd_id', cid).maybeSingle()
      clienteId = data?.id || null
    }
    if (!clienteId && docContato) {
      const { data } = await supabaseAdmin().from('clientes').select('id').eq('cpf_cnpj', docContato).limit(1).maybeSingle()
      clienteId = data?.id || null
    }
    if (!clienteId && emailContato) {
      const { data } = await supabaseAdmin().from('clientes').select('id').eq('email', emailContato).limit(1).maybeSingle()
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

  // v2 corrige o typo: amount_monthly. v1 tinha amount_montly.
  const premio = Number(
    d.amount_total ?? (d as any).amount_monthly ?? d.amount_montly ?? d.amount_unique ?? 0
  ) || 0
  const venc = d.prediction_date ? d.prediction_date.slice(0, 10) : null

  const payload: any = {
    rd_id: id,
    funil_id: funil.id,
    etapa,
    produto: d.deal_products?.[0]?.product?.name || d.deal_products?.[0]?.name || null,
    premio,
    vencimento: venc,
    obs: obs || null,
    cpf_cnpj: docContato,
    fonte: d.deal_source?.name || d.campaign?.name || 'RD Station CRM',
  }
  if (clienteId) payload.cliente_id = clienteId

  const { data: existente, error: errSel } = await supabaseAdmin().from('negocios').select('id, etapa').eq('rd_id', id).maybeSingle()
  if (errSel) return { ok: false, motivo: `select negocios: ${errSel.message}` }
  if (existente) {
    const { error: errUp } = await supabaseAdmin().from('negocios').update(payload).eq('id', existente.id)
    if (errUp) return { ok: false, motivo: `update negocios: ${errUp.message}` }
    if (existente.etapa !== etapa) {
      const { error: errHist } = await supabaseAdmin().from('historico').insert({
        negocio_id: existente.id, cliente_id: clienteId, tipo: 'blue',
        titulo: `🔄 Etapa atualizada via RD Station`,
        descricao: `${existente.etapa} → ${etapa}`,
      })
      if (errHist) return { ok: false, motivo: `insert historico: ${errHist.message}` }
    }
    return { ok: true, action: 'updated', id: existente.id }
  } else {
    if (!payload.cliente_id) {
      // Tenta criar com dados reais do contato (nome/email/telefone/CPF) — só
      // cai pra placeholder se vier sem nada utilizável.
      const novoCliente: any = {
        nome: primeiro?.name?.trim()
          || d.organization?.name
          || d.name
          || 'Sem cliente (RD)',
        tipo: docContato && docContato.length === 14 ? 'PJ' : (d.organization?.name ? 'PJ' : 'PF'),
        cpf_cnpj: docContato,
        email: emailContato,
        telefone: primeiro?.phones?.[0]?.phone?.trim() || null,
        fonte: d.deal_source?.name || d.campaign?.name || 'RD Station CRM',
      }
      if (rdId(primeiro as any)) novoCliente.rd_id = rdId(primeiro as any)
      const { data: ph, error: errCli } = await supabaseAdmin().from('clientes').insert(novoCliente).select('id').single()
      if (errCli) return { ok: false, motivo: `insert cliente: ${errCli.message}` }
      payload.cliente_id = ph?.id
    }
    if (!payload.cliente_id) return { ok: false, motivo: 'Não foi possível criar cliente' }
    const { data: novo, error: errIns } = await supabaseAdmin().from('negocios').insert(payload).select('id').single()
    if (errIns) return { ok: false, motivo: `insert negocios: ${errIns.message}` }
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

  const { data: existente, error: errSel } = await supabaseAdmin().from('clientes').select('id').eq('rd_id', id).maybeSingle()
  if (errSel) return { ok: false, motivo: `select clientes: ${errSel.message}` }
  if (existente) {
    const { error: errUp } = await supabaseAdmin().from('clientes').update(payload).eq('id', existente.id)
    if (errUp) return { ok: false, motivo: `update clientes: ${errUp.message}` }
    return { ok: true, action: 'updated', id: existente.id }
  } else {
    const { data: novo, error: errIns } = await supabaseAdmin().from('clientes').insert(payload).select('id').single()
    if (errIns) return { ok: false, motivo: `insert clientes: ${errIns.message}` }
    return { ok: true, action: 'created', id: novo?.id }
  }
}

// ─── Detectar tipo de evento e payload ─────────────────────
// v2: { event_name: "crm_deal_updated", document: {...} }
// v1: { event_identifier: "deal_updated", deal: {...} }
function extrairDocumento(body: any): any {
  return body?.document || body
}

function extrairDeal(body: any): RDDeal | null {
  const doc = extrairDocumento(body)
  if (body?.deal && typeof body.deal === 'object') return body.deal
  if (doc?._id || doc?.id) {
    if (doc?.deal_stage || doc?.deal_pipeline || doc?.contacts || doc?.amount_total !== undefined || doc?.amount_monthly !== undefined) {
      return doc as RDDeal
    }
  }
  return null
}

function extrairContact(body: any): RDContact | null {
  const doc = extrairDocumento(body)
  if (body?.contact && typeof body.contact === 'object') return body.contact
  if ((doc?._id || doc?.id) && (doc?.emails || doc?.phones || doc?.cpf || doc?.cnpj || doc?.job_title || doc?.organization_id !== undefined)) return doc as RDContact
  return null
}

function detectarEvento(body: any): string {
  // v2 usa "crm_deal_updated"; v1 "deal_updated"; também testa event/action
  const raw = body?.event_name || body?.event_identifier || body?.event || body?.action || 'unknown'
  return String(raw).replace(/^crm_/, '') // normaliza pra deal_updated etc
}

// ─── Handler principal ─────────────────────────────────────
export async function POST(request: NextRequest) {
  // Validar secret — aceita ?secret=X (v1), x-webhook-secret, Authorization Bearer X, ou header customizado
  const expected = process.env.RDSTATION_WEBHOOK_SECRET
  const auth = request.headers.get('authorization') || ''
  const bearer = auth.replace(/^Bearer\s+/i, '').trim()
  const provided = request.nextUrl.searchParams.get('secret')
    || request.headers.get('x-webhook-secret')
    || request.headers.get('x-auth-key')
    || bearer
    || ''
  if (expected && provided !== expected) {
    return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
  }

  let body: any = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const evento = detectarEvento(body)

  // Logar payload para debug (limitado)
  const { data: logRow } = await supabaseAdmin().from('rdstation_syncs').insert({
    recurso: `webhook:${evento}`,
    status: 'processando',
    qtd_lidos: 1,
    erros: [JSON.stringify(body).slice(0, 1500)],
  }).select('id').single()

  let resultado: any = { ok: false, motivo: 'não processado' }
  try {
    const deal = extrairDeal(body)
    const contact = extrairContact(body)

    if (evento === 'deal_deleted') {
      const doc = extrairDocumento(body)
      const id = doc?._id || doc?.id || body?.deal?._id || body?.deal?.id
      if (id) {
        const { data: existe, error: errSel } = await supabaseAdmin().from('negocios').select('id').eq('rd_id', id).maybeSingle()
        if (errSel) {
          resultado = { ok: false, motivo: `select negocios: ${errSel.message}` }
        } else if (existe) {
          const { error: errDel } = await supabaseAdmin().from('negocios').delete().eq('id', existe.id)
          resultado = errDel
            ? { ok: false, motivo: `delete negocios: ${errDel.message}` }
            : { ok: true, action: 'deleted', id: existe.id }
        } else {
          resultado = { ok: true, action: 'noop', motivo: 'negócio não existia' }
        }
      } else {
        resultado = { ok: false, motivo: 'deal_deleted sem id' }
      }
    } else if (evento === 'contact_deleted') {
      const doc = extrairDocumento(body)
      const id = doc?._id || doc?.id
      if (id) {
        const { data: existe, error: errSel } = await supabaseAdmin().from('clientes').select('id').eq('rd_id', id).maybeSingle()
        if (errSel) {
          resultado = { ok: false, motivo: `select clientes: ${errSel.message}` }
        } else if (existe) {
          const { error: errDel } = await supabaseAdmin().from('clientes').delete().eq('id', existe.id)
          resultado = errDel
            ? { ok: false, motivo: `delete clientes: ${errDel.message}` }
            : { ok: true, action: 'deleted', id: existe.id }
        } else {
          resultado = { ok: true, action: 'noop', motivo: 'cliente não existia' }
        }
      } else {
        resultado = { ok: false, motivo: 'contact_deleted sem id' }
      }
    } else if (deal) {
      resultado = await aplicarDeal(deal, evento)
    } else if (contact) {
      resultado = await aplicarContact(contact)
    } else {
      resultado = { ok: false, motivo: 'Tipo de evento não suportado' }
    }
  } catch (err: any) {
    resultado = { ok: false, motivo: err?.message?.slice(0, 200) || 'erro' }
  }

  if (logRow?.id) {
    await supabaseAdmin().from('rdstation_syncs').update({
      status: resultado?.ok ? 'concluido' : 'erro',
      qtd_criados: resultado?.action === 'created' ? 1 : 0,
      qtd_atualizados: resultado?.action === 'updated' ? 1 : 0,
      qtd_erros: resultado?.ok ? 0 : 1,
      erros: resultado?.ok ? null : [resultado?.motivo || 'erro desconhecido'],
      concluido_em: new Date().toISOString(),
    }).eq('id', logRow.id)
  }

  // Resposta reflete o resultado real do processamento.
  // RD Station só faz retry em 5xx; um payload sem sucesso volta 200 com ok:false
  // para evitar retry infinito (o erro fica registrado em rdstation_syncs).
  return NextResponse.json({ ok: !!resultado?.ok, evento, action: resultado?.action, motivo: resultado?.motivo })
}

// Health-check (RD valida URL com GET)
export async function GET(request: NextRequest) {
  return NextResponse.json({ ok: true, service: 'rdstation-webhook' })
}
