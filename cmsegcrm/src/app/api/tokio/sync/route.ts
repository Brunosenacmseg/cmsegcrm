import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'
export const maxDuration = 300

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── Helpers de XML ──────────────────────────────────────────
// Parser leve baseado em regex. Suficiente pros XMLs da Tokio
// que são planos (sem CDATA aninhado nem namespaces complexos).

function stripNs(tag: string): string {
  return tag.replace(/^[^:>]+:/, '')
}

// Pega o conteúdo de uma tag, ignorando namespace e atributos.
// Aceita lista de aliases (ex: numeroApolice / numApolice / apolice).
function getTag(xml: string, aliases: string[]): string {
  for (const a of aliases) {
    const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${a}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${a}>`, 'i')
    const m = xml.match(re)
    if (m) return m[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim()
  }
  return ''
}

// Extrai todos os blocos de uma tag (ex: cada <proposta>…</proposta>)
function getBlocks(xml: string, aliases: string[]): string[] {
  const blocks: string[] = []
  for (const a of aliases) {
    const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${a}\\b[^>]*>[\\s\\S]*?<\\/(?:[A-Za-z0-9_]+:)?${a}>`, 'gi')
    let m
    while ((m = re.exec(xml)) !== null) blocks.push(m[0])
    if (blocks.length) return blocks
  }
  return blocks
}

function num(s: string): number | null {
  if (!s) return null
  const t = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const v = parseFloat(t)
  return isNaN(v) ? null : v
}

function toDate(s: string): string | null {
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

function digits(s: string): string { return (s||'').replace(/\D/g, '') }

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
    nome:     nome || (cpfCnpj ? `Cliente ${cpfCnpj}` : 'Cliente Tokio'),
    tipo,
    cpf_cnpj: cpfCnpj || null,
    fonte:    'Tokio Marine',
    email:    email || null,
    telefone: telefone || null,
  }
  if (dadosBrutos) payload.dados_tokio = dadosBrutos
  const { data, error } = await supabaseAdmin.from('clientes').insert(payload).select('id').single()
  if (error) { console.warn('[Tokio] erro criando cliente:', error.message); return null }
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

