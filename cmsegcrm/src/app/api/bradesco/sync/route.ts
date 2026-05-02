import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'
export const maxDuration = 300

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── Helpers ──────────────────────────────────────────────────
function digits(s: string): string { return (s||'').replace(/\D/g, '') }

function num(s: string): number | null {
  if (s == null) return null
  const t = String(s).trim().replace(/\s/g, '')
  if (!t) return null
  // Aceita "1.234,56", "1234.56", "123456" (centavos quando inteiro grande sem separador)
  let v: number
  if (/[.,]/.test(t)) {
    const lastComma = t.lastIndexOf(',')
    const lastDot   = t.lastIndexOf('.')
    if (lastComma > lastDot) v = parseFloat(t.replace(/\./g, '').replace(',', '.'))
    else                     v = parseFloat(t.replace(/,/g, ''))
  } else {
    v = parseFloat(t)
  }
  return isNaN(v) ? null : v
}

function toDate(s: string): string | null {
  if (!s) return null
  const t = String(s).trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);   if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);     if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = t.match(/^(\d{2})-(\d{2})-(\d{4})/);       if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})/);     if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = t.match(/^(\d{4})(\d{2})(\d{2})$/);        if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{2})(\d{2})(\d{4})$/);        if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

// Detecta o melhor separador de uma linha
function detectarSep(linha: string): string {
  const cands = ['|', ';', '\t']
  let best = '|', max = 0
  for (const c of cands) {
    const n = linha.split(c).length
    if (n > max) { max = n; best = c }
  }
  return max > 1 ? best : '|'
}

function parseLinhas(texto: string): string[][] {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!linhas.length) return []
  const sep = detectarSep(linhas[0])
  return linhas.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')))
}

// Pula uma linha de cabeçalho se a primeira coluna não for numérica
function pularCabecalho(linhas: string[][], primeiraColNumerica: boolean): string[][] {
  if (!linhas.length) return linhas
  if (!primeiraColNumerica) return linhas
  const primeiro = linhas[0][0] || ''
  if (/^\d+$/.test(digits(primeiro))) return linhas
  return linhas.slice(1)
}

// ─── Cliente helper ──────────────────────────────────────────
async function obterOuCriarCliente(opts: {
  cpfCnpj?: string; nome?: string; tipo?: 'PF'|'PJ'; email?: string; telefone?: string; dadosBrutos?: any
}): Promise<string | null> {
  const { cpfCnpj, nome, email, telefone, dadosBrutos } = opts
  if (!cpfCnpj && !nome) return null
  if (cpfCnpj) {
    const { data } = await supabaseAdmin.from('clientes').select('id, nome').eq('cpf_cnpj', cpfCnpj).maybeSingle()
    if (data?.id) {
      if (nome && (!data.nome || data.nome === 'Sem nome')) {
        await supabaseAdmin.from('clientes').update({ nome }).eq('id', data.id)
      }
      return data.id
    }
  }
  if (!cpfCnpj && nome) {
    const { data } = await supabaseAdmin.from('clientes').select('id').ilike('nome', nome).maybeSingle()
    if (data?.id) return data.id
  }
  const tipo = opts.tipo || (cpfCnpj && cpfCnpj.length === 14 ? 'PJ' : 'PF')
  const payload: any = {
    nome:     nome || (cpfCnpj ? `Cliente ${cpfCnpj}` : 'Cliente Bradesco'),
    tipo,
    cpf_cnpj: cpfCnpj || null,
    fonte:    'Bradesco Seguros',
    email:    email || null,
    telefone: telefone || null,
  }
  if (dadosBrutos) payload.dados_bradesco = dadosBrutos
  const { data, error } = await supabaseAdmin.from('clientes').insert(payload).select('id').single()
  if (error) { console.warn('[Bradesco] erro criando cliente:', error.message); return null }
  return data?.id || null
}

async function buscarApolicePorNumero(numero: string) {
  if (!numero) return null
  const limpo = numero.replace(/^0+/, '') || numero
  const { data } = await supabaseAdmin.from('apolices')
    .select('id, cliente_id, vendedor_id, numero, premio')
    .or(`numero.eq.${numero},numero.eq.${limpo}`)
    .maybeSingle()
  return data
}

