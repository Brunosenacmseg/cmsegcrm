// Webhook do Meta Lead Ads.
//
// GET  → verificação inicial (Meta envia hub.challenge)
// POST → recebe novos leads via "leadgen" event
//
// Configuração no Meta:
//   1) Em Meta for Developers → seu app → Webhooks → Page → Add subscription
//      URL: https://seu-dominio.com/api/meta/webhook
//      Verify token: o mesmo que você guardou em meta_config.verify_token
//      Subscribed fields: leadgen
//   2) Subscrever a Page: POST /{page_id}/subscribed_apps?subscribed_fields=leadgen
//      (feito pela /api/meta/connect)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GRAPH = 'https://graph.facebook.com/v19.0'

// ─── GET: Meta envia challenge pra verificar a URL ──────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const { data: cfg } = await supabaseAdmin.from('meta_config').select('verify_token').eq('id', 1).maybeSingle()
  const verify = cfg?.verify_token || process.env.META_VERIFY_TOKEN

  if (mode === 'subscribe' && verify && token === verify) {
    return new NextResponse(challenge || '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// ─── POST: novo lead ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, erro: 'JSON inválido' }, { status: 400 })
  }

  // Estrutura típica: { object: 'page', entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id, ad_id, ... } }] }] }
  const entries: any[] = body?.entry || []
  const { data: cfg } = await supabaseAdmin.from('meta_config').select('access_token').eq('id', 1).maybeSingle()
  const accessToken = cfg?.access_token

  const recebidos: any[] = []
  for (const e of entries) {
    for (const c of (e.changes || [])) {
      if (c.field !== 'leadgen') continue
      const v = c.value || {}
      const leadgenId = v.leadgen_id
      if (!leadgenId) continue

      const linha: any = {
        meta_lead_id: String(leadgenId),
        form_id:      v.form_id ? String(v.form_id) : null,
        ad_id:        v.ad_id ? String(v.ad_id) : null,
        adset_id:     v.adgroup_id ? String(v.adgroup_id) : null,
        page_id:      v.page_id ? String(v.page_id) : null,
        campos:       null as any,
      }

      // Busca o lead detalhado na Graph API (precisa do access_token)
      if (accessToken) {
        try {
          const r = await fetch(`${GRAPH}/${leadgenId}?fields=field_data,ad_id,adset_id,campaign_id,form_id&access_token=${encodeURIComponent(accessToken)}`, {
            signal: AbortSignal.timeout(10000),
          })
          if (r.ok) {
            const j = await r.json()
            linha.campos      = j.field_data || null
            linha.ad_id       = j.ad_id || linha.ad_id
            linha.adset_id    = j.adset_id || linha.adset_id
            linha.campanha_id = j.campaign_id || null
            linha.form_id     = j.form_id || linha.form_id
          }
        } catch {}
      }

      // Extrai campos básicos do field_data (nome/email/phone)
      const campos = Array.isArray(linha.campos) ? linha.campos : []
      const get = (...keys: string[]) => {
        for (const k of keys) {
          const f = campos.find((x: any) => (x?.name || '').toLowerCase().includes(k))
          if (f && Array.isArray(f.values) && f.values[0]) return String(f.values[0]).trim()
        }
        return null
      }
      const nome     = get('full_name', 'nome', 'name')
      const email    = get('email', 'e-mail')
      const telefone = get('phone_number', 'telefone', 'phone', 'celular')
      const cpf      = get('cpf')
      const cnpj     = get('cnpj')

      // Tenta achar cliente existente por email/cpf/telefone, senão cria
      let clienteId: string | null = null
      const tenta = async (col: string, val: string | null) => {
        if (!val) return null
        const { data } = await supabaseAdmin.from('clientes').select('id').eq(col, val).limit(1).maybeSingle()
        return data?.id || null
      }
      clienteId = await tenta('email', email?.toLowerCase() || null)
            || await tenta('cpf_cnpj', (cpf || cnpj))
            || await tenta('telefone', telefone)

      if (!clienteId && (nome || email || telefone || cpf || cnpj)) {
        const { data: novo } = await supabaseAdmin.from('clientes').insert({
          nome:     nome || email || telefone || 'Lead Meta sem nome',
          tipo:     cnpj ? 'PJ' : 'PF',
          cpf_cnpj: cpf || cnpj || null,
          email:    email?.toLowerCase() || null,
          telefone: telefone || null,
          fonte:    'Meta Ads',
          meta_lead_id:     linha.meta_lead_id,
          meta_campaign_id: linha.campanha_id || null,
          meta_adset_id:    linha.adset_id || null,
          meta_ad_id:       linha.ad_id || null,
          meta_form_id:     linha.form_id || null,
        }).select('id').single()
        clienteId = novo?.id || null
      } else if (clienteId) {
        // Atualiza cliente existente com tracking IDs (se ainda não tinha)
        await supabaseAdmin.from('clientes').update({
          meta_lead_id:     linha.meta_lead_id,
          meta_campaign_id: linha.campanha_id || null,
          meta_adset_id:    linha.adset_id || null,
          meta_ad_id:       linha.ad_id || null,
          meta_form_id:     linha.form_id || null,
        }).eq('id', clienteId)
      }

      // Mapeamento por formulário: define funil/etapa/vendedor.
      // Se não houver mapeamento ativo, cai no funil padrão "venda".
      let mapping: any = null
      if (linha.form_id) {
        const { data: m } = await supabaseAdmin.from('meta_form_mapeamento')
          .select('*').eq('form_id', String(linha.form_id)).maybeSingle()
        if (m && m.ativo !== false) mapping = m
      }
      let vendedorId: string | null = mapping?.vendedor_id || null

      // Cria negócio se: temos cliente E (mapping permite OU não há mapping)
      let negocioId: string | null = null
      const deveCriarNegocio = clienteId && (mapping ? mapping.criar_negocio !== false : true)
      if (deveCriarNegocio) {
        let funilId: string | null = mapping?.funil_id || null
        let etapaInicial: string | null = mapping?.etapa || null

        if (!funilId) {
          const { data: funil } = await supabaseAdmin.from('funis')
            .select('id, etapas').eq('tipo', 'venda').order('ordem').limit(1).maybeSingle()
          if (funil) {
            funilId = funil.id
            etapaInicial = (funil.etapas as string[])?.[0] || 'Novo'
          }
        } else if (!etapaInicial) {
          const { data: funil } = await supabaseAdmin.from('funis').select('etapas').eq('id', funilId).maybeSingle()
          etapaInicial = (funil?.etapas as string[])?.[0] || 'Novo'
        }

        if (funilId) {
          const { data: neg } = await supabaseAdmin.from('negocios').insert({
            cliente_id:        clienteId,
            funil_id:          funilId,
            etapa:             etapaInicial!,
            titulo:            `Lead Meta · ${nome || email || telefone || 'sem nome'}`,
            fonte:             'Meta Ads',
            obs:               campos.length ? campos.map((c: any) => `${c.name}: ${(c.values || []).join(', ')}`).join('\n') : null,
            corretor_id:       vendedorId,
            vendedor_id:       vendedorId,
            meta_campaign_id:  linha.campanha_id || null,
            meta_ad_id:        linha.ad_id || null,
          }).select('id').single()
          negocioId = neg?.id || null
        }
      }

      // Grava o lead
      await supabaseAdmin.from('meta_leads').insert({
        meta_lead_id:  linha.meta_lead_id,
        form_id:       linha.form_id,
        ad_id:         linha.ad_id,
        adset_id:      linha.adset_id,
        campanha_id:   linha.campanha_id || null,
        page_id:       linha.page_id,
        campos:        linha.campos,
        cliente_id:    clienteId,
        negocio_id:    negocioId,
        vendedor_id:   vendedorId,
        processado_em: new Date().toISOString(),
      })

      recebidos.push({ leadgenId, clienteId, negocioId })
    }
  }

  return NextResponse.json({ ok: true, recebidos: recebidos.length })
}