// ─── PROCESSAR APÓLICES / PROPOSTAS ──────────────────────────
async function processarApolices(xml: string) {
  const blocks = getBlocks(xml, ['proposta', 'apolice', 'Apolice', 'Proposta'])
  const lista = blocks.length ? blocks : [xml]    // fallback: XML único
  let importados = 0, erros = 0
  const msgs: string[] = []

  for (const bloco of lista) {
    try {
      const numApolice = getTag(bloco, ['numeroApolice', 'numApolice', 'apolice', 'numero'])
      const numProposta = getTag(bloco, ['numeroProposta', 'numProposta', 'proposta'])
      const nome     = getTag(bloco, ['nomeSegurado', 'segurado', 'nomeCliente', 'nome'])
      const cpfCnpj  = digits(getTag(bloco, ['cpfCnpj', 'cpf', 'cnpj', 'documento']))
      const email    = getTag(bloco, ['email', 'emailSegurado'])
      const tel      = getTag(bloco, ['telefone', 'celular', 'telefoneSegurado'])
      const ramo     = getTag(bloco, ['ramo', 'descricaoRamo', 'produto'])
      const placa    = getTag(bloco, ['placa', 'placaVeiculo'])
      const modelo   = getTag(bloco, ['modelo', 'descricaoModelo', 'modeloVeiculo'])
      const ano      = getTag(bloco, ['anoModelo', 'ano'])
      const vigIni   = toDate(getTag(bloco, ['vigenciaInicio', 'inicioVigencia', 'dataInicioVigencia']))
      const vigFim   = toDate(getTag(bloco, ['vigenciaFim', 'fimVigencia', 'dataFimVigencia']))
      const emissao  = toDate(getTag(bloco, ['dataEmissao', 'emissao']))
      const premio   = num(getTag(bloco, ['premioTotal', 'valorPremio', 'premio']))
      const premioLiq= num(getTag(bloco, ['premioLiquido']))
      const iof      = num(getTag(bloco, ['valorIOF', 'iof']))
      const comPct   = num(getTag(bloco, ['percentualComissao', 'comissaoPercentual', 'comissao']))
      const qtdParc  = parseInt(getTag(bloco, ['quantidadeParcelas', 'qtdParcelas']) || '0') || null
      const numero   = numApolice || numProposta
      if (!numero) { msgs.push('sem número de apólice/proposta'); erros++; continue }

      const dadosBrutos = { numApolice, numProposta, ramo, vigIni, vigFim, premio }
      const clienteId = await obterOuCriarCliente({ cpfCnpj, nome, email, telefone: tel, dadosBrutos })

      const payload: any = {
        numero,
        seguradora:        'Tokio Marine',
        fonte:             'Tokio Marine',
        produto:           ramo || null,
        ramo:              ramo || null,
        proposta:          numProposta || null,
        status:            numApolice ? 'ativo' : 'proposta',
        cliente_id:        clienteId,
        nome_segurado:     nome || null,
        cpf_cnpj_segurado: cpfCnpj || null,
        placa:             placa || null,
        modelo:            modelo || null,
        ano_modelo:        ano || null,
        vigencia_ini:      vigIni,
        vigencia_fim:      vigFim,
        emissao:           emissao,
        premio:            premio,
        premio_liquido:    premioLiq,
        valor_iof:         iof,
        comissao_pct:      comPct,
        qtd_parcelas:      qtdParc,
        dados_tokio:       dadosBrutos,
      }
      const { error } = await supabaseAdmin.from('apolices').upsert(payload, {
        onConflict: 'numero', ignoreDuplicates: false,
      })
      if (error) { erros++; msgs.push(`${numero}: ${error.message?.slice(0,80)}`); continue }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

// ─── PROCESSAR PARCELAS A PAGAR ──────────────────────────────
async function processarParcelas(xml: string) {
  const blocks = getBlocks(xml, ['parcela', 'Parcela', 'cobranca'])
  const lista = blocks.length ? blocks : [xml]
  let importados = 0, erros = 0
  const msgs: string[] = []

  for (const bloco of lista) {
    try {
      const numApolice  = getTag(bloco, ['numeroApolice', 'numApolice', 'apolice'])
      const cpfCnpj     = digits(getTag(bloco, ['cpfCnpj', 'cpf', 'cnpj']))
      const nome        = getTag(bloco, ['nomeSegurado', 'segurado', 'nome'])
      const numParcela  = getTag(bloco, ['numeroParcela', 'numParcela', 'parcela'])
      const totParcelas = getTag(bloco, ['totalParcelas', 'qtdParcelas'])
      const valor       = num(getTag(bloco, ['valorParcela', 'valor'])) || 0
      const venc        = toDate(getTag(bloco, ['dataVencimento', 'vencimento']))
      const dataPag     = toDate(getTag(bloco, ['dataPagamento', 'pagamento']))
      const status      = getTag(bloco, ['statusParcela', 'situacao', 'status']).toLowerCase()
      if (!venc) { msgs.push(`sem vencimento (apólice ${numApolice})`); erros++; continue }

      const apolice = await buscarApolicePorNumero(numApolice)
      const clienteId = apolice?.cliente_id
        || await obterOuCriarCliente({ cpfCnpj, nome, dadosBrutos: { numApolice, parcela: numParcela } })

      const pago = !!dataPag || ['paga','pago','liquidada','quitada'].includes(status)

      const conta = {
        tipo:        'conta',
        nome:        `Tokio Marine — Apólice ${numApolice} parc ${numParcela}/${totParcelas}`,
        valor,
        vencimento:  venc,
        descricao:   `Parcela ${numParcela}/${totParcelas} | Apólice ${numApolice} | ${nome||''}`.trim(),
        status:      pago ? 'pago' : 'pendente',
        fornecedor:  'Tokio Marine',
        forma_pagto: getTag(bloco, ['formaPagamento', 'tipoPagamento']) || null,
        data_pagamento: dataPag,
      }

      // Evitar duplicar (apólice + parcela + vencimento)
      const { data: existing } = await supabaseAdmin.from('contas_pagar')
        .select('id').ilike('nome', `%Apólice ${numApolice} parc ${numParcela}/%`)
        .eq('vencimento', venc).maybeSingle()

      if (existing?.id) {
        await supabaseAdmin.from('contas_pagar').update({
          status: conta.status, data_pagamento: conta.data_pagamento, valor: conta.valor,
        }).eq('id', existing.id)
      } else {
        const { error } = await supabaseAdmin.from('contas_pagar').insert(conta)
        if (error) { erros++; msgs.push(error.message?.slice(0,80)); continue }
      }

      // Tarefa de aviso para cliente (se tem responsável da apólice)
      if (!pago && apolice?.vendedor_id && clienteId) {
        const dias = Math.floor((new Date(venc).getTime() - Date.now()) / 86400000)
        if (dias <= 7) {
          await supabaseAdmin.from('tarefas').insert({
            titulo: `💸 Parcela Tokio: Apólice ${numApolice}`,
            descricao: `Parcela ${numParcela}/${totParcelas} | R$ ${valor.toLocaleString('pt-BR',{minimumFractionDigits:2})} | Venc: ${venc}`,
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

// ─── PROCESSAR EXTRATO DE COMISSÕES PAGAS ────────────────────
async function processarComissoes(xml: string) {
  const blocks = getBlocks(xml, ['comissao', 'Comissao', 'item', 'lancamento'])
  const lista = blocks.length ? blocks : [xml]
  let importados = 0, erros = 0
  const msgs: string[] = []

  // Importação master
  const { data: imp } = await supabaseAdmin.from('importacoes_comissao').insert({
    nome_arquivo: 'tokio-comissoes.xml',
    competencia: getTag(xml, ['competencia', 'periodo']) || new Date().toISOString().slice(0,7),
    qtd_registros: lista.length,
    status: 'processado',
  }).select('id').single()

  for (const bloco of lista) {
    try {
      const numApolice = getTag(bloco, ['numeroApolice', 'numApolice', 'apolice'])
      const cpfCnpj    = digits(getTag(bloco, ['cpfCnpj', 'cpf', 'cnpj']))
      const valor      = num(getTag(bloco, ['valorComissao', 'comissaoValor', 'valor'])) || 0
      const competencia= getTag(bloco, ['competencia', 'periodo', 'mesReferencia'])
      const dataRec    = toDate(getTag(bloco, ['dataPagamento', 'dataCredito', 'pagamento']))
      const parcela    = parseInt(getTag(bloco, ['numeroParcela', 'parcela']) || '1') || 1
      const totalParc  = parseInt(getTag(bloco, ['totalParcelas']) || '1') || 1

      const apolice = await buscarApolicePorNumero(numApolice)
      const vendedorId = apolice?.vendedor_id
      if (!vendedorId) {
        // Sem vendedor associado, não conseguimos lançar a comissão (FK NOT NULL).
        // Marca como pendente e continua.
        msgs.push(`apólice ${numApolice} sem vendedor — comissão R$${valor} ignorada`)
        erros++
        continue
      }

      const { error } = await supabaseAdmin.from('comissoes_recebidas').insert({
        apolice_id:       apolice?.id || null,
        cliente_id:       apolice?.cliente_id || null,
        vendedor_id:      vendedorId,
        valor,
        competencia:      competencia || (dataRec ? dataRec.slice(0,7) : ''),
        data_recebimento: dataRec,
        parcela,
        total_parcelas:   totalParc,
        seguradora:       'Tokio Marine',
        status:           'recebido',
        origem:           'importacao',
        importacao_id:    imp?.id || null,
        obs:              cpfCnpj ? `CPF/CNPJ ${cpfCnpj}` : null,
      })
      if (error) { erros++; msgs.push(`${numApolice}: ${error.message?.slice(0,80)}`); continue }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

// ─── PROCESSAR ENDOSSOS ──────────────────────────────────────
async function processarEndossos(xml: string) {
  const blocks = getBlocks(xml, ['endosso', 'Endosso'])
  const lista = blocks.length ? blocks : [xml]
  let importados = 0, erros = 0
  const msgs: string[] = []

  for (const bloco of lista) {
    try {
      const numEndosso = getTag(bloco, ['numeroEndosso', 'numEndosso', 'endosso'])
      const numApolice = getTag(bloco, ['numeroApolice', 'numApolice', 'apolice'])
      const tipo       = getTag(bloco, ['tipoEndosso', 'tipo'])
      const motivo     = getTag(bloco, ['motivoEndosso', 'motivo', 'descricaoMotivo'])
      const dataEm     = toDate(getTag(bloco, ['dataEmissao', 'emissao']))
      const vigIni     = toDate(getTag(bloco, ['vigenciaInicio', 'inicioVigencia']))
      const vigFim     = toDate(getTag(bloco, ['vigenciaFim', 'fimVigencia']))
      const premio     = num(getTag(bloco, ['valorPremio', 'premio']))
      const iof        = num(getTag(bloco, ['valorIOF', 'iof']))
      const dif        = num(getTag(bloco, ['valorDiferenca', 'diferenca']))
      if (!numEndosso) { msgs.push('sem número de endosso'); erros++; continue }

      const apolice = await buscarApolicePorNumero(numApolice)

      const { error } = await supabaseAdmin.from('endossos').upsert({
        apolice_id:     apolice?.id || null,
        cliente_id:     apolice?.cliente_id || null,
        numero_endosso: numEndosso,
        numero_apolice: numApolice || null,
        tipo:           tipo || null,
        motivo:         motivo || null,
        data_emissao:   dataEm,
        vigencia_ini:   vigIni,
        vigencia_fim:   vigFim,
        valor_premio:   premio,
        valor_iof:      iof,
        valor_diferenca: dif,
        seguradora:     'Tokio Marine',
        fonte:          'Tokio Marine',
        dados_brutos:   { numEndosso, numApolice, tipo, motivo, premio },
      }, { onConflict: 'seguradora,numero_endosso' })
      if (error) { erros++; msgs.push(`${numEndosso}: ${error.message?.slice(0,80)}`); continue }

      // Histórico no cliente
      if (apolice?.cliente_id) {
        await supabaseAdmin.from('historico').insert({
          cliente_id: apolice.cliente_id,
          tipo: 'gold',
          titulo: `📝 Endosso Tokio: ${numEndosso}`,
          descricao: `${tipo || 'Endosso'} · Apólice ${numApolice}${motivo?` · ${motivo}`:''}${premio?` · R$ ${premio}`:''}`,
        })
      }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

// ─── DETECÇÃO AUTOMÁTICA DE TIPO ─────────────────────────────
function detectarTipo(xml: string, nomeArquivo: string): string {
  const n = (nomeArquivo||'').toLowerCase()
  if (n.includes('endosso')) return 'ENDOSSOS'
  if (n.includes('comiss'))  return 'COMISSOES'
  if (n.includes('parcel') || n.includes('cobranc') || n.includes('boleto')) return 'PARCELAS'
  if (n.includes('apolice') || n.includes('proposta')) return 'APOLICES'

  // Heurística pelo conteúdo: olha quais tags aparecem mais
  const has = (re: RegExp) => re.test(xml)
  if (has(/<(?:[a-z0-9_]+:)?endosso\b/i))  return 'ENDOSSOS'
  if (has(/<(?:[a-z0-9_]+:)?comissao\b/i)) return 'COMISSOES'
  if (has(/<(?:[a-z0-9_]+:)?parcela\b/i) && has(/<(?:[a-z0-9_]+:)?vencimento\b/i)) return 'PARCELAS'
  if (has(/<(?:[a-z0-9_]+:)?(?:apolice|proposta)\b/i)) return 'APOLICES'
  return 'OUTRO'
}

async function processarArquivo(nomeArquivo: string, xml: string, tipo: string) {
  const { data: importacao } = await supabaseAdmin.from('importacoes_tokio').insert({
    tipo_arquivo: tipo,
    nome_arquivo: nomeArquivo,
    data_geracao: new Date().toISOString().split('T')[0],
    qtd_registros: (xml.match(/</g) || []).length,
    status: 'processando',
  }).select().single()

  let resultado: { importados: number; erros: number; msgs: string[] }
  if      (tipo === 'APOLICES')  resultado = await processarApolices(xml)
  else if (tipo === 'PARCELAS')  resultado = await processarParcelas(xml)
  else if (tipo === 'COMISSOES') resultado = await processarComissoes(xml)
  else if (tipo === 'ENDOSSOS')  resultado = await processarEndossos(xml)
  else resultado = { importados: 0, erros: 0, msgs: ['Tipo não reconhecido — informe manualmente.'] }

  if (importacao?.id) {
    await supabaseAdmin.from('importacoes_tokio').update({
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
        seguradora: 'Tokio Marine',
        modo: 'Upload manual de XML',
        tipos_aceitos: ['APOLICES', 'PARCELAS', 'COMISSOES', 'ENDOSSOS'],
        supabase_url:  process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configurado' : 'FALTA',
        supabase_role: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configurado' : 'FALTA',
      })
    }

    if (action === 'processar_upload') {
      const { conteudo, storage_path, nome_arquivo, tipo_forcado } = params
      let xml: string | null = null

      if (typeof conteudo === 'string' && conteudo.length > 0) {
        xml = conteudo
      } else if (typeof storage_path === 'string' && storage_path.length > 0) {
        const { data, error } = await supabaseAdmin.storage.from('cmsegcrm').download(storage_path)
        if (error || !data) {
          return NextResponse.json({ error: `Falha ao baixar do storage: ${error?.message || 'desconhecido'}` }, { status: 500 })
        }
        const buf = Buffer.from(await data.arrayBuffer())
        xml = new TextDecoder('utf-8').decode(buf)
      } else {
        return NextResponse.json({ error: 'envie conteudo (string XML) ou storage_path' }, { status: 400 })
      }

      const nome = nome_arquivo || 'upload.xml'
      const tipo = (tipo_forcado as string) || detectarTipo(xml, nome)
      try {
        const resultado = await processarArquivo(nome, xml, tipo)
        return NextResponse.json({ ok: true, arquivo: nome, tipo, ...resultado })
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Erro ao processar' }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (err: any) {
    console.error('[Tokio] Erro:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