// ─── Layouts InfoSeguro: ordem dos campos por tipo ───────────
// Acesso por índice baseado na ORDEM da documentação. Útil quando o
// arquivo não traz cabeçalho.
const LAYOUTS: Record<string, string[]> = {
  // 1 — Parcelas Pagas
  PARCELAS_PAGAS: [
    'PAG_CD_SUC','PAG_CD_CORRETOR','PAG_DT_VENC','PAG_CD_CIA','PAG_CD_RAMO',
    'PAG_CD_APOL','PAG_CD_ITEM','PAG_NM_SEGURADO','PAG_NO_PRESTACAO','PAG_NO_ENDOSSO',
    'PAG_DT_BAIXA','PAG_VL_PAGO','CCNPJ_CIA_SEGDR','ICIA_SEGDR','ISUCUR',
    'DTINIC_VIGCIA','DTFIM_VIGCIA','CNRO_PPSTA_APOLC','VPRMIO_LIQ_PREST','VADCIO_FRCTO_PREST',
    'VASSTN_TECNC','PTOT_PRMIO_SEGUR','VCOMIS_CRRTR_PG','VCOMIS_CRRTR_BR','CCPF_CNPJ_CLI',
    'CCHASI_CARRO','CTLEMP','CCONTR_ESPCL_AUTO',
  ],
  // 2 — Parcelas a Vencer
  PARCELAS_VENCER: [
    'VEN_CD_SUC','VEN_CD_CORRETOR','VEN_DT_VENC','VEN_CD_CIA','VEN_CD_RAMO',
    'VEN_NO_APOLICE','VEN_CD_ITEM','VEN_NO_ENDOSSO','VEN_NM_SEGURADO','VEN_NO_PRESTACAO',
    'VEN_VL_PRESTACAO','CCNPJ_CIA_SEGDR','ICIA_SEGDR','ISUCUR','DT_INICO_VGCIA',
    'DT_FIM_VGCIA','CNRO_PPSTA_APOLC','CCONTR_ESPCL_AUTO',
  ],
  // 3 — Parcelas Pendentes
  PARCELAS_PENDENTES: [
    'PEN_CD_SUC','PEN_CD_CORRETOR','PEN_DT_VENC','PEND_CD_CIA','PEN_CD_RAMO',
    'PEND_CD_APOL','PEND_CD_ITEM','PEN_NO_ENDOSSO','PEN_NM_SEGURADO','PEN_NO_PRESTACAO',
    'PEN_VL_PRESTACAO','PEN_NO_DIAS_PEND','CCNPJ_CIA_SEGDR','ICIA_SGDR','PEN_NM_SUCURSAL',
    'DTINIC_VGCIA','DTFIM_VGCIA','CNRO_PPSTA_APOLC','CCONTR_ESPCL_AUTO',
  ],
  // 4 — Seguros Emitidos
  EMITIDOS: [
    'CCNPJ_CIA_SEGRD','CCIA_SEGRD','CSUCUR_SEGDR','CCRRTR','CRAMO_APOLC','DEMIS_APOLC',
    'ICIA_SEGDR','ISUCUR','CAPOLC','CITEM_APOLC','DINIC_VGCIA','DFIM_VGCIA','ISEGRD',
    'CNRO_PPSTA_APOLC','VTOT_PRMIO_SEGUR','CCPF_CNPJ','QPREST_PRMIO_PG','CHASI_VEIC',
    'PFATOR_AJUST_MERCD','CCONTR_ESPCL_AUTO',
    'DVCTO_PCELA_1','DVCTO_PCELA_2','DVCTO_PCELA_3','DVCTO_PCELA_4','DVCTO_PCELA_5','DVCTO_PCELA_6',
    'DVCTO_PCELA_7','DVCTO_PCELA_8','DVCTO_PCELA_9','DVCTO_PCELA_10','DVCTO_PCELA_11','DVCTO_PCELA_12',
    'CIDTFD_APOLC',
  ],
  // 5 — Seguros Cancelados
  CANCELADOS: [
    'CCNPJ_CIA_SEGDR','CCIA_SEGDR','CSUCUR_SEGDR','CCRRTR','CRAMO_APOLC','DCANCT_APOLC',
    'ICIA_SEGDR','ISUCUR','CAPOLC','CITEM_APOLC','CNRO_ENDSS_VEIC','DINIC_VGCIA','DFIM_VGCIA',
    'ISEGRD','CPLACA_VEIC','CCHASI_VEIC','PBONUS_CASCO_VEIC','CMOTVO_CANCT_APOLC',
    'RMOVTO_CANCT_ACSSO','CNRO_PPSTA_APOLC','VAPOC_RSTIR','CCONTR_ESPCL_AUTO',
  ],
  // 6 — Sinistros
  SINISTROS: [
    'CCNPJ_CIA_SEGDR','CCIA_SEGDR','CSUCUR_SEGDR','CCRRTR','CRAMO_APOLC','DNATUZ_SNIST',
    'ICIA_SEGDR','ISUCUR','CAPOLC','CITEM_APOLC','CNRO_ENDSS_VEIC','DINIC_VGCIA','DFIM_VGCIA',
    'ISEGRD','CPLACA_VEIC','CCHASI_VEIC','PBONUS_CASCO_VEIC','CNATUZ_SNIST','RNATUZ_SNIST',
    'VINDNZ_SNIST','CNRO_PPSTA_APOLC','DABERT_SNIST','DENCRR_SNIST','CUF','CCONTR_ESPCL_AUTO',
  ],
  // 11 — Extrato de Comissões
  COMISSOES: [
    'NCO_CPF_CGC','NCO_TP_PESSOA','NCO_NCOR','NCO_SUC','NCO_CIA','NCO_AMD_COBRANCA',
    'NCO_RAMO','NCO_APOL','NCO_ITEM','NCO_ENDOS','NCO_PREST','NCO_FAT_COMIS','NCO_TIPO',
    'NCO_PREMIO','NCO_COMIS','NCO_PERC','NCO_CODREST','NCO_NM_SEGURADO','NCO_NR_PROPOSTA',
    'NCO_NR_OCT','NCO_NR_CHASSI','NCO_NR_LICENCA','NCO_CPF_SEGURADO','NSE_VL_ISS','NSE_VL_IR',
    'NSE_LIQ_RECEBER','NSE_VL_ISSA','NSE_VL_IRA','NSE_VL_COMISA','NSE_NR_CHEQUE','NSE_TOT_COMISSAO',
    'NSE_CONTA_CORRETOR','NSE_CD_AGENCIA','NSE_CD_BANCO','NSE_TP_PAGTO','NSE_NM_SUCURSAL',
    'NSE_NM_CORRETOR','NSE_NM_BANCO','NSE_NM_AGENCIA','NRO_PPSTA_CRRTR','CCONTR_ESPCL_AUTO',
    'CIND_VAR_POSTV_CMBIO',
  ],
}

