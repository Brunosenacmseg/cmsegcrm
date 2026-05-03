import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'
export const maxDuration = 300

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── Webservice Tokio Marine ─────────────────────────────────
// Documentação: dois endpoints — Login (gera token) + recursos.
// Credenciais default vêm do .env; podemos sobrescrever via ENV.
const TOKIO_BASE        = 'https://servicos.tokiomarine.com.br/wscorretor/rest/Corretor'
const TOKIO_USER        = process.env.TOKIO_USER        || ''
const TOKIO_PASSWORD    = process.env.TOKIO_PASSWORD    || ''
const TOKIO_SERVICE_KEY = process.env.TOKIO_SERVICE_KEY || ''

// Cache simples do token (vive por instância da Lambda)
let tokenCache: { token: string; exp: number } | null = null

async function tokioLogin(force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.exp > Date.now()) return tokenCache.token
  if (!TOKIO_USER || !TOKIO_PASSWORD || !TOKIO_SERVICE_KEY) {
    throw new Error('Credenciais Tokio não configuradas (TOKIO_USER/TOKIO_PASSWORD/TOKIO_SERVICE_KEY).')
  }
  const r = await fetch(`${TOKIO_BASE}/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      user: TOKIO_USER,
      password: TOKIO_PASSWORD,
      serviceKey: TOKIO_SERVICE_KEY,
    }),
    signal: AbortSignal.timeout(25000),
  })
  if (!r.ok) throw new Error(`Tokio Login HTTP ${r.status}: ${(await r.text()).slice(0,200)}`)
  const txt = await r.text()
  // Resposta pode ser JSON {"token":"..."} ou string crua
  let token = ''
  try {
    const j = JSON.parse(txt)
    token = j.token || j.access_token || j.accessToken || j.Token || ''
  } catch {
    token = txt.replace(/^"|"$/g, '').trim()
  }
  if (!token) throw new Error(`Tokio Login: token não encontrado na resposta: ${txt.slice(0,200)}`)
  tokenCache = { token, exp: Date.now() + 25 * 60 * 1000 }   // 25 min de validade
  return token
}

async function tokioGet(servico: string, params: Record<string,string|number> = {}): Promise<string> {
  let token = await tokioLogin()
  const qs = new URLSearchParams(Object.entries(params).map(([k,v]) => [k, String(v)])).toString()
  const url = `${TOKIO_BASE}/${servico}${qs ? `?${qs}` : ''}`
  const headers = (t: string) => ({
    'Accept': 'application/xml, application/json, text/xml',
    'Authorization': `Bearer ${t}`,
    'token': t,
  })
  let r = await fetch(url, { headers: headers(token), signal: AbortSignal.timeout(60000) })
  if (r.status === 401) {
    // Token expirou — refaz login uma vez
    token = await tokioLogin(true)
    r = await fetch(url, { headers: headers(token), signal: AbortSignal.timeout(60000) })
  }
  if (!r.ok) throw new Error(`Tokio ${servico} HTTP ${r.status}: ${(await r.text()).slice(0,200)}`)
  return await r.text()
}

// ─── Helpers de XML ──────────────────────────────────────────
// Parser leve (regex) — aceita namespaces, CDATA e atributos.
// Os nomes de tag são case-insensitive porque a documentação da
// Tokio mistura maiúsculas/minúsculas (numApoIice/numApolice).

function getTag(xml: string, aliases: string[]): string {
  for (const a of aliases) {
    const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${a}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${a}>`, 'i')
    const m = xml.match(re)
    if (m) return m[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim()
  }
  return ''
}

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

