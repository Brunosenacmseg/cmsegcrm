// Pipeline compartilhado de processamento de leads do Meta Lead Ads.
//
// O webhook (`/api/meta/webhook`) e o endpoint de teste
// (`/api/meta/webhook/test`) chamam `processarLeadgen()` com a mesma
// estrutura de dados que a Meta entrega — assim o caminho de criação de
// cliente + negociação é exatamente o mesmo em produção e em teste.
//
// Mantém-se aqui também a aplicação do `campo_map` (com prefixos
// `cliente:`, `cliente_cf:`, `negocio:`, `negocio_cf:`) e a heurística de
// fallback para os campos básicos (nome/email/telefone/cpf).

import type { SupabaseClient } from '@supabase/supabase-js'

export type MetaFieldData = { name: string; values: string[] }

export type LeadgenInput = {
  leadgenId: string
  formId: string | null
  adId?: string | null
  adsetId?: string | null
  campaignId?: string | null
  pageId?: string | null
  fieldData: MetaFieldData[] | null
}

export type LeadgenResult = {
  ok: boolean
  clienteId: string | null
  negocioId: string | null
  metaLeadId: string | null
  vendedorId: string | null
  motivo?: string
  erros: string[]
}

export async function processarLeadgen(
  sa: SupabaseClient,
  input: LeadgenInput,
): Promise<LeadgenResult> {
  const erros: string[] = []
  const log = (...a: any[]) => console.log('[meta-lead]', input.leadgenId, ...a)
  const logErr = (msg: string, e?: any) => {
    const detail = e?.message || (typeof e === 'string' ? e : e ? JSON.stringify(e) : '')
    erros.push(detail ? `${msg}: ${detail}` : msg)
    console.error('[meta-lead]', input.leadgenId, msg, e || '')
  }

  // 1) Carrega mapeamento do formulário (se houver)
  let mapping: any = null
  if (input.formId) {
    const { data: m, error } = await sa.from('meta_form_mapeamento')
      .select('*').eq('form_id', String(input.formId)).maybeSingle()
    if (error) logErr('falha ao carregar mapeamento', error)
    if (m && (m as any).ativo !== false) mapping = m
  }
  const campoMap: Record<string, any> =
    (mapping?.campo_map && typeof mapping.campo_map === 'object') ? mapping.campo_map : {}

  // 2) Extrai valores do field_data
  const campos = Array.isArray(input.fieldData) ? input.fieldData : []
  const valorPorKey: Record<string, string> = {}
  for (const c of campos) {
    const k = (c?.name || '').toString()
    const v = Array.isArray(c.values) && c.values[0] ? String(c.values[0]).trim() : ''
    if (k && v) valorPorKey[k] = v
  }
  const heur = (...keys: string[]) => {
    for (const k of keys) {
      const f = campos.find((x: any) => (x?.name || '').toLowerCase().includes(k))
      if (f && Array.isArray(f.values) && f.values[0]) return String(f.values[0]).trim()
    }
    return null
  }

  // 3) Aplica campo_map → cliBase / cliCustom / negBase / negCustom
  const cliBase: Record<string, any> = {}
  const cliCustom: Record<string, any> = {}
  const negBase: Record<string, any> = {}
  const negCustom: Record<string, any> = {}
  const aplicar = (target: any, v: string) => {
    if (!target || typeof target !== 'string') return
    if (target.startsWith('cliente_cf:'))      cliCustom[target.slice(11)] = v
    else if (target.startsWith('cliente:'))    cliBase[target.slice(8)]    = v
    else if (target.startsWith('negocio_cf:')) negCustom[target.slice(11)] = v
    else if (target.startsWith('negocio:'))    negBase[target.slice(8)]    = v
    else                                       cliBase[target]             = v
  }
  for (const [formKey, target] of Object.entries(campoMap)) {
    const v = valorPorKey[formKey]
    if (!v) continue
    if (typeof target === 'string') {
      aplicar(target, v)
    } else if (target && typeof target === 'object') {
      aplicar((target as any).cliente, v)
      aplicar((target as any).negocio, v)
    }
  }

  // 4) Heurísticas de fallback para campos essenciais
  const nome     = cliBase.nome     || heur('full_name', 'nome', 'name')
  const email    = cliBase.email    || heur('email', 'e-mail')
  const telefone = cliBase.telefone || heur('phone_number', 'telefone', 'phone', 'celular')
  const cpf      = cliBase.cpf_cnpj || heur('cpf')
  const cnpj     = (!cliBase.cpf_cnpj) ? heur('cnpj') : null

  // 5) Busca cliente existente (email > cpf/cnpj > telefone) ou prepara para criar
  let clienteId: string | null = null
  const tenta = async (col: string, val: string | null) => {
    if (!val) return null
    const { data, error } = await sa.from('clientes').select('id').eq(col, val).limit(1).maybeSingle()
    if (error) logErr(`busca cliente por ${col}`, error)
    return (data as any)?.id || null
  }
  clienteId = await tenta('email', email?.toLowerCase() || null)
        || await tenta('cpf_cnpj', (cpf || cnpj))
        || await tenta('telefone', telefone)

  // 6) Monta payload do cliente e cria/atualiza
  const payloadCliente: any = {
    ...cliBase,
    nome:     cliBase.nome || nome || email || telefone || 'Lead Meta sem nome',
    tipo:     (String(cliBase.cpf_cnpj || '').replace(/\D/g,'').length === 14 || cnpj) ? 'PJ' : 'PF',
    cpf_cnpj: cliBase.cpf_cnpj || cpf || cnpj || null,
    email:    (cliBase.email || email || '').toLowerCase() || null,
    telefone: cliBase.telefone || telefone || null,
    fonte:    cliBase.fonte || 'Meta Ads',
    meta_lead_id:     input.leadgenId || null,
    meta_campaign_id: input.campaignId || null,
    meta_adset_id:    input.adsetId || null,
    meta_ad_id:       input.adId || null,
    meta_form_id:     input.formId || null,
  }
  if (Object.keys(cliCustom).length) payloadCliente.custom_fields = cliCustom

  if (!clienteId) {
    const { data: novo, error } = await sa.from('clientes').insert(payloadCliente).select('id').single()
    if (error) logErr('insert cliente falhou', error)
    clienteId = (novo as any)?.id || null
  } else {
    const { data: cur, error: errCur } = await sa.from('clientes').select('custom_fields').eq('id', clienteId).maybeSingle()
    if (errCur) logErr('select custom_fields cliente', errCur)
    const upd: any = {}
    for (const [k, v] of Object.entries(payloadCliente)) {
      if (k === 'custom_fields') continue
      if (v != null && v !== '') upd[k] = v
    }
    if (Object.keys(cliCustom).length) {
      upd.custom_fields = { ...((cur as any)?.custom_fields || {}), ...cliCustom }
    }
    const { error } = await sa.from('clientes').update(upd).eq('id', clienteId)
    if (error) logErr('update cliente falhou', error)
  }

  if (!clienteId) {
    log('cliente não pôde ser criado — abortando criação de negociação')
    return { ok: false, clienteId: null, negocioId: null, metaLeadId: input.leadgenId, vendedorId: null, motivo: 'cliente_falhou', erros }
  }

  // 7) Distribuição (round-robin) de vendedor
  let vendedorId: string | null = null
  if (mapping?.vendedor_ids && Array.isArray(mapping.vendedor_ids) && mapping.vendedor_ids.length > 0) {
    const { data: rr, error } = await sa.rpc('meta_proximo_vendedor', { p_form_id: String(input.formId || '') })
    if (error) logErr('rpc meta_proximo_vendedor', error)
    vendedorId = (rr as any) || mapping.vendedor_ids[0]
  } else {
    vendedorId = mapping?.vendedor_id || null
  }

  // 8) Cria a negociação se permitido
  let negocioId: string | null = null
  const deveCriarNegocio = !!clienteId && (mapping ? mapping.criar_negocio !== false : true)
  if (!deveCriarNegocio) {
    log('mapeamento desabilitou criação de negociação')
  } else {
    let funilId: string | null = mapping?.funil_id || null
    let etapaInicial: string | null = mapping?.etapa || null

    if (!funilId) {
      const { data: funil, error } = await sa.from('funis')
        .select('id, etapas').eq('tipo', 'venda').order('ordem').limit(1).maybeSingle()
      if (error) logErr('busca funil padrão', error)
      if (funil) {
        funilId = (funil as any).id
        etapaInicial = ((funil as any).etapas as string[])?.[0] || 'Novo'
      }
    } else if (!etapaInicial) {
      const { data: funil, error } = await sa.from('funis').select('etapas').eq('id', funilId).maybeSingle()
      if (error) logErr('busca etapas do funil', error)
      etapaInicial = ((funil as any)?.etapas as string[])?.[0] || 'Novo'
    }

    if (!funilId) {
      logErr('nenhum funil de venda encontrado — não foi possível criar negociação')
    } else {
      const negPayload: any = {
        cliente_id:        clienteId,
        funil_id:          funilId,
        etapa:             etapaInicial!,
        titulo:            negBase.titulo || `Lead Meta · ${nome || email || telefone || 'sem nome'}`,
        fonte:             negBase.fonte  || 'Meta Ads',
        obs:               campos.length ? campos.map((c: any) => `${c.name}: ${(c.values || []).join(', ')}`).join('\n') : null,
        corretor_id:       vendedorId,
        vendedor_id:       vendedorId,
        meta_campaign_id:  input.campaignId || null,
        meta_ad_id:        input.adId || null,
      }
      for (const [k, v] of Object.entries(negBase)) {
        if (v == null || v === '') continue
        if (k === 'premio' || k === 'comissao_pct') {
          const n = Number(String(v).replace(/[^\d,.-]/g,'').replace(',', '.'))
          if (isFinite(n)) negPayload[k] = n
        } else negPayload[k] = v
      }
      if (Object.keys(negCustom).length) negPayload.custom_fields = negCustom

      const { data: neg, error } = await sa.from('negocios').insert(negPayload).select('id').single()
      if (error) logErr('insert negocio falhou', error)
      negocioId = (neg as any)?.id || null
    }
  }

  // 9) Persiste o lead em meta_leads para auditoria
  const { error: errLead } = await sa.from('meta_leads').insert({
    meta_lead_id:  input.leadgenId,
    form_id:       input.formId,
    ad_id:         input.adId || null,
    adset_id:      input.adsetId || null,
    campanha_id:   input.campaignId || null,
    page_id:       input.pageId || null,
    campos:        input.fieldData || null,
    cliente_id:    clienteId,
    negocio_id:    negocioId,
    vendedor_id:   vendedorId,
    processado_em: new Date().toISOString(),
  })
  if (errLead) logErr('insert meta_leads falhou', errLead)

  return {
    ok: !!clienteId && (deveCriarNegocio ? !!negocioId : true),
    clienteId,
    negocioId,
    metaLeadId: input.leadgenId,
    vendedorId,
    erros,
  }
}