function get(linha: string[], campos: string[], nome: string): string {
  const i = campos.indexOf(nome)
  if (i < 0 || i >= linha.length) return ''
  return linha[i] || ''
}

// ─── Processadores por tipo ──────────────────────────────────

async function processarParcelas(linhas: string[][], tipo: 'PARCELAS_PAGAS'|'PARCELAS_VENCER'|'PARCELAS_PENDENTES') {
  const campos = LAYOUTS[tipo]
  const dados = pularCabecalho(linhas, true)
  let importados = 0, erros = 0
  const msgs: string[] = []

  for (const linha of dados) {
    try {
      const apolNum = get(linha, campos, tipo === 'PARCELAS_VENCER' ? 'VEN_NO_APOLICE'
                       : tipo === 'PARCELAS_PAGAS' ? 'PAG_CD_APOL' : 'PEND_CD_APOL')
      const venc    = toDate(get(linha, campos, tipo === 'PARCELAS_VENCER' ? 'VEN_DT_VENC'
                       : tipo === 'PARCELAS_PAGAS' ? 'PAG_DT_VENC' : 'PEN_DT_VENC'))
      const nome    = get(linha, campos, tipo === 'PARCELAS_VENCER' ? 'VEN_NM_SEGURADO'
                       : tipo === 'PARCELAS_PAGAS' ? 'PAG_NM_SEGURADO' : 'PEN_NM_SEGURADO')
      const numParc = get(linha, campos, tipo === 'PARCELAS_VENCER' ? 'VEN_NO_PRESTACAO'
                       : tipo === 'PARCELAS_PAGAS' ? 'PAG_NO_PRESTACAO' : 'PEN_NO_PRESTACAO')
      const numEnd  = get(linha, campos, tipo === 'PARCELAS_VENCER' ? 'VEN_NO_ENDOSSO'
                       : tipo === 'PARCELAS_PAGAS' ? 'PAG_NO_ENDOSSO' : 'PEN_NO_ENDOSSO')
      const cpfCnpj = digits(tipo === 'PARCELAS_PAGAS' ? get(linha, campos, 'CCPF_CNPJ_CLI') : '')

      let valor: number | null = null
      let dataPag: string | null = null
      let proposta = ''
      if (tipo === 'PARCELAS_PAGAS') {
        valor = num(get(linha, campos, 'PAG_VL_PAGO'))
        dataPag = toDate(get(linha, campos, 'PAG_DT_BAIXA'))
        proposta = get(linha, campos, 'CNRO_PPSTA_APOLC')
      } else if (tipo === 'PARCELAS_VENCER') {
        valor = num(get(linha, campos, 'VEN_VL_PRESTACAO'))
        proposta = get(linha, campos, 'CNRO_PPSTA_APOLC')
      } else {
        valor = num(get(linha, campos, 'PEN_VL_PRESTACAO'))
        proposta = get(linha, campos, 'CNRO_PPSTA_APOLC')
      }
      if (!venc || !apolNum) { erros++; msgs.push(`linha sem apólice/venc`); continue }

      const apolice = await buscarApolicePorNumero(apolNum)
      const clienteId = apolice?.cliente_id
        || await obterOuCriarCliente({ cpfCnpj, nome, dadosBrutos: { apolNum, numParc, proposta } })

      const status =
        tipo === 'PARCELAS_PAGAS' ? 'pago'
        : tipo === 'PARCELAS_PENDENTES' ? 'atrasado'
        : 'pendente'

      const conta: any = {
        tipo:        'conta',
        nome:        `Bradesco — Apólice ${apolNum} parc ${numParc}`,
        valor:       valor || 0,
        vencimento:  venc,
        descricao:   `Parcela ${numParc} | Apólice ${apolNum}${numEnd?` | Endosso ${numEnd}`:''} | ${nome||''}${proposta?` | Proposta ${proposta}`:''}`.trim(),
        status,
        fornecedor:  'Bradesco Seguros',
        data_pagamento: dataPag,
      }

      const { data: existing } = await supabaseAdmin.from('contas_pagar')
        .select('id').ilike('nome', `%Apólice ${apolNum} parc ${numParc}%`)
        .eq('vencimento', venc).maybeSingle()

      if (existing?.id) {
        await supabaseAdmin.from('contas_pagar').update({
          status: conta.status, data_pagamento: conta.data_pagamento, valor: conta.valor,
        }).eq('id', existing.id)
      } else {
        const { error } = await supabaseAdmin.from('contas_pagar').insert(conta)
        if (error) { erros++; msgs.push(error.message?.slice(0,80)); continue }
      }

      if (tipo !== 'PARCELAS_PAGAS' && apolice?.vendedor_id && clienteId) {
        const dias = Math.floor((new Date(venc).getTime() - Date.now()) / 86400000)
        if (dias <= 7) {
          await supabaseAdmin.from('tarefas').insert({
            titulo: `💸 Parcela Bradesco: Apólice ${apolNum}`,
            descricao: `Parcela ${numParc} | R$ ${(valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})} | Venc: ${venc}`,
            tipo: 'ligacao', status: 'pendente',
            cliente_id: clienteId,
            responsavel_id: apolice.vendedor_id, criado_por: apolice.vendedor_id,
          })
        }
      }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

async function processarApoliceLinha(linha: string[], campos: string[], opts: {
  status: string; tipo: string; seguradora?: string;
}) {
  const numero  = get(linha, campos, 'CAPOLC') || get(linha, campos, 'CNRO_PPSTA_APOLC')
  if (!numero) return { ok: false, motivo: 'sem número' }
  const nome    = get(linha, campos, 'ISEGRD')
  const cpfCnpj = digits(get(linha, campos, 'CCPF_CNPJ'))
  const ramo    = get(linha, campos, 'CRAMO_APOLC')
  const proposta= get(linha, campos, 'CNRO_PPSTA_APOLC')
  const sucursal= get(linha, campos, 'CSUCUR_SEGDR')
  const placa   = get(linha, campos, 'CPLACA_VEIC')
  const chassi  = get(linha, campos, 'CHASI_VEIC') || get(linha, campos, 'CCHASI_VEIC')
  const vigIni  = toDate(get(linha, campos, 'DINIC_VGCIA'))
  const vigFim  = toDate(get(linha, campos, 'DFIM_VGCIA'))
  const emissao = toDate(get(linha, campos, 'DEMIS_APOLC') || get(linha, campos, 'DCANCT_APOLC'))
  const premio  = num(get(linha, campos, 'VTOT_PRMIO_SEGUR'))
  const qtdParc = parseInt(get(linha, campos, 'QPREST_PRMIO_PG') || '') || null
  const numContr= get(linha, campos, 'CCONTR_ESPCL_AUTO')

  const clienteId = await obterOuCriarCliente({
    cpfCnpj, nome,
    tipo: cpfCnpj && cpfCnpj.length === 14 ? 'PJ' : 'PF',
    dadosBrutos: { numero, proposta, sucursal, numContr },
  })

  const payload: any = {
    numero,
    seguradora:        opts.seguradora || 'Bradesco Seguros',
    fonte:             opts.seguradora || 'Bradesco Seguros',
    produto:           ramo || null,
    ramo:              ramo || null,
    proposta:          proposta || null,
    status:            opts.status,
    cliente_id:        clienteId,
    nome_segurado:     nome || null,
    cpf_cnpj_segurado: cpfCnpj || null,
    tipo_documento:    cpfCnpj && cpfCnpj.length === 14 ? 'CNPJ' : 'CPF',
    placa:             placa || null,
    chassi:            chassi || null,
    sucursal:          sucursal || null,
    numero_contrato:   numContr || null,
    vigencia_ini:      vigIni,
    vigencia_fim:      vigFim,
    emissao,
    premio,
    qtd_parcelas:      qtdParc,
    dados_bradesco:    { tipoArquivo: opts.tipo },
  }
  const { error } = await supabaseAdmin.from('apolices').upsert(payload, {
    onConflict: 'numero', ignoreDuplicates: false,
  })
  if (error) return { ok: false, motivo: error.message?.slice(0,80) }
  return { ok: true, numero }
}

async function processarApolices(linhas: string[][], tipo: 'EMITIDOS'|'CANCELADOS'|'RENOVAR'|'APOLICES_AUTO'|'PROPOSTAS_AUTO') {
  const layoutKey = (tipo === 'EMITIDOS' || tipo === 'CANCELADOS' || tipo === 'RENOVAR' || tipo === 'APOLICES_AUTO' || tipo === 'PROPOSTAS_AUTO')
    ? (LAYOUTS[tipo] ? tipo : 'EMITIDOS') : 'EMITIDOS'
  const campos = LAYOUTS[layoutKey] || LAYOUTS.EMITIDOS
  const dados = pularCabecalho(linhas, true)
  let importados = 0, erros = 0
  const msgs: string[] = []
  const status =
    tipo === 'CANCELADOS' ? 'cancelada'
    : tipo === 'RENOVAR' ? 'a_renovar'
    : tipo === 'PROPOSTAS_AUTO' ? 'proposta'
    : 'ativo'

  for (const linha of dados) {
    const r = await processarApoliceLinha(linha, campos, { status, tipo })
    if (r.ok) importados++; else { erros++; if (r.motivo) msgs.push(r.motivo) }
  }
  return { importados, erros, msgs }
}

async function processarSinistros(linhas: string[][]) {
  const campos = LAYOUTS.SINISTROS
  const dados = pularCabecalho(linhas, true)
  let importados = 0, erros = 0
  const msgs: string[] = []

  for (const linha of dados) {
    try {
      const apolNum = get(linha, campos, 'CAPOLC')
      const apolice = await buscarApolicePorNumero(apolNum)
      const placa   = get(linha, campos, 'CPLACA_VEIC')
      const chassi  = get(linha, campos, 'CCHASI_VEIC')
      const nome    = get(linha, campos, 'ISEGRD')

      const clienteId = apolice?.cliente_id || await obterOuCriarCliente({ nome })

      const payload: any = {
        apolice_id:     apolice?.id || null,
        cliente_id:     clienteId,
        numero_apolice: apolNum || null,
        numero_proposta: get(linha, campos, 'CNRO_PPSTA_APOLC') || null,
        data_ocorrencia: toDate(get(linha, campos, 'DNATUZ_SNIST')),
        data_abertura:   toDate(get(linha, campos, 'DABERT_SNIST')),
        data_encerramento: toDate(get(linha, campos, 'DENCRR_SNIST')),
        natureza_codigo:    get(linha, campos, 'CNATUZ_SNIST') || null,
        natureza_descricao: get(linha, campos, 'RNATUZ_SNIST') || null,
        uf:             get(linha, campos, 'CUF') || null,
        placa:          placa || null,
        chassi:         chassi || null,
        valor_indenizacao: num(get(linha, campos, 'VINDNZ_SNIST')),
        bonus_casco_pct:   num(get(linha, campos, 'PBONUS_CASCO_VEIC')),
        seguradora:    'Bradesco Seguros',
        fonte:         'Bradesco Seguros',
        dados_brutos:  { contrato: get(linha, campos, 'CCONTR_ESPCL_AUTO') },
      }
      const { error } = await supabaseAdmin.from('sinistros').insert(payload)
      if (error) { erros++; msgs.push(error.message?.slice(0,80)); continue }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

async function processarComissoes(linhas: string[][]) {
  const campos = LAYOUTS.COMISSOES
  const dados = pularCabecalho(linhas, true)
  let importados = 0, erros = 0
  const msgs: string[] = []

  const competencia = (toDate(dados[0]?.[campos.indexOf('NCO_AMD_COBRANCA')] || '') || new Date().toISOString()).slice(0,7)
  const total = dados.reduce((s, l) => s + (num(get(l, campos, 'NCO_COMIS')) || 0), 0)

  const { data: imp } = await supabaseAdmin.from('importacoes_comissao').insert({
    nome_arquivo: `bradesco-comissoes-${Date.now()}.txt`,
    competencia,
    qtd_registros: dados.length,
    total_importado: total,
    status: 'processado',
  }).select('id').single()

  for (const linha of dados) {
    try {
      const apolNum   = get(linha, campos, 'NCO_APOL')
      const numParc   = parseInt(get(linha, campos, 'NCO_PREST') || '1') || 1
      const valor     = num(get(linha, campos, 'NCO_COMIS')) || 0
      const pcCom     = num(get(linha, campos, 'NCO_PERC'))
      const dataPg    = toDate(get(linha, campos, 'NCO_AMD_COBRANCA'))
      const codRest   = (get(linha, campos, 'NCO_CODREST') || '').toUpperCase()
      const nome      = get(linha, campos, 'NCO_NM_SEGURADO')
      const proposta  = get(linha, campos, 'NCO_NR_PROPOSTA')
      const ramo      = get(linha, campos, 'NCO_RAMO')

      const apolice = await buscarApolicePorNumero(apolNum)
      const vendedorId = apolice?.vendedor_id
      if (!vendedorId) { erros++; msgs.push(`apólice ${apolNum}: sem vendedor`); continue }

      const obs = [
        nome, ramo && `Ramo ${ramo}`, proposta && `Proposta ${proposta}`,
        pcCom != null && `${pcCom}%`,
        codRest && `Restituição ${codRest}`,
      ].filter(Boolean).join(' | ')

      const { error } = await supabaseAdmin.from('comissoes_recebidas').insert({
        apolice_id:       apolice?.id || null,
        cliente_id:       apolice?.cliente_id || null,
        vendedor_id:      vendedorId,
        valor:            Math.abs(valor),
        competencia:      dataPg ? dataPg.slice(0,7) : competencia,
        data_recebimento: dataPg,
        parcela:          numParc,
        seguradora:       'Bradesco Seguros',
        produto:          ramo || null,
        status:           valor < 0 || codRest === 'S' ? 'cancelado' : 'recebido',
        origem:           'importacao',
        importacao_id:    imp?.id || null,
        obs,
      })
      if (error) { erros++; msgs.push(`${apolNum}: ${error.message?.slice(0,80)}`); continue }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

// ─── BVP — extratos de comissão (tipos 01..21) ───────────────
// Estrutura comum: SUCURSAL | COD-CORRETOR | DATA-PAGTO | TIPO-MOVTO | NUM-SEQ-PAGTO | ...
async function processarBVP(linhas: string[][]) {
  const dados = pularCabecalho(linhas, true)
  let importados = 0, erros = 0
  const msgs: string[] = []
  if (!dados.length) return { importados, erros, msgs: ['arquivo vazio'] }

  const competencia = (toDate(dados[0]?.[2] || '') || new Date().toISOString()).slice(0,7)
  const total = dados.reduce((s, l) => {
    const v = parseFloat((l[l.length-1]||'').replace(/\./g,'').replace(',', '.'))
    return s + (isNaN(v) ? 0 : v)
  }, 0)

  const { data: imp } = await supabaseAdmin.from('importacoes_comissao').insert({
    nome_arquivo: `bradesco-bvp-${Date.now()}.txt`,
    competencia,
    qtd_registros: dados.length,
    total_importado: total,
    status: 'processado',
  }).select('id').single()

  for (const l of dados) {
    try {
      const tipoMov = (l[3] || '').padStart(2,'0')   // 01..21
      const dataPg  = toDate(l[2] || '')
      // Valor: último campo numérico da linha
      const lastNumCol = (() => {
        for (let i = l.length-1; i >= 0; i--) {
          const v = num(l[i]); if (v != null) return v
        }
        return 0
      })()
      const valor = lastNumCol
      // Identificador de proposta (varia por tipo) — heurística: campo "PROPOSTA" comum
      const proposta = (l.find(c => /^\d{3}\s?\d{6,7}$/.test(c)) || '').trim()
      const apolice = proposta ? await buscarApolicePorNumero(proposta.replace(/\D/g,'')) : null
      const vendedorId = apolice?.vendedor_id
      if (!vendedorId) { erros++; msgs.push(`BVP tipo ${tipoMov}: sem vendedor (proposta ${proposta})`); continue }

      const obs = `BVP tipo ${tipoMov} · sucursal ${l[0]} · corretor ${l[1]} · seq ${l[4]||''}${proposta?` · proposta ${proposta}`:''}`

      const { error } = await supabaseAdmin.from('comissoes_recebidas').insert({
        apolice_id:       apolice?.id || null,
        cliente_id:       apolice?.cliente_id || null,
        vendedor_id:      vendedorId,
        valor:            Math.abs(valor),
        competencia:      dataPg ? dataPg.slice(0,7) : competencia,
        data_recebimento: dataPg,
        seguradora:       'Bradesco Vida e Previdência',
        status:           valor < 0 ? 'cancelado' : 'recebido',
        origem:           'importacao',
        importacao_id:    imp?.id || null,
        obs,
      })
      if (error) { erros++; msgs.push(error.message?.slice(0,80)); continue }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

// ─── PROCESSAR ENDOSSOS AUTO ─────────────────────────────────
async function processarEndossos(linhas: string[][]) {
  // Cabeçalho na ordem: CCRRTR | CSUCUR | CRAMO_SEGUR | CCIA_SEGDR | NAPOLC_SEGUR | NITEM_APOLC | ISEGRD_APOLC | NENDSS_APOLC | RTPO_ENDSS_APOLC | ...
  const dados = pularCabecalho(linhas, true)
  let importados = 0, erros = 0
  const msgs: string[] = []
  for (const l of dados) {
    try {
      const apolNum = l[4] || ''
      const numEnd  = l[7] || ''
      const nome    = l[6] || ''
      const tipo    = l[8] || null
      const dInicio = toDate(l[12] || '')
      const dRlz    = toDate(l[13] || '')
      if (!numEnd) { erros++; msgs.push('endosso sem número'); continue }
      const apolice = await buscarApolicePorNumero(apolNum)
      const clienteId = apolice?.cliente_id || await obterOuCriarCliente({ nome })

      const { error } = await supabaseAdmin.from('endossos').upsert({
        apolice_id:     apolice?.id || null,
        cliente_id:     clienteId,
        numero_endosso: numEnd,
        numero_apolice: apolNum,
        tipo,
        data_emissao:   dRlz || dInicio,
        vigencia_ini:   dInicio,
        seguradora:     'Bradesco Seguros',
        fonte:          'Bradesco Seguros',
        dados_brutos:   { contrato: l[14] || null },
      }, { onConflict: 'seguradora,numero_endosso' })
      if (error) { erros++; msgs.push(error.message?.slice(0,80)); continue }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

// ─── DETECÇÃO AUTOMÁTICA POR NOME DO ARQUIVO ─────────────────
function detectarTipo(nome: string): string {
  const n = (nome||'').toLowerCase()
  if (n.includes('bvp') || n.includes('previd')) return 'BVP_COMISSOES'
  if (n.includes('paga'))     return 'PARCELAS_PAGAS'
  if (n.includes('vencer'))   return 'PARCELAS_VENCER'
  if (n.includes('pendent'))  return 'PARCELAS_PENDENTES'
  if (n.includes('emitid'))   return 'EMITIDOS'
  if (n.includes('cancel'))   return 'CANCELADOS'
  if (n.includes('sinistro')) return 'SINISTROS'
  if (n.includes('renovar'))  return 'RENOVAR'
  if (n.includes('proposta')) return 'PROPOSTAS_AUTO'
  if (n.includes('endosso'))  return 'ENDOSSOS_AUTO'
  if (n.includes('apolice') || n.includes('apólice')) return 'APOLICES_AUTO'
  if (n.includes('comiss') || n.includes('extrato')) return 'COMISSOES'
  return 'OUTRO'
}

async function processarArquivo(nomeArquivo: string, conteudo: string, tipo: string) {
  const linhas = parseLinhas(conteudo)
  const origem = tipo === 'BVP_COMISSOES' ? 'BVP' : 'Bradesco Seguros'
  const { data: importacao } = await supabaseAdmin.from('importacoes_bradesco').insert({
    tipo_arquivo: tipo, origem, nome_arquivo: nomeArquivo,
    data_geracao: new Date().toISOString().split('T')[0],
    qtd_registros: linhas.length,
    status: 'processando',
  }).select().single()

  let resultado: { importados: number; erros: number; msgs: string[] }
  switch (tipo) {
    case 'PARCELAS_PAGAS':
    case 'PARCELAS_VENCER':
    case 'PARCELAS_PENDENTES':
      resultado = await processarParcelas(linhas, tipo); break
    case 'EMITIDOS':
    case 'CANCELADOS':
    case 'RENOVAR':
    case 'APOLICES_AUTO':
    case 'PROPOSTAS_AUTO':
      resultado = await processarApolices(linhas, tipo); break
    case 'SINISTROS':
      resultado = await processarSinistros(linhas); break
    case 'ENDOSSOS_AUTO':
      resultado = await processarEndossos(linhas); break
    case 'COMISSOES':
      resultado = await processarComissoes(linhas); break
    case 'BVP_COMISSOES':
      resultado = await processarBVP(linhas); break
    default:
      resultado = { importados: 0, erros: 0, msgs: ['Tipo não reconhecido — selecione manualmente.'] }
  }

  if (importacao?.id) {
    await supabaseAdmin.from('importacoes_bradesco').update({
      status: resultado.erros === 0 ? 'concluido' : 'parcial',
      qtd_importados: resultado.importados,
      qtd_erros: resultado.erros,
      erros: resultado.msgs.slice(0, 10),
      concluido_em: new Date().toISOString(),
    }).eq('id', importacao.id)
  }
  return resultado
}

// ─── ENDPOINT ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { action, ...params } = await request.json()

    if (action === 'config') {
      return NextResponse.json({
        ok: true,
        seguradora: 'Bradesco Seguros + BVP',
        modo: 'Upload de arquivos InfoSeguro (delimitados por |, ;, tab)',
        tipos_aceitos: Object.keys(LAYOUTS).concat(['ENDOSSOS_AUTO','BVP_COMISSOES','APOLICES_AUTO','PROPOSTAS_AUTO','RENOVAR']),
        supabase_url:  process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configurado' : 'FALTA',
        supabase_role: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configurado' : 'FALTA',
      })
    }

    if (action === 'processar_upload') {
      const { conteudo, storage_path, nome_arquivo, tipo_forcado } = params
      let texto: string | null = null

      if (typeof conteudo === 'string' && conteudo.length > 0) {
        texto = conteudo
      } else if (typeof storage_path === 'string' && storage_path.length > 0) {
        const { data, error } = await supabaseAdmin.storage.from('cmsegcrm').download(storage_path)
        if (error || !data) {
          return NextResponse.json({ error: `Falha ao baixar do storage: ${error?.message || 'desconhecido'}` }, { status: 500 })
        }
        const buf = Buffer.from(await data.arrayBuffer())
        // arquivos InfoSeguro costumam vir em latin1
        try { texto = new TextDecoder('utf-8', { fatal: true } as any).decode(buf) }
        catch { texto = new TextDecoder('latin1').decode(buf) }
      } else {
        return NextResponse.json({ error: 'envie conteudo (string) ou storage_path' }, { status: 400 })
      }

      const nome = nome_arquivo || 'upload.txt'
      const tipo = (tipo_forcado as string) || detectarTipo(nome)
      try {
        const resultado = await processarArquivo(nome, texto, tipo)
        return NextResponse.json({ ok: true, arquivo: nome, tipo, ...resultado })
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Erro ao processar' }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (err: any) {
    console.error('[Bradesco] Erro:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