// Fatia o XML em pedaços usando uma tag como âncora: cada pedaço
// começa em uma ocorrência da âncora e vai até a próxima (ou EOF).
// Útil quando vários registros estão concatenados sem um wrapper
// repetido — cada registro é a sequência DadosSegurado+DadosSeguro
// +Cobranca+Item.
function splitByAnchor(xml: string, aliases: string[]): string[] {
  for (const a of aliases) {
    const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${a}\\b`, 'gi')
    const positions: number[] = []
    let m
    while ((m = re.exec(xml)) !== null) positions.push(m.index)
    if (positions.length <= 1) continue
    const pieces: string[] = []
    for (let i = 0; i < positions.length; i++) {
      pieces.push(xml.slice(positions[i], positions[i+1] ?? xml.length))
    }
    return pieces
  }
  return [xml]
}

function num(s: string): number | null {
  if (!s) return null
  const t = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const v = parseFloat(t)
  return isNaN(v) ? null : v
}

function toDate(s: string): string | null {
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);    if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})/);      if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

function digits(s: string): string { return (s||'').replace(/\D/g, '') }

// ─── Endossos de cancelamento ────────────────────────────────
// Layout Tokio: quando o tpComplemento bate em um destes textos
// E `qtdeParcelas` = 0, devemos desconsiderar valores (premio,
// IOF, comissão) — o endosso é apenas registro de cancelamento,
// não gera financeiro.
const TPS_CANCELAMENTO = [
  'cancelamento a pedido do segurado',
  'cancelamento a pedido da companhia',
  'cancelamento reducao de is', 'cancelamento redução de is',
  'cancelamento por falta de pagamento',
  'cancelamento indenizacao integral', 'cancelamento indenização integral',
  'cancelamento por erro tecnico', 'cancelamento por erro técnico',
  'cancelamento devolucao integram com iof', 'cancelamento devolução integram com iof',
  'cancelamento endosso inadimplencia', 'cancelamento endosso inadimplência',
  'exclusao item por sinistro', 'exclusão item por sinistro',
  'cancelamento de gatilho',
]
function ehEndossoCancelamento(tpComplemento: string, qtdeParcelas: number | null): boolean {
  if (qtdeParcelas !== 0) return false
  const t = (tpComplemento||'').toLowerCase().trim()
  if (!t) return false
  return TPS_CANCELAMENTO.some(p => t.includes(p))
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

// ─── Extrai dados de uma apólice (bloco DadosSeguro + adjacentes) ─
function extrairApolice(bloco: string) {
  // Cabeçalho do segurado e seguro
  const nome     = getTag(bloco, ['nome', 'nomeSegurado'])
  const cpfCnpj  = digits(getTag(bloco, ['CPFCnpj', 'cpfCnpj', 'cpf', 'cnpj']))
  const tpPessoa = getTag(bloco, ['tpPessoa'])
  const email    = getTag(bloco, ['e-mail', 'dsEmail', 'email'])
  const ddd      = getTag(bloco, ['ddd'])
  const numTel   = getTag(bloco, ['numero'])  // dentro do telefone — sem garantia
  const ramo     = getTag(bloco, ['ramo'])
  const produto  = getTag(bloco, ['Produto', 'produto'])
  const numApolice    = getTag(bloco, ['numApoIice', 'numApolice', 'numeroApolice'])
  const numProposta   = getTag(bloco, ['NumProposta', 'numProposta'])
  const numEndosso    = getTag(bloco, ['numEndosso', 'numeroEndosso'])
  const tpComplemento = getTag(bloco, ['tpComplemento'])
  const tipoSeguro    = getTag(bloco, ['TipoSeguro'])
  const statusApolice = getTag(bloco, ['StatusApoliceEndosso', 'StatusProposta'])
  const dtCanc        = toDate(getTag(bloco, ['dtCancelamento']))
  const dtRecusa      = toDate(getTag(bloco, ['dtRecusa']))
  const motivoRecusa  = getTag(bloco, ['motivoDeRecusa'])

  const vigIni  = toDate(getTag(bloco, ['dtInicioVigenciaApolice']))
  const vigFim  = toDate(getTag(bloco, ['dtFimVigenciaApolice']))
  const emissao = toDate(getTag(bloco, ['dtEmissaoApolice']))
  const vigIniEnd = toDate(getTag(bloco, ['dtInicioVigenciaEndosso']))
  const vigFimEnd = toDate(getTag(bloco, ['dtFimVigenciaEndosso']))
  const emissaoEnd= toDate(getTag(bloco, ['dtEmissaoEndosso']))

  // Cobranca
  const formaCobranca   = getTag(bloco, ['dsFormaCobranca'])
  const qtdParc         = parseInt(getTag(bloco, ['qtdeParcelas']) || '') || null
  const premioLiq       = num(getTag(bloco, ['vlrPremioLiquido']))
  const iof             = num(getTag(bloco, ['vlrIOF']))
  const premioTotal     = num(getTag(bloco, ['vlrPremioTotal']))
  const custoApolice    = num(getTag(bloco, ['vlrCustoApolice']))
  // Comissao (campos em <Comissao>)
  const blocoComissao   = (getBlocks(bloco, ['Comissao'])[0]) || ''
  const pcComissao      = num(getTag(blocoComissao, ['pcComissao']))
  const vlrComissao     = num(getTag(blocoComissao, ['vlrComissao']))
  // Veículo (auto)
  const blocoAuto       = (getBlocks(bloco, ['DadosSeguroAutomovel'])[0]) || ''
  const placa           = getTag(blocoAuto, ['cdPlaca'])
  const modelo          = getTag(blocoAuto, ['dsModelo'])
  const fabricante      = getTag(blocoAuto, ['fabricante'])
  const anoModelo       = getTag(blocoAuto, ['anoModelo'])
  const anoFabricacao   = getTag(blocoAuto, ['anoFabricacao'])
  const chassi          = getTag(blocoAuto, ['chassi'])

  // Corretor lider (para futuramente vincular vendedor)
  const blocoCorretor   = (getBlocks(bloco, ['Corretor'])[0]) || bloco
  const cdCorretor      = getTag(blocoCorretor, ['cdCorretor'])

  return {
    nome, cpfCnpj, tpPessoa, email, ddd, numTel, ramo, produto,
    numApolice, numProposta, numEndosso, tpComplemento, tipoSeguro, statusApolice,
    dtCanc, dtRecusa, motivoRecusa,
    vigIni, vigFim, emissao, vigIniEnd, vigFimEnd, emissaoEnd,
    formaCobranca, qtdParc, premioLiq, iof, premioTotal, custoApolice,
    pcComissao, vlrComissao,
    placa, modelo, fabricante, anoModelo, anoFabricacao, chassi,
    cdCorretor,
  }
}

// ─── PROCESSAR APÓLICES / PROPOSTAS / ENDOSSOS ───────────────
// O arquivo "Propostas/Apólices e Endossos" pode trazer um ou
// vários blocos <DadosSeguro> (cada um com os adjacentes). Quando
// `numEndosso` está preenchido, o registro é endosso → também
// inserimos em public.endossos. Cancelamentos com qtdeParcelas=0
// têm valores zerados.
async function processarApolices(xml: string) {
  // Cada registro completo é a sequência DadosSegurado +
  // DadosSeguro + Cobranca + Comissao + Item. A âncora confiável
  // é <DadosSegurado>, que sempre marca o início de uma apólice.
  const lista = splitByAnchor(xml, ['DadosSegurado', 'DadosSeguro'])

  let importados = 0, erros = 0
  const msgs: string[] = []

  for (const bloco of lista) {
    try {
      const c = extrairApolice(bloco)
      const numero = c.numApolice || c.numProposta
      if (!numero) { msgs.push('sem número de apólice/proposta'); erros++; continue }

      const dadosBrutos = {
        numApolice: c.numApolice, numProposta: c.numProposta, numEndosso: c.numEndosso,
        tpComplemento: c.tpComplemento, tipoSeguro: c.tipoSeguro, status: c.statusApolice,
        cdCorretor: c.cdCorretor,
      }

      const tel = c.ddd && c.numTel ? `${c.ddd}${c.numTel}` : ''
      let clienteId = await obterOuCriarCliente({
        cpfCnpj: c.cpfCnpj, nome: c.nome,
        tipo: c.tpPessoa === 'J' ? 'PJ' : 'PF',
        email: c.email, telefone: tel,
        dadosBrutos,
      })
      // Tenta placeholder se o XML não trouxe segurado identificável.
      // Se mesmo assim falhar, segue com cliente_id NULL — a migration
      // 047 deixou a coluna nullable.
      if (!clienteId) {
        clienteId = await obterOuCriarCliente({
          nome: `Apólice Tokio ${numero} (sem segurado identificado)`,
          dadosBrutos,
        })
      }

      // ── ENDOSSO DE CANCELAMENTO: zera valores ──
      const cancelamento = ehEndossoCancelamento(c.tpComplemento, c.qtdParc)
      const premioFinal      = cancelamento ? 0 : c.premioTotal
      const premioLiqFinal   = cancelamento ? 0 : c.premioLiq
      const iofFinal         = cancelamento ? 0 : c.iof
      const vlrComissaoFinal = cancelamento ? 0 : c.vlrComissao
      const pcComissaoFinal  = cancelamento ? 0 : c.pcComissao

      // Status de apólice: cancelada, recusada ou ativa
      let statusApol = 'ativo'
      if (c.dtCanc) statusApol = 'cancelada'
      else if (c.dtRecusa) statusApol = 'recusada'
      else if (!c.numApolice && c.numProposta) statusApol = 'proposta'
      if (cancelamento) statusApol = 'cancelada'

      const payload: any = {
        numero,
        seguradora:        'Tokio Marine',
        fonte:             'Tokio Marine',
        produto:           c.produto || c.ramo || null,
        ramo:              c.ramo || null,
        proposta:          c.numProposta || null,
        proposta_endosso:  c.numEndosso || null,
        status:            statusApol,
        cliente_id:        clienteId,
        nome_segurado:     c.nome || null,
        cpf_cnpj_segurado: c.cpfCnpj || null,
        tipo_documento:    c.tpPessoa === 'J' ? 'CNPJ' : 'CPF',
        placa:             c.placa || null,
        modelo:            c.modelo ? `${c.fabricante||''} ${c.modelo}`.trim() : null,
        ano_modelo:        c.anoModelo || c.anoFabricacao || null,
        vigencia_ini:      c.vigIni || c.vigIniEnd,
        vigencia_fim:      c.vigFim || c.vigFimEnd,
        emissao:           c.emissao || c.emissaoEnd,
        premio:            premioFinal,
        premio_liquido:    premioLiqFinal,
        valor_iof:         iofFinal,
        comissao_pct:      pcComissaoFinal,
        qtd_parcelas:      c.qtdParc,
        tipo_pagamento:    c.formaCobranca || null,
        dados_tokio:       { ...dadosBrutos, chassi: c.chassi, cancelamento },
      }
      const { data: apolice, error: errApol } = await supabaseAdmin.from('apolices').upsert(payload, {
        onConflict: 'numero', ignoreDuplicates: false,
      }).select('id, cliente_id').single()
      if (errApol) { erros++; msgs.push(`${numero}: ${errApol.message?.slice(0,80)}`); continue }

      // ── Se tiver endosso, registrar em public.endossos ──
      if (c.numEndosso) {
        const { error: errEnd } = await supabaseAdmin.from('endossos').upsert({
          apolice_id:     apolice?.id || null,
          cliente_id:     apolice?.cliente_id || clienteId || null,
          numero_endosso: c.numEndosso,
          numero_apolice: c.numApolice || null,
          tipo:           cancelamento ? 'cancelamento' : (c.tpComplemento || null),
          motivo:         c.tpComplemento || null,
          data_emissao:   c.emissaoEnd || c.emissao,
          vigencia_ini:   c.vigIniEnd || c.vigIni,
          vigencia_fim:   c.vigFimEnd || c.vigFim,
          valor_premio:   premioFinal,
          valor_iof:      iofFinal,
          valor_diferenca: cancelamento ? 0 : (c.premioTotal||0) - (c.premioLiq||0),
          seguradora:     'Tokio Marine',
          fonte:          'Tokio Marine',
          dados_brutos:   { ...dadosBrutos, cancelamento, vlrComissao: vlrComissaoFinal },
        }, { onConflict: 'seguradora,numero_endosso' })
        if (errEnd) msgs.push(`endosso ${c.numEndosso}: ${errEnd.message?.slice(0,60)}`)

        if (apolice?.cliente_id) {
          await supabaseAdmin.from('historico').insert({
            cliente_id: apolice.cliente_id, tipo: cancelamento ? 'red' : 'gold',
            titulo: `${cancelamento?'❌':'📝'} Endosso Tokio: ${c.numEndosso}`,
            descricao: `${c.tpComplemento || 'Endosso'} · Apólice ${c.numApolice}${cancelamento?' (cancelamento — valores zerados)':''}`,
          })
        }
      }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

// ─── PROCESSAR PARCELAS PAGAS / A PAGAR ──────────────────────
// Layout: <período> com dtInicioPeriodo/dtFimPeriodo + N <parcela>
async function processarParcelas(xml: string) {
  const blocks = getBlocks(xml, ['parcela'])
  const lista = blocks.length ? blocks : [xml]
  let importados = 0, erros = 0
  const msgs: string[] = []

  for (const bloco of lista) {
    try {
      const numApolice  = getTag(bloco, ['numApolice', 'numeroApolice'])
      const numEndosso  = getTag(bloco, ['numendosso', 'numEndosso'])
      const cpfCnpj     = digits(getTag(bloco, ['CPFCnpj']))
      const nome        = getTag(bloco, ['nomeSegurado'])
      const produto     = getTag(bloco, ['Produto'])
      const numParcela  = getTag(bloco, ['numParcela'])
      const totParcelas = getTag(bloco, ['qtdeParcela'])
      const venc        = toDate(getTag(bloco, ['dtVencimento']))
      const dataPag     = toDate(getTag(bloco, ['dtPagamento']))
      const dataBaixa   = toDate(getTag(bloco, ['dtBaixa']))
      const formaCobr   = getTag(bloco, ['dsFormaCobranca'])
      const valor       = num(getTag(bloco, ['vlrPremioParcela'])) || 0
      const vlrJuros    = num(getTag(bloco, ['vlrJuros'])) || 0
      const vlrIOF      = num(getTag(bloco, ['vlrIOF'])) || 0
      const vlrComissao = num(getTag(bloco, ['vlrComissao'])) || 0
      const status      = getTag(bloco, ['StatusApoliceEndosso', 'situacaoParcela', 'status']).toLowerCase()
      if (!venc) { msgs.push(`sem vencimento (apólice ${numApolice})`); erros++; continue }

      const apolice = await buscarApolicePorNumero(numApolice)
      const clienteId = apolice?.cliente_id
        || await obterOuCriarCliente({ cpfCnpj, nome, dadosBrutos: { numApolice, numParcela, produto } })

      const pago = !!dataPag || !!dataBaixa || ['paga','pago','liquidada','quitada'].includes(status)

      const conta = {
        tipo:        'conta',
        nome:        `Tokio Marine — Apólice ${numApolice} parc ${numParcela}/${totParcelas}`,
        valor,
        vencimento:  venc,
        descricao:   `Parcela ${numParcela}/${totParcelas} | Apólice ${numApolice}${numEndosso?` | Endosso ${numEndosso}`:''} | ${nome||''} | IOF R$ ${vlrIOF} | Juros R$ ${vlrJuros} | Comissão R$ ${vlrComissao}`.trim(),
        status:      pago ? 'pago' : 'pendente',
        fornecedor:  'Tokio Marine',
        forma_pagto: formaCobr || null,
        data_pagamento: dataPag || dataBaixa,
      }

      // De-dup (apólice + parcela + vencimento)
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

      // Tarefa de aviso pra responsável (parcela vencendo em ≤7 dias)
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
// Layout: <Extrato> com cabeçalho + <ApolicesComicionadas> com N
// <DetalheComissao>. Cancelamentos (cdNatureza 2/3/4/9) entram com
// valor negativo já no arquivo — mantemos como veio.
async function processarComissoes(xml: string) {
  const numExtrato  = getTag(xml, ['numExtrato'])
  const cdCorretor  = getTag(xml, ['CdCorretor'])
  const nmCorretor  = getTag(xml, ['NmCorretor'])
  const dtPagto     = toDate(getTag(xml, ['dtPagamento']))
  const vlrTotal    = num(getTag(xml, ['vlrTotal']))
  const vlrLiquido  = num(getTag(xml, ['vlrLiquido']))
  const vlrBruto    = num(getTag(xml, ['vlrBruto']))

  const detalhes = getBlocks(xml, ['DetalheComissao'])
  let importados = 0, erros = 0
  const msgs: string[] = []

  // Importação master
  const { data: imp } = await supabaseAdmin.from('importacoes_comissao').insert({
    nome_arquivo: `tokio-extrato-${numExtrato || Date.now()}.xml`,
    competencia: dtPagto ? dtPagto.slice(0,7) : new Date().toISOString().slice(0,7),
    qtd_registros: detalhes.length,
    total_importado: vlrLiquido || vlrTotal || 0,
    status: 'processado',
  }).select('id').single()

  for (const bloco of detalhes) {
    try {
      const numApolice  = getTag(bloco, ['numApolice'])
      const numEndosso  = getTag(bloco, ['numEndosso'])
      const produto     = getTag(bloco, ['Produto'])
      const cpfCnpj     = digits(getTag(bloco, ['CPFCnpj']))
      const nome        = getTag(bloco, ['nomeSegurado'])
      const numParcela  = parseInt(getTag(bloco, ['numParcela']) || '1') || 1
      const qtdParcela  = parseInt(getTag(bloco, ['qtdeParcela']) || '1') || 1
      const pcComissao  = num(getTag(bloco, ['pcComissao']))
      const valor       = num(getTag(bloco, ['vlrComissaoParcela'])) || 0
      const vlrPremio   = num(getTag(bloco, ['vlrPremio']))
      const cdNatureza  = getTag(bloco, ['cdNatureza'])
      const cdTipoPagto = getTag(bloco, ['cdTipoPagto'])
      const statusApol  = getTag(bloco, ['StatusApolice'])

      const apolice = await buscarApolicePorNumero(numApolice)
      const vendedorId = apolice?.vendedor_id
      if (!vendedorId) {
        msgs.push(`apólice ${numApolice}: sem vendedor — comissão R$${valor} não lançada`)
        erros++
        continue
      }

      const obs = [
        cpfCnpj && `CPF/CNPJ ${cpfCnpj}`,
        nome,
        produto,
        cdTipoPagto && `Tipo ${cdTipoPagto}`,
        cdNatureza && `Natureza ${cdNatureza}`,
        numEndosso && `Endosso ${numEndosso}`,
        statusApol && `Status ${statusApol}`,
        nmCorretor && `Corretor ${cdCorretor||''} ${nmCorretor}`,
        vlrPremio != null && `Prêmio R$ ${vlrPremio}`,
      ].filter(Boolean).join(' | ')

      const { error } = await supabaseAdmin.from('comissoes_recebidas').insert({
        apolice_id:       apolice?.id || null,
        cliente_id:       apolice?.cliente_id || null,
        vendedor_id:      vendedorId,
        valor:            Math.abs(valor),  // tabela tem CHECK >= 0; status indica se foi recuperação
        competencia:      dtPagto ? dtPagto.slice(0,7) : '',
        data_recebimento: dtPagto,
        parcela:          numParcela,
        total_parcelas:   qtdParcela,
        seguradora:       'Tokio Marine',
        produto:          produto || null,
        status:           valor < 0 ? 'cancelado' : 'recebido',
        origem:           'importacao',
        importacao_id:    imp?.id || null,
        obs,
      })
      if (error) { erros++; msgs.push(`${numApolice}: ${error.message?.slice(0,80)}`); continue }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

// ─── DETECÇÃO AUTOMÁTICA DE TIPO ─────────────────────────────
function detectarTipo(xml: string, nomeArquivo: string): string {
  const n = (nomeArquivo||'').toLowerCase()
  if (n.includes('extrato') || n.includes('comiss')) return 'COMISSOES'
  if (n.includes('parcel'))  return 'PARCELAS'
  if (n.includes('endosso')) return 'APOLICES'   // mesmo arquivo da apólice
  if (n.includes('apolice') || n.includes('proposta')) return 'APOLICES'

  const has = (re: RegExp) => re.test(xml)
  if (has(/<(?:[A-Za-z0-9_]+:)?Extrato\b/i) || has(/<(?:[A-Za-z0-9_]+:)?DetalheComissao\b/i)) return 'COMISSOES'
  if (has(/<(?:[A-Za-z0-9_]+:)?período\b/i) || has(/<(?:[A-Za-z0-9_]+:)?periodo\b/i) || has(/<(?:[A-Za-z0-9_]+:)?dtVencimento\b/i)) return 'PARCELAS'
  if (has(/<(?:[A-Za-z0-9_]+:)?DadosSeguro\b/i)) return 'APOLICES'
  return 'OUTRO'
}

async function processarArquivo(nomeArquivo: string, xml: string, tipo: string) {
  const { data: importacao } = await supabaseAdmin.from('importacoes_tokio').insert({
    tipo_arquivo: tipo, nome_arquivo: nomeArquivo,
    data_geracao: new Date().toISOString().split('T')[0],
    qtd_registros: (xml.match(/</g) || []).length,
    status: 'processando',
  }).select().single()

  let resultado: { importados: number; erros: number; msgs: string[] }
  if      (tipo === 'APOLICES'  || tipo === 'ENDOSSOS') resultado = await processarApolices(xml)
  else if (tipo === 'PARCELAS')  resultado = await processarParcelas(xml)
  else if (tipo === 'COMISSOES') resultado = await processarComissoes(xml)
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
        modo: 'Upload XML + Webservice REST',
        tipos_aceitos: ['APOLICES (inclui endossos)', 'PARCELAS', 'COMISSOES'],
        supabase_url:  process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configurado' : 'FALTA',
        supabase_role: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configurado' : 'FALTA',
        ws_user:        TOKIO_USER ? `sim (${TOKIO_USER.slice(0,8)}…)` : 'NÃO CONFIGURADO',
        ws_password:    TOKIO_PASSWORD ? 'sim' : 'NÃO CONFIGURADA',
        ws_service_key: TOKIO_SERVICE_KEY ? `sim (${TOKIO_SERVICE_KEY.length} chars)` : 'NÃO CONFIGURADA',
        endossos_cancelamento: 'desconsidera valores quando qtdeParcelas=0 e tpComplemento for de cancelamento',
      })
    }

    if (action === 'testar_login') {
      try {
        const token = await tokioLogin(true)
        return NextResponse.json({ ok: true, token_preview: token.slice(0,20) + '…', expira_em: '~25min' })
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
      }
    }

    // Busca dados via webservice. params: { servico: 'getApolice'|'getParcela'|'getExtrato', ...filtros }
    if (action === 'sincronizar') {
      const servicoMap: Record<string, { endpoint: string; tipo: string }> = {
        APOLICES:  { endpoint: 'getApolice',   tipo: 'APOLICES'  },
        PARCELAS:  { endpoint: 'getParcela',   tipo: 'PARCELAS'  },
        COMISSOES: { endpoint: 'getExtrato',   tipo: 'COMISSOES' },
        SINISTRO:  { endpoint: 'getSinistro',  tipo: 'OUTRO'     },
        RENOVACAO: { endpoint: 'getRenovacao', tipo: 'OUTRO'     },
        PENDENCIA: { endpoint: 'getPendencia', tipo: 'OUTRO'     },
        RECUSA:    { endpoint: 'getRecusa',    tipo: 'APOLICES'  },
      }
      const cfg = servicoMap[String(params.servico||'').toUpperCase()]
      if (!cfg) return NextResponse.json({ error: 'parametro `servico` invalido. Use APOLICES|PARCELAS|COMISSOES|SINISTRO|RENOVACAO|PENDENCIA|RECUSA' }, { status: 400 })

      const filtros: Record<string,string> = {}
      if (params.dataInicio) filtros.dataInicio = String(params.dataInicio)
      if (params.dataFim)    filtros.dataFim    = String(params.dataFim)
      if (params.numApolice) filtros.numApolice = String(params.numApolice)

      try {
        const xml = await tokioGet(cfg.endpoint, filtros)
        const nome = `tokio-${cfg.endpoint}-${Date.now()}.xml`
        // Se o servico nao tem parser dedicado, apenas devolve o conteúdo para inspecao
        if (cfg.tipo === 'OUTRO') {
          return NextResponse.json({ ok: true, servico: cfg.endpoint, tamanho: xml.length, preview: xml.slice(0,1200) })
        }
        const resultado = await processarArquivo(nome, xml, cfg.tipo)
        return NextResponse.json({ ok: true, arquivo: nome, servico: cfg.endpoint, tipo: cfg.tipo, ...resultado })
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
      }
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
