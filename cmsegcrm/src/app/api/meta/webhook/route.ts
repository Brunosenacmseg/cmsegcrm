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
import { GRAPH, verifyMetaSignature } from '@/lib/meta-graph'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

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
  // Lê o corpo cru pra poder validar a assinatura HMAC SHA-256 que a Meta
  // envia no header X-Hub-Signature-256 (computada com app_secret sobre o
  // JSON exato). Sem isso, qualquer um pode injetar leads via POST.
  const raw = await req.text()
  let body: any = {}
  try { body = JSON.parse(raw) } catch {
    return NextResponse.json({ ok: false, erro: 'JSON inválido' }, { status: 400 })
  }

  const { data: cfg } = await supabaseAdmin().from('meta_config')
    .select('access_token, page_access_token, app_secret').eq('id', 1).maybeSingle()
  const accessToken = (cfg?.page_access_token as string) || (cfg?.access_token as string) || null
  const appSecret = (cfg?.app_secret as string) || process.env.META_APP_SECRET || null

  const sigHeader = req.headers.get('x-hub-signature-256')
  const verif = verifyMetaSignature(raw, sigHeader, appSecret)
  if (verif === false) {
    console.warn('[meta-webhook] assinatura X-Hub-Signature-256 inválida — rejeitando POST')
    return NextResponse.json({ ok: false, erro: 'assinatura inválida' }, { status: 403 })
  }
  if (verif === null) {
    // Sem app_secret configurado: aceita pra não bloquear setups iniciais,
    // mas avisa em log. Em produção SEMPRE configure app_secret.
    console.warn('[meta-webhook] app_secret não configurado — aceitando POST sem validar HMAC. Configure em /dashboard/integracoes/meta.')
  }

  // Estrutura típica: { object: 'page', entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id, ad_id, ... } }] }] }
  const entries: any[] = body?.entry || []

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

      // Busca o lead detalhado na Graph API. Idealmente com page_access_token
      // (leads_retrieval é page-scoped); cai pra user token como fallback.
      if (accessToken) {
        try {
          const r = await fetch(`${GRAPH}/${leadgenId}?fields=field_data,ad_id,adset_id,campaign_id,form_id&access_token=${encodeURIComponent(accessToken)}`, {
            signal: AbortSignal.timeout(10000),
          })
          const j = await r.json().catch(() => ({}))
          if (r.ok && !j?.error) {
            linha.campos      = j.field_data || null
            linha.ad_id       = j.ad_id || linha.ad_id
            linha.adset_id    = j.adset_id || linha.adset_id
            linha.campanha_id = j.campaign_id || null
            linha.form_id     = j.form_id || linha.form_id
          } else {
            console.error('[meta-webhook] falha ao buscar leadgen', leadgenId, j?.error || `HTTP ${r.status}`)
          }
        } catch (e) {
          console.error('[meta-webhook] erro de rede buscando leadgen', leadgenId, e)
        }
      } else {
        console.warn('[meta-webhook] sem access_token configurado — não foi possível enriquecer lead', leadgenId)
      }

      // Carrega mapeamento PRIMEIRO (precisa de campo_map antes de extrair)
      let mapping: any = null
      if (linha.form_id) {
        const { data: m } = await supabaseAdmin().from('meta_form_mapeamento')
          .select('*').eq('form_id', String(linha.form_id)).maybeSingle()
        if (m && m.ativo !== false) mapping = m
      }
      const campoMap: Record<string, any> = (mapping?.campo_map && typeof mapping.campo_map === 'object') ? mapping.campo_map : {}

      // Extrai campos do field_data
      const campos = Array.isArray(linha.campos) ? linha.campos : []
      // valor por chave do form
      const valorPorKey: Record<string, string> = {}
      for (const c of campos) {
        const k = (c?.name || '').toString()
        const v = Array.isArray(c.values) && c.values[0] ? String(c.values[0]).trim() : ''
        if (k && v) valorPorKey[k] = v
      }

      // Enriquece valorPorKey com metadados da Meta (campanha, adset, ad,
      // form, page, lead). Permite usar __meta__:* tanto em campo_map quanto
      // em titulo_campos. Os IDs já vêm em `linha`; os nomes são buscados
      // nas tabelas espelho meta_campanhas / meta_adsets / meta_ads.
      const setMeta = (k: string, v: string | null | undefined) => {
        if (v != null && String(v).trim() !== '') valorPorKey[k] = String(v).trim()
      }
      setMeta('__meta__:campaign_id', linha.campanha_id)
      setMeta('__meta__:adset_id',    linha.adset_id)
      setMeta('__meta__:ad_id',       linha.ad_id)
      setMeta('__meta__:form_id',     linha.form_id)
      setMeta('__meta__:page_id',     linha.page_id)
      setMeta('__meta__:lead_id',     linha.meta_lead_id)
      setMeta('__meta__:form_name',   mapping?.form_nome)
      if (linha.campanha_id) {
        const { data: row } = await supabaseAdmin().from('meta_campanhas')
          .select('nome').eq('meta_id', String(linha.campanha_id)).maybeSingle()
        setMeta('__meta__:campaign_name', (row as any)?.nome)
      }
      if (linha.adset_id) {
        const { data: row } = await supabaseAdmin().from('meta_adsets')
          .select('nome').eq('meta_id', String(linha.adset_id)).maybeSingle()
        setMeta('__meta__:adset_name', (row as any)?.nome)
      }
      if (linha.ad_id) {
        const { data: row } = await supabaseAdmin().from('meta_ads')
          .select('nome').eq('meta_id', String(linha.ad_id)).maybeSingle()
        setMeta('__meta__:ad_name', (row as any)?.nome)
      }
      // fallback heurístico (caso campo_map não cubra tudo)
      const heur = (...keys: string[]) => {
        for (const k of keys) {
          const f = campos.find((x: any) => (x?.name || '').toLowerCase().includes(k))
          if (f && Array.isArray(f.values) && f.values[0]) return String(f.values[0]).trim()
        }
        return null
      }
      // ── Mapeamento de campos da NEGOCIAÇÃO ──
      // Modelo novo (campo_negocio_map): { "negocio:titulo": ["__meta__:campaign_name", "first_name"], ... }
      //   Para cada coluna, resolve cada origem em valorPorKey e concatena com " - ".
      // Modelo legado (campo_map): { formKey: { negocio: "negocio:col" | "negocio_cf:chave" } }
      //   Aplica como fallback apenas para colunas ainda não preenchidas pelo modelo novo.
      const negBase: Record<string, any> = {}
      const negCustom: Record<string, any> = {}
      const aplicarColuna = (colKey: string, valor: string) => {
        if (!colKey || valor == null || valor === '') return
        if (colKey.startsWith('negocio_cf:'))      negCustom[colKey.slice(11)] = valor
        else if (colKey.startsWith('negocio:'))    negBase[colKey.slice(8)]    = valor
      }

      const negMap: Record<string, any> = (mapping?.campo_negocio_map && typeof mapping.campo_negocio_map === 'object') ? mapping.campo_negocio_map : {}
      for (const [colKey, srcKeys] of Object.entries(negMap)) {
        if (!Array.isArray(srcKeys)) continue
        const partes = srcKeys
          .map(k => valorPorKey[String(k)])
          .filter(v => v != null && v !== '')
        if (partes.length) aplicarColuna(colKey, partes.join(' - '))
      }

      // Fallback legado (campo_map). Só preenche colunas que ainda não vieram do mapa novo.
      const aplicarLegado = (target: any, v: string) => {
        if (!target) return
        const t = String(target)
        if (t.startsWith('negocio_cf:')) {
          const k = t.slice(11)
          if (!(k in negCustom)) negCustom[k] = v
        } else if (t.startsWith('negocio:')) {
          const k = t.slice(8)
          if (!(k in negBase)) negBase[k] = v
        }
      }
      for (const [formKey, target] of Object.entries(campoMap)) {
        const v = valorPorKey[formKey]
        if (!v) continue
        if (typeof target === 'string') {
          aplicarLegado(target, v)
        } else if (target && typeof target === 'object') {
          aplicarLegado((target as any).negocio, v)
        }
      }

      // Título: prioriza o que veio do mapa novo (negBase.titulo); senão usa
      // titulo_campos legado; senão fallback heurístico mais abaixo.
      let tituloComposto: string | null = negBase.titulo || null
      if (!tituloComposto) {
        const tituloCampos: string[] = Array.isArray(mapping?.titulo_campos) ? mapping.titulo_campos : []
        if (tituloCampos.length > 0) {
          const partes = tituloCampos.map(k => valorPorKey[k]).filter(v => v != null && v !== '')
          if (partes.length) tituloComposto = partes.join(' - ')
        }
      }

      // Fallback heurístico apenas para o título de fallback
      const nome     = heur('full_name', 'nome', 'name')
      const email    = heur('email', 'e-mail')
      const telefone = heur('phone_number', 'telefone', 'phone', 'celular')

      // Define vendedor: round-robin se houver vendedor_ids, senão fixo
      let vendedorId: string | null = null
      if (mapping?.vendedor_ids && Array.isArray(mapping.vendedor_ids) && mapping.vendedor_ids.length > 0) {
        const { data: rr } = await supabaseAdmin().rpc('meta_proximo_vendedor', { p_form_id: String(linha.form_id) })
        vendedorId = (rr as any) || mapping.vendedor_ids[0]
      } else {
        vendedorId = mapping?.vendedor_id || null
      }

      // Cria negócio (sem cliente). cliente_id fica null — a coluna é nullable.
      let negocioId: string | null = null
      const deveCriarNegocio = mapping ? mapping.criar_negocio !== false : true
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
          const negPayload: any = {
            cliente_id:        null,
            funil_id:          funilId,
            etapa:             etapaInicial!,
            titulo:            tituloComposto || negBase.titulo || `Lead Meta · ${nome || email || telefone || 'sem nome'}`,
            fonte:             negBase.fonte  || 'Meta Ads',
            obs:               campos.length ? campos.map((c: any) => `${c.name}: ${(c.values || []).join(', ')}`).join('\n') : null,
            corretor_id:       vendedorId,
            vendedor_id:       vendedorId,
            meta_campaign_id:  linha.campanha_id || null,
            meta_ad_id:        linha.ad_id || null,
          }
          // Aplica negBase (sobrescreve defaults se mapeado), exceto titulo
          // (já resolvido acima com prioridade para titulo_campos).
          for (const [k, v] of Object.entries(negBase)) {
            if (v == null || v === '') continue
            if (k === 'titulo') continue
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

      // Grava o lead (sem cliente_id — nenhum cliente é criado/associado)
      await supabaseAdmin().from('meta_leads').insert({
        meta_lead_id:  linha.meta_lead_id,
        form_id:       linha.form_id,
        ad_id:         linha.ad_id,
        adset_id:      linha.adset_id,
        campanha_id:   linha.campanha_id || null,
        page_id:       linha.page_id,
        campos:        linha.campos,
        cliente_id:    null,
        negocio_id:    negocioId,
        vendedor_id:   vendedorId,
        processado_em: new Date().toISOString(),
      })

      recebidos.push({ leadgenId, negocioId })
    }
  }

  return NextResponse.json({ ok: true, recebidos: recebidos.length })
}
