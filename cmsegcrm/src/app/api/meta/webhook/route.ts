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

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

const GRAPH = 'https://graph.facebook.com/v19.0'

// ─── GET: Meta envia challenge pra verificar a URL ──────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const { data: cfg } = await supabaseAdmin().from('meta_config').select('verify_token').eq('id', 1).maybeSingle()
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
  const { data: cfg } = await supabaseAdmin().from('meta_config').select('access_token').eq('id', 1).maybeSingle()
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

      // Carrega mapeamento PRIMEIRO (precisa de campo_map antes de extrair)
      let mapping: any = null
      if (linha.form_id) {
        const { data: m } = await supabaseAdmin().from('meta_form_mapeamento')
          .select('*').eq('form_id', String(linha.form_id)).maybeSingle()
        if (m && m.ativo !== false) mapping = m
      }
      const campoMap: Record<string, string> = (mapping?.campo_map && typeof mapping.campo_map === 'object') ? mapping.campo_map : {}

      // Extrai campos do field_data
      const campos = Array.isArray(linha.campos) ? linha.campos : []
      // valor por chave do form
      const valorPorKey: Record<string, string> = {}
      for (const c of campos) {
        const k = (c?.name || '').toString()
        const v = Array.isArray(c.values) && c.values[0] ? String(c.values[0]).trim() : ''
        if (k && v) valorPorKey[k] = v
      }
      // fallback heurístico (caso campo_map não cubra tudo)
      const heur = (...keys: string[]) => {
        for (const k of keys) {
          const f = campos.find((x: any) => (x?.name || '').toLowerCase().includes(k))
          if (f && Array.isArray(f.values) && f.values[0]) return String(f.values[0]).trim()
        }
        return null
      }
      // Aplica campo_map → preenche colunas (suporta prefixos)
      //   cliente:<col>     → cliente.<col>
      //   cliente_cf:<chave>→ cliente.custom_fields.<chave>
      //   negocio:<col>     → negocio.<col>
      //   negocio_cf:<chave>→ negocio.custom_fields.<chave>
      // Sem prefixo (legado) = cliente:<col>
      const cliBase: Record<string, any> = {}
      const cliCustom: Record<string, any> = {}
      const negBase: Record<string, any> = {}
      const negCustom: Record<string, any> = {}
      for (const [formKey, target] of Object.entries(campoMap)) {
        if (!target) continue
        const v = valorPorKey[formKey]
        if (!v) continue
        const t = String(target)
        if (t.startsWith('cliente_cf:'))      cliCustom[t.slice(11)] = v
        else if (t.startsWith('cliente:'))    cliBase[t.slice(8)]    = v
        else if (t.startsWith('negocio_cf:')) negCustom[t.slice(11)] = v
        else if (t.startsWith('negocio:'))    negBase[t.slice(8)]    = v
        else                                   cliBase[t]             = v // legado
      }
      // Garante os campos básicos (heurística como fallback)
      const nome     = cliBase.nome     || heur('full_name', 'nome', 'name')
      const email    = cliBase.email    || heur('email', 'e-mail')
      const telefone = cliBase.telefone || heur('phone_number', 'telefone', 'phone', 'celular')
      const cpf      = cliBase.cpf_cnpj || heur('cpf')
      const cnpj     = (!cliBase.cpf_cnpj) ? heur('cnpj') : null

      // Tenta achar cliente existente por email/cpf/telefone, senão cria
      let clienteId: string | null = null
      const tenta = async (col: string, val: string | null) => {
        if (!val) return null
        const { data } = await supabaseAdmin().from('clientes').select('id').eq(col, val).limit(1).maybeSingle()
        return data?.id || null
      }
      clienteId = await tenta('email', email?.toLowerCase() || null)
            || await tenta('cpf_cnpj', (cpf || cnpj))
            || await tenta('telefone', telefone)

      // Monta payload do cliente (cliBase + heurística + tracking)
      const payloadCliente: any = {
        ...cliBase,
        nome:     cliBase.nome || nome || email || telefone || 'Lead Meta sem nome',
        tipo:     (cliBase.cpf_cnpj?.replace(/\D/g,'').length === 14 || cnpj) ? 'PJ' : 'PF',
        cpf_cnpj: cliBase.cpf_cnpj || cpf || cnpj || null,
        email:    cliBase.email?.toLowerCase() || email?.toLowerCase() || null,
        telefone: cliBase.telefone || telefone || null,
        fonte:    'Meta Ads',
        meta_lead_id:     linha.meta_lead_id,
        meta_campaign_id: linha.campanha_id || null,
        meta_adset_id:    linha.adset_id || null,
        meta_ad_id:       linha.ad_id || null,
        meta_form_id:     linha.form_id || null,
      }
      if (Object.keys(cliCustom).length) payloadCliente.custom_fields = cliCustom

      if (!clienteId) {
        const { data: novo } = await supabaseAdmin().from('clientes').insert(payloadCliente).select('id').single()
        clienteId = novo?.id || null
      } else {
        // Atualiza cliente existente. custom_fields faz merge (não sobrescreve).
        const { data: cur } = await supabaseAdmin().from('clientes').select('custom_fields').eq('id', clienteId).maybeSingle()
        const upd: any = {}
        for (const [k, v] of Object.entries(payloadCliente)) {
          if (k === 'custom_fields') continue
          if (v != null && v !== '') upd[k] = v
        }
        if (Object.keys(cliCustom).length) {
          upd.custom_fields = { ...((cur as any)?.custom_fields || {}), ...cliCustom }
        }
        await supabaseAdmin().from('clientes').update(upd).eq('id', clienteId)
      }

      // Define vendedor: round-robin se houver vendedor_ids, senão fixo
      let vendedorId: string | null = null
      if (mapping?.vendedor_ids && Array.isArray(mapping.vendedor_ids) && mapping.vendedor_ids.length > 0) {
        const { data: rr } = await supabaseAdmin().rpc('meta_proximo_vendedor', { p_form_id: String(linha.form_id) })
        vendedorId = (rr as any) || mapping.vendedor_ids[0]
      } else {
        vendedorId = mapping?.vendedor_id || null
      }

      // Cria negócio se: temos cliente E (mapping permite OU não há mapping)
      let negocioId: string | null = null
      const deveCriarNegocio = clienteId && (mapping ? mapping.criar_negocio !== false : true)
      if (deveCriarNegocio) {
        let funilId: string | null = mapping?.funil_id || null
        let etapaInicial: string | null = mapping?.etapa || null

        if (!funilId) {
          const { data: funil } = await supabaseAdmin().from('funis')
            .select('id, etapas').eq('tipo', 'venda').order('ordem').limit(1).maybeSingle()
          if (funil) {
            funilId = funil.id
            etapaInicial = (funil.etapas as string[])?.[0] || 'Novo'
          }
        } else if (!etapaInicial) {
          const { data: funil } = await supabaseAdmin().from('funis').select('etapas').eq('id', funilId).maybeSingle()
          etapaInicial = (funil?.etapas as string[])?.[0] || 'Novo'
        }

        if (funilId) {
          // Converte premio/numérico se mapeado
          const negPayload: any = {
            cliente_id:        clienteId,
            funil_id:          funilId,
            etapa:             etapaInicial!,
            titulo:            negBase.titulo || `Lead Meta · ${nome || email || telefone || 'sem nome'}`,
            fonte:             negBase.fonte  || 'Meta Ads',
            obs:               campos.length ? campos.map((c: any) => `${c.name}: ${(c.values || []).join(', ')}`).join('\n') : null,
            corretor_id:       vendedorId,
            vendedor_id:       vendedorId,
            meta_campaign_id:  linha.campanha_id || null,
            meta_ad_id:        linha.ad_id || null,
          }
          // Aplica negBase (sobrescreve defaults se mapeado)
          for (const [k, v] of Object.entries(negBase)) {
            if (v == null || v === '') continue
            // converte numérico para colunas numéricas conhecidas
            if (k === 'premio' || k === 'comissao_pct') {
              const n = Number(String(v).replace(/[^\d,.-]/g,'').replace(',', '.'))
              if (isFinite(n)) negPayload[k] = n
            } else negPayload[k] = v
          }
          if (Object.keys(negCustom).length) negPayload.custom_fields = negCustom

          const { data: neg } = await supabaseAdmin().from('negocios').insert(negPayload).select('id').single()
          negocioId = neg?.id || null
        }
      }

      // Grava o lead
      await supabaseAdmin().from('meta_leads').insert({
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
