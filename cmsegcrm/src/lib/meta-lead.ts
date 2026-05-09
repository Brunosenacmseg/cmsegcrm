// Pipeline compartilhado de processamento de leads do Meta Lead Ads.
//
// O webhook (`/api/meta/webhook`) e o endpoint de teste
// (`/api/meta/webhook/test`) chamam `processarLeadgen()` com a mesma
// estrutura de dados que a Meta entrega — assim o caminho de criação da
// negociação é exatamente o mesmo em produção e em teste.
//
// Esta integração cria APENAS a negociação. Nenhum cliente é criado ou
// atualizado — o `cliente_id` da negociação fica nulo (a coluna é
// nullable). Mapeamentos legados que apontavam para `cliente:*` são
// ignorados.
//
// Mapeamento de origem para cada coluna da negociação:
//   1. campo_negocio_map (preferido): { "negocio:titulo": ["__meta__:campaign_name", "first_name"], ... }
//      — concatena os valores resolvidos com " - " na ordem informada.
//   2. titulo_campos (legado, só para o título): mesma semântica do campo_negocio_map
//      restrita à coluna titulo.
//   3. campo_map (legado): { formKey: { negocio: "negocio:col" } } — preenche
//      colunas ainda não definidas pelos mapas mais novos.
//
// Além das chaves vindas do form, o webhook expõe metadados da Meta como
// origens disponíveis em `valorPorKey`:
//   __meta__:campaign_id / campaign_name
//   __meta__:adset_id    / adset_name
//   __meta__:ad_id       / ad_name
//   __meta__:form_id     / form_name
//   __meta__:page_id
//   __meta__:lead_id

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
  // Erros do supabase-js trazem `code`, `details` e `hint` além de `message`.
  // Antes só guardávamos `message`, perdendo o code (PGRST116 / 23502 / 42501)
  // que é o que costuma diferenciar "RLS bloqueou" de "constraint violada"
  // de "tabela inexistente" — informação crítica em testes do webhook.
  const logErr = (msg: string, e?: any) => {
    const partes: string[] = [msg]
    if (e) {
      const code = e?.code || e?.status
      if (code) partes.push(`[${code}]`)
      const m = e?.message || (typeof e === 'string' ? e : '')
      if (m) partes.push(m)
      if (e?.details) partes.push(`details=${e.details}`)
      if (e?.hint)    partes.push(`hint=${e.hint}`)
      if (!m && !e?.details && !e?.hint && typeof e !== 'string') {
        try { partes.push(JSON.stringify(e)) } catch { /* ignore */ }
      }
    }
    erros.push(partes.join(' '))
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

  // 3) Enriquece valorPorKey com metadados da Meta — disponíveis para uso
  //    tanto em campo_negocio_map quanto em titulo_campos.
  const setMeta = (k: string, v: string | null | undefined) => {
    if (v != null && String(v).trim() !== '') valorPorKey[k] = String(v).trim()
  }
  setMeta('__meta__:campaign_id', input.campaignId)
  setMeta('__meta__:adset_id',    input.adsetId)
  setMeta('__meta__:ad_id',       input.adId)
  setMeta('__meta__:form_id',     input.formId)
  setMeta('__meta__:page_id',     input.pageId)
  setMeta('__meta__:lead_id',     input.leadgenId)
  setMeta('__meta__:form_name',   mapping?.form_nome)
  if (input.campaignId) {
    const { data: row } = await sa.from('meta_campanhas')
      .select('nome').eq('meta_id', String(input.campaignId)).maybeSingle()
    setMeta('__meta__:campaign_name', (row as any)?.nome)
  }
  if (input.adsetId) {
    const { data: row } = await sa.from('meta_adsets')
      .select('nome').eq('meta_id', String(input.adsetId)).maybeSingle()
    setMeta('__meta__:adset_name', (row as any)?.nome)
  }
  if (input.adId) {
    const { data: row } = await sa.from('meta_ads')
      .select('nome').eq('meta_id', String(input.adId)).maybeSingle()
    setMeta('__meta__:ad_name', (row as any)?.nome)
  }

  // 4) Resolve colunas da negociação a partir dos mapeamentos disponíveis.
  const negBase: Record<string, any> = {}
  const negCustom: Record<string, any> = {}
  const aplicarColuna = (colKey: string, valor: string) => {
    if (!colKey || valor == null || valor === '') return
    if (colKey.startsWith('negocio_cf:'))   negCustom[colKey.slice(11)] = valor
    else if (colKey.startsWith('negocio:')) negBase[colKey.slice(8)]    = valor
  }

  // 4a) Mapa novo: { coluna: [origens] } → concatena com " - "
  const negMap: Record<string, any> = (mapping?.campo_negocio_map && typeof mapping.campo_negocio_map === 'object') ? mapping.campo_negocio_map : {}
  for (const [colKey, srcKeys] of Object.entries(negMap)) {
    if (!Array.isArray(srcKeys)) continue
    const partes = srcKeys
      .map(k => valorPorKey[String(k)])
      .filter(v => v != null && v !== '')
    if (partes.length) aplicarColuna(colKey, partes.join(' - '))
  }

  // 4b) Legado campo_map ({ formKey: { negocio: "negocio:col" } }) — só
  //     preenche colunas que ainda não vieram do mapa novo. Prefixos
  //     cliente:/cliente_cf: e sem prefixo são ignorados (esta integração
  //     não cria nem atualiza clientes).
  const campoMap: Record<string, any> =
    (mapping?.campo_map && typeof mapping.campo_map === 'object') ? mapping.campo_map : {}
  const aplicarLegado = (target: any, v: string) => {
    if (!target || typeof target !== 'string') return
    if (target.startsWith('negocio_cf:')) {
      const k = target.slice(11)
      if (!(k in negCustom)) negCustom[k] = v
    } else if (target.startsWith('negocio:')) {
      const k = target.slice(8)
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

  // 5) Compõe título: prioriza o que veio do mapa novo (negBase.titulo);
  //    senão usa titulo_campos legado; senão usa heurística.
  let tituloComposto: string | null = negBase.titulo || null
  if (!tituloComposto) {
    const tituloCampos: string[] = Array.isArray(mapping?.titulo_campos) ? mapping.titulo_campos : []
    if (tituloCampos.length > 0) {
      const partes = tituloCampos.map(k => valorPorKey[k]).filter(v => v != null && v !== '')
      if (partes.length) tituloComposto = partes.join(' - ')
    }
  }
  const nome     = heur('full_name', 'nome', 'name')
  const email    = heur('email', 'e-mail')
  const telefone = heur('phone_number', 'telefone', 'phone', 'celular')

  // 6) Distribuição (round-robin) de vendedor
  let vendedorId: string | null = null
  if (mapping?.vendedor_ids && Array.isArray(mapping.vendedor_ids) && mapping.vendedor_ids.length > 0) {
    const { data: rr, error } = await sa.rpc('meta_proximo_vendedor', { p_form_id: String(input.formId || '') })
    if (error) logErr('rpc meta_proximo_vendedor', error)
    vendedorId = (rr as any) || mapping.vendedor_ids[0]
  } else {
    vendedorId = mapping?.vendedor_id || null
  }

  // 7) Cria a negociação se permitido. Sem cliente_id (nullable).
  let negocioId: string | null = null
  const deveCriarNegocio = mapping ? mapping.criar_negocio !== false : true
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
        cliente_id:        null,
        funil_id:          funilId,
        etapa:             etapaInicial!,
        titulo:            tituloComposto || `Lead Meta · ${nome || email || telefone || 'sem nome'}`,
        fonte:             negBase.fonte  || 'Meta Ads',
        obs:               campos.length ? campos.map((c: any) => `${c.name}: ${(c.values || []).join(', ')}`).join('\n') : null,
        corretor_id:       vendedorId,
        vendedor_id:       vendedorId,
        meta_campaign_id:  input.campaignId || null,
        meta_ad_id:        input.adId || null,
      }
      // Aplica negBase (sobrescreve defaults), exceto titulo (já resolvido).
      for (const [k, v] of Object.entries(negBase)) {
        if (v == null || v === '') continue
        if (k === 'titulo') continue
        if (k === 'premio' || k === 'comissao_pct') {
          const n = Number(String(v).replace(/[^\d,.-]/g,'').replace(',', '.'))
          if (isFinite(n)) negPayload[k] = n
        } else negPayload[k] = v
      }
      if (Object.keys(negCustom).length) negPayload.custom_fields = negCustom

      // `.maybeSingle()` em vez de `.single()` para distinguir "insert ok mas
      // SELECT vazio (RLS)" de "insert falhou": o primeiro caso retorna
      // data=null sem erro com `.single()`, fazendo a falha passar batido.
      // try/catch protege contra exceções de rede/timeout que de outra forma
      // viram erro 500 sem nenhum log no Vercel.
      try {
        const { data: neg, error } = await sa.from('negocios').insert(negPayload).select('id').maybeSingle()
        if (error) {
          logErr('insert negocio falhou', error)
        } else if (!neg) {
          logErr('insert negocio retornou vazio (provável RLS bloqueando SELECT após INSERT — verifique service_role e policy de negocios)')
        } else {
          negocioId = (neg as any).id || null
        }
      } catch (e) {
        logErr('insert negocio threw', e)
      }
    }
  }

  // 8) Persiste o lead em meta_leads para auditoria (sem cliente_id)
  const { error: errLead } = await sa.from('meta_leads').insert({
    meta_lead_id:  input.leadgenId,
    form_id:       input.formId,
    ad_id:         input.adId || null,
    adset_id:      input.adsetId || null,
    campanha_id:   input.campaignId || null,
    page_id:       input.pageId || null,
    campos:        input.fieldData || null,
    cliente_id:    null,
    negocio_id:    negocioId,
    vendedor_id:   vendedorId,
    processado_em: new Date().toISOString(),
  })
  if (errLead) logErr('insert meta_leads falhou', errLead)

  return {
    ok: deveCriarNegocio ? !!negocioId : true,
    clienteId: null,
    negocioId,
    metaLeadId: input.leadgenId,
    vendedorId,
    erros,
  }
}
