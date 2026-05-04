import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'
export const maxDuration = 300

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

// ─── Webservice Tokio Marine ─────────────────────────────────
// Endpoints podem ser sobrescritos via env (TOKIO_BASE / TOKIO_LOGIN_PATH).
// Default segue a documentação oficial do wscorretor:
//   POST  /Corretor/Login        → autenticação (retorna token)
//   GET   /Corretor/getApolice   → propostas, apólices e endossos
//   GET   /Corretor/getParcela   → parcelas pagas ao corretor
//   GET   /Corretor/getExtratoComiss → extrato de comissões
//   GET   /Corretor/getSinistro  → dados de sinistros
//   GET   /Corretor/getRenovacao → dados de renovação
//   GET   /Corretor/getPendencia → pendências do corretor
//   GET   /Corretor/getRecusa    → recusas, apólices e endossos
const TOKIO_BASE        = process.env.TOKIO_BASE        || 'https://servicos.tokiomarine.com.br/wscorretor/rest'
const TOKIO_LOGIN_PATH  = process.env.TOKIO_LOGIN_PATH  || '/Corretor/Login'
const TOKIO_USER        = process.env.TOKIO_USER        || ''
const TOKIO_PASSWORD    = process.env.TOKIO_PASSWORD    || ''
const TOKIO_SERVICE_KEY = process.env.TOKIO_SERVICE_KEY || ''

// Cache simples do token (vive por instância da Lambda)
let tokenCache: { token: string; exp: number } | null = null

// Headers genéricos de browser pra evitar bloqueio do Imperva.
// O WAF da Tokio (X-CDN: Imperva) bloqueia User-Agents de bot/lib.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
}

// Cookie jar simples — Imperva exige reaproveitar visid_incap / incap_ses
let cookieJar = ''
function mergeCookies(setCookieHeader: string | null) {
  if (!setCookieHeader) return
  const parts = setCookieHeader.split(/,(?=[^;]+=)/)
  for (const p of parts) {
    const kv = p.split(';')[0].trim()
    if (kv.includes('=')) {
      const [name] = kv.split('=')
      // Substitui se já existe no jar
      cookieJar = cookieJar
        .split('; ')
        .filter(c => c && !c.startsWith(name+'='))
        .concat(kv)
        .join('; ')
    }
  }
}

// Path do login que efetivamente funcionou (descoberto em runtime).
// A documentação oficial diz `/Corretor/Login`, mas o servidor real
// (Spring Boot 3.x) responde 404 nesse path em alguns ambientes.
// Quando o configurado falha, varremos algumas variações conhecidas.
let resolvedLoginPath: string | null = null

// Ordem dos candidatos: o path real (descoberto via 400 “service_key
// is not present”) é `/Corretor/login` em minúsculo. Mantemos os
// outros como fallback.
const LOGIN_PATH_CANDIDATES = [
  '/Corretor/login',
  '/Corretor/Login',
  '/Corretor/Autenticar',
  '/Corretor/autenticar',
  '/Corretor/auth',
  '/Corretor/authenticate',
  '/Corretor/token',
  '/Corretor/getToken',
  '/Corretor/Acessar',
  '/Login',
  '/login',
]

// Header obrigatório descoberto na resposta do servidor:
//   {"detail":"Required header 'service_key' is not present."}
// Mantemos serviceKey no body também por compatibilidade — alguns
// ambientes podem aceitar de qualquer um dos dois jeitos.
async function tentarLoginEmPath(path: string): Promise<{ ok: boolean; status: number; body: string }> {
  const r = await fetch(`${TOKIO_BASE}${path}`, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'service_key':  TOKIO_SERVICE_KEY,
      'serviceKey':   TOKIO_SERVICE_KEY,
      'Service-Key':  TOKIO_SERVICE_KEY,
      ...(cookieJar ? { 'Cookie': cookieJar } : {}),
    },
    body: JSON.stringify({
      user: TOKIO_USER,
      password: TOKIO_PASSWORD,
      serviceKey: TOKIO_SERVICE_KEY,
    }),
    signal: AbortSignal.timeout(25000),
  })
  mergeCookies(r.headers.get('set-cookie'))
  const body = await r.text()
  return { ok: r.ok, status: r.status, body }
}

async function tokioLogin(force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.exp > Date.now()) return tokenCache.token
  if (!TOKIO_USER || !TOKIO_PASSWORD || !TOKIO_SERVICE_KEY) {
    throw new Error('Credenciais Tokio não configuradas (TOKIO_USER/TOKIO_PASSWORD/TOKIO_SERVICE_KEY).')
  }
  // Handshake Imperva: GET inicial pra captar cookies de sessão antes do POST
  try {
    const warm = await fetch(TOKIO_BASE, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(10000) })
    mergeCookies(warm.headers.get('set-cookie'))
  } catch {}

  // Ordem de tentativa: path já descoberto > configurado via env > candidatos
  const ordem: string[] = []
  if (resolvedLoginPath) ordem.push(resolvedLoginPath)
  if (TOKIO_LOGIN_PATH && !ordem.includes(TOKIO_LOGIN_PATH)) ordem.push(TOKIO_LOGIN_PATH)
  for (const p of LOGIN_PATH_CANDIDATES) if (!ordem.includes(p)) ordem.push(p)

  let ultimo: { status: number; body: string; path: string } | null = null
  for (const path of ordem) {
    let res
    try {
      res = await tentarLoginEmPath(path)
    } catch (err: any) {
      ultimo = { status: 0, body: err.message?.slice(0, 200) || 'erro de rede', path }
      continue
    }
    ultimo = { status: res.status, body: res.body.slice(0, 200), path }
    // 404/405 -> path errado, próximo
    if (res.status === 404 || res.status === 405) continue
    // Não autorizado já significa que o path existe (mas creds erradas)
    if (!res.ok) {
      throw new Error(`Tokio Login HTTP ${res.status} em ${path}: ${res.body.slice(0,200)}`)
    }
    // Sucesso — extrai token
    let token = ''
    try {
      const j = JSON.parse(res.body)
      // Resposta real observada em /Corretor/login:
      //   {"data":{"auth_token":"eyJ..."}}
      // Aceitamos também os formatos antigos / variantes.
      token = j?.data?.auth_token || j?.data?.token || j?.data?.accessToken
           || j.auth_token || j.authToken
           || j.token || j.access_token || j.accessToken || j.Token || ''
    } catch {
      token = res.body.replace(/^"|"$/g, '').trim()
    }
    if (!token) throw new Error(`Tokio Login: token não encontrado em ${path}: ${res.body.slice(0,200)}`)
    resolvedLoginPath = path
    tokenCache = { token, exp: Date.now() + 25 * 60 * 1000 }
    return token
  }
  throw new Error(`Tokio Login: nenhum path aceito. Última tentativa ${ultimo?.path} HTTP ${ultimo?.status}: ${ultimo?.body}`)
}

async function tokioGet(servico: string, params: Record<string,string|number> = {}): Promise<string> {
  let token = await tokioLogin()
  // `servico` aceita tanto o nome curto ("getApolice") quanto o caminho
  // completo ("/Corretor/getApolice"). Quando vier curto, prefixamos
  // com /Corretor/ conforme documentação oficial.
  const path = servico.startsWith('/') ? servico
             : servico.startsWith('Corretor/') ? `/${servico}`
             : `/Corretor/${servico}`
  const url = `${TOKIO_BASE}${path}`
  const headers = (t: string) => ({
    ...BROWSER_HEADERS,
    'Accept': 'application/xml, application/json, text/xml',
    'Content-Type': 'application/json',
    // Header de auth: o servidor exige `auth_token` (snake_case) —
    // descoberto via "Required header 'auth_token' is not present"
    // nos serviços. Mantemos as variantes antigas por segurança.
    'auth_token':    t,
    'authToken':     t,
    'Auth-Token':    t,
    'Authorization': `Bearer ${t}`,
    'token':         t,
    // O servidor exige `service_key` em todas as chamadas — descoberto
    // ao receber 400 com "Required header 'service_key' is not present"
    // no /Corretor/login.
    'service_key':  TOKIO_SERVICE_KEY,
    'serviceKey':   TOKIO_SERVICE_KEY,
    'Service-Key':  TOKIO_SERVICE_KEY,
    ...(cookieJar ? { 'Cookie': cookieJar } : {}),
  })
  // Servidor responde 405 a GET — exige POST com filtros no body.
  // Mantemos a função com nome "tokioGet" por compatibilidade, mas
  // o método é POST e os params vão no JSON.
  const body = JSON.stringify(params || {})
  let r = await fetch(url, { method: 'POST', headers: headers(token), body, signal: AbortSignal.timeout(60000) })
  if (r.status === 401) {
    // Token expirou — refaz login uma vez
    token = await tokioLogin(true)
    r = await fetch(url, { method: 'POST', headers: headers(token), body, signal: AbortSignal.timeout(60000) })
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
    const { data } = await supabaseAdmin().from('clientes').select('id, nome').eq('cpf_cnpj', cpfCnpj).maybeSingle()
    if (data?.id) {
      if (nome && (!data.nome || data.nome === 'Sem nome')) {
        await supabaseAdmin().from('clientes').update({ nome }).eq('id', data.id)
      }
      return data.id
    }
  }
  if (!cpfCnpj && nome) {
    const { data } = await supabaseAdmin().from('clientes').select('id').ilike('nome', nome).maybeSingle()
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
  const { data, error } = await supabaseAdmin().from('clientes').insert(payload).select('id').single()
  if (error) { console.warn('[Tokio] erro criando cliente:', error.message); return null }
  return data?.id || null
}

async function buscarApolicePorNumero(numero: string) {
  if (!numero) return null
  const limpo = numero.replace(/^0+/, '') || numero
  const { data } = await supabaseAdmin().from('apolices')
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
  // Telefone vem como <Telefone><ddd>11</ddd><numero>99999</numero></Telefone>
  const blocoTel = (getBlocks(bloco, ['Telefone', 'telefone'])[0]) || ''
  const ddd      = getTag(blocoTel || bloco, ['ddd'])
  const numTel   = getTag(blocoTel, ['numero']) || getTag(bloco, ['nrTelefone', 'numTelefone'])

  // Endereço
  const blocoEnd  = (getBlocks(bloco, ['Endereco', 'endereco'])[0]) || ''
  const endereco  = getTag(blocoEnd, ['logradouro', 'endereco'])
  const numeroEnd = getTag(blocoEnd, ['numero', 'nrEndereco'])
  const complemento = getTag(blocoEnd, ['complemento'])
  const bairro    = getTag(blocoEnd, ['bairro'])
  const cidade    = getTag(blocoEnd, ['cidade', 'municipio'])
  const uf        = getTag(blocoEnd, ['uf', 'estado'])
  const cep       = getTag(blocoEnd, ['cep'])

  const ramo     = getTag(bloco, ['ramo'])
  const produto  = getTag(bloco, ['Produto', 'produto'])
  const numApolice    = getTag(bloco, ['numApoIice', 'numApolice', 'numeroApolice'])
  const numProposta   = getTag(bloco, ['NumProposta', 'numProposta'])
  const numEndosso    = getTag(bloco, ['numEndosso', 'numeroEndosso'])
  const tpComplemento = getTag(bloco, ['tpComplemento'])
  const tipoSeguro    = getTag(bloco, ['TipoSeguro', 'tipoSeguro'])
  const statusApolice = getTag(bloco, ['StatusApoliceEndosso', 'StatusProposta', 'statusApolice'])
  const dtCanc        = toDate(getTag(bloco, ['dtCancelamento']))
  const dtRecusa      = toDate(getTag(bloco, ['dtRecusa']))
  const motivoRecusa  = getTag(bloco, ['motivoDeRecusa', 'motivoRecusa'])

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
  const combustivel     = getTag(blocoAuto, ['combustivel', 'tipoCombustivel'])
  const cor             = getTag(blocoAuto, ['cor'])
  const zerokm          = getTag(blocoAuto, ['zeroKm', 'zerokm'])

  // Corretor lider (para futuramente vincular vendedor)
  const blocoCorretor   = (getBlocks(bloco, ['Corretor'])[0]) || bloco
  const cdCorretor      = getTag(blocoCorretor, ['cdCorretor'])
  const nmCorretor      = getTag(blocoCorretor, ['nmCorretor', 'NmCorretor'])

  return {
    nome, cpfCnpj, tpPessoa, email, ddd, numTel,
    endereco, numeroEnd, complemento, bairro, cidade, uf, cep,
    ramo, produto,
    numApolice, numProposta, numEndosso, tpComplemento, tipoSeguro, statusApolice,
    dtCanc, dtRecusa, motivoRecusa,
    vigIni, vigFim, emissao, vigIniEnd, vigFimEnd, emissaoEnd,
    formaCobranca, qtdParc, premioLiq, iof, premioTotal, custoApolice,
    pcComissao, vlrComissao,
    placa, modelo, fabricante, anoModelo, anoFabricacao, chassi,
    combustivel, cor, zerokm,
    cdCorretor, nmCorretor,
  }
}

// ─── PROCESSAR APÓLICES / PROPOSTAS / ENDOSSOS ───────────────
// O arquivo "Propostas/Apólices e Endossos" pode trazer um ou
// vários blocos <DadosSeguro> (cada um com os adjacentes). Quando
// `numEndosso` está preenchido, o registro é endosso → também
// inserimos em public.endossos. Cancelamentos com qtdeParcelas=0
// têm valores zerados.
async function processarApolices(xml: string, importacaoId?: string | null) {
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
        // Campos extras da Tokio (migration 071_)
        tipo_seguro:          c.tipoSeguro || null,
        status_apolice_tokio: c.statusApolice || null,
        motivo_recusa:        c.motivoRecusa || null,
        data_cancelamento:    c.dtCanc || null,
        data_recusa:          c.dtRecusa || null,
        vigencia_ini_endosso: c.vigIniEnd || null,
        vigencia_fim_endosso: c.vigFimEnd || null,
        emissao_endosso:      c.emissaoEnd || null,
        chassi:               c.chassi || null,
        fabricante:           c.fabricante || null,
        ano_fabricacao:       c.anoFabricacao || null,
        email_segurado:       c.email || null,
        ddd_segurado:         c.ddd || null,
        telefone_segurado:    c.numTel || null,
        tipo_complemento:     c.tpComplemento || null,
        custo_apolice:        cancelamento ? 0 : c.custoApolice,
        valor_comissao:       vlrComissaoFinal,
        cd_corretor:          c.cdCorretor || null,
        nm_corretor:          c.nmCorretor || null,
        dados_tokio:          { ...dadosBrutos, cancelamento },
      }
      const { data: apolice, error: errApol } = await supabaseAdmin().from('apolices').upsert(payload, {
        onConflict: 'numero', ignoreDuplicates: false,
      }).select('id, cliente_id').single()
      if (errApol) { erros++; msgs.push(`${numero}: ${errApol.message?.slice(0,80)}`); continue }

      // Salva cópia raw com TODOS os campos (1 linha por apolice+endosso)
      await supabaseAdmin().from('tokio_apolices_raw').upsert({
        num_apolice:          c.numApolice || null,
        num_proposta:         c.numProposta || null,
        num_endosso:          c.numEndosso || '',
        ramo:                 c.ramo || null,
        produto:              c.produto || null,
        tipo_seguro:          c.tipoSeguro || null,
        status_apolice:       c.statusApolice || null,
        tp_complemento:       c.tpComplemento || null,
        cpf_cnpj:             c.cpfCnpj || null,
        nome_segurado:        c.nome || null,
        tp_pessoa:            c.tpPessoa || null,
        email:                c.email || null,
        ddd:                  c.ddd || null,
        telefone:             c.numTel || null,
        endereco:             c.endereco || null,
        numero:               c.numeroEnd || null,
        complemento:          c.complemento || null,
        bairro:               c.bairro || null,
        cidade:               c.cidade || null,
        uf:                   c.uf || null,
        cep:                  c.cep || null,
        data_emissao:         c.emissao || null,
        vigencia_ini:         c.vigIni || null,
        vigencia_fim:         c.vigFim || null,
        vigencia_ini_endosso: c.vigIniEnd || null,
        vigencia_fim_endosso: c.vigFimEnd || null,
        emissao_endosso:      c.emissaoEnd || null,
        data_cancelamento:    c.dtCanc || null,
        data_recusa:          c.dtRecusa || null,
        motivo_recusa:        c.motivoRecusa || null,
        forma_cobranca:       c.formaCobranca || null,
        qtd_parcelas:         c.qtdParc,
        premio_liquido:       c.premioLiq,
        valor_iof:            c.iof,
        premio_total:         c.premioTotal,
        custo_apolice:        c.custoApolice,
        pc_comissao:          c.pcComissao,
        vlr_comissao:         c.vlrComissao,
        placa:                c.placa || null,
        chassi:               c.chassi || null,
        modelo:               c.modelo || null,
        fabricante:           c.fabricante || null,
        ano_modelo:           c.anoModelo || null,
        ano_fabricacao:       c.anoFabricacao || null,
        combustivel:          c.combustivel || null,
        cor:                  c.cor || null,
        zerokm:               c.zerokm || null,
        cd_corretor:          c.cdCorretor || null,
        nm_corretor:          c.nmCorretor || null,
        apolice_id:           apolice?.id || null,
        cliente_id:           apolice?.cliente_id || clienteId || null,
        importacao_id:        importacaoId || null,
        dados_brutos:         { bloco_xml: bloco.slice(0, 8000), cancelamento },
      }, { onConflict: 'num_apolice,num_endosso' })

      // ── Se tiver endosso, registrar em public.endossos ──
      if (c.numEndosso) {
        const { error: errEnd } = await supabaseAdmin().from('endossos').upsert({
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
          await supabaseAdmin().from('historico').insert({
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
async function processarParcelas(xml: string, importacaoId?: string | null) {
  const blocks = getBlocks(xml, ['parcela'])
  const lista = blocks.length ? blocks : [xml]
  let importados = 0, erros = 0
  const msgs: string[] = []

  for (const bloco of lista) {
    try {
      const numApolice    = getTag(bloco, ['numApolice', 'numeroApolice'])
      const numEndosso    = getTag(bloco, ['numendosso', 'numEndosso'])
      const numProposta   = getTag(bloco, ['numProposta', 'NumProposta'])
      const ramo          = getTag(bloco, ['ramo'])
      const cpfCnpj       = digits(getTag(bloco, ['CPFCnpj', 'cpfCnpj']))
      const nome          = getTag(bloco, ['nomeSegurado', 'nome'])
      const produto       = getTag(bloco, ['Produto', 'produto'])
      const numParcela    = parseInt(getTag(bloco, ['numParcela']) || '') || null
      const totParcelas   = parseInt(getTag(bloco, ['qtdeParcela']) || '') || null
      const venc          = toDate(getTag(bloco, ['dtVencimento']))
      const dataPag       = toDate(getTag(bloco, ['dtPagamento']))
      const dataBaixa     = toDate(getTag(bloco, ['dtBaixa']))
      const dataEmissao   = toDate(getTag(bloco, ['dtEmissao', 'dtEmissaoApolice']))
      const dataComp      = toDate(getTag(bloco, ['dtCompetencia', 'dataCompetencia']))
      const formaCobr     = getTag(bloco, ['dsFormaCobranca'])
      const valor         = num(getTag(bloco, ['vlrPremioParcela'])) || 0
      const vlrJuros      = num(getTag(bloco, ['vlrJuros'])) || 0
      const vlrIOF        = num(getTag(bloco, ['vlrIOF'])) || 0
      const vlrComissao   = num(getTag(bloco, ['vlrComissao'])) || 0
      const vlrLiquido    = num(getTag(bloco, ['vlrLiquido']))
      const vlrDesconto   = num(getTag(bloco, ['vlrDesconto']))
      const vlrMulta      = num(getTag(bloco, ['vlrMulta']))
      const vlrTotal      = num(getTag(bloco, ['vlrTotal']))
      const banco         = getTag(bloco, ['bancoCobranca', 'banco'])
      const agencia       = getTag(bloco, ['agencia'])
      const conta         = getTag(bloco, ['conta'])
      const numBoleto     = getTag(bloco, ['numBoleto', 'numeroBoleto'])
      const numNotaFiscal = getTag(bloco, ['numNotaFiscal', 'numeroNotaFiscal', 'numNF'])
      const status        = getTag(bloco, ['StatusApoliceEndosso', 'situacaoParcela', 'status']).toLowerCase()
      const situacao      = getTag(bloco, ['situacaoParcela', 'StatusApoliceEndosso'])
      const cdCorretor    = getTag(bloco, ['cdCorretor', 'CdCorretor'])
      const nmCorretor    = getTag(bloco, ['nmCorretor', 'NmCorretor'])
      if (!venc) { msgs.push(`sem vencimento (apólice ${numApolice})`); erros++; continue }

      const apolice = await buscarApolicePorNumero(numApolice)
      const clienteId = apolice?.cliente_id
        || await obterOuCriarCliente({ cpfCnpj, nome, dadosBrutos: { numApolice, numParcela, produto } })

      const pago = !!dataPag || !!dataBaixa || ['paga','pago','liquidada','quitada'].includes(status)

      const conta_pagar = {
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
      const { data: existing } = await supabaseAdmin().from('contas_pagar')
        .select('id').ilike('nome', `%Apólice ${numApolice} parc ${numParcela}/%`)
        .eq('vencimento', venc).maybeSingle()

      let contaPagarId: string | null = null
      if (existing?.id) {
        contaPagarId = (existing as any).id
        await supabaseAdmin().from('contas_pagar').update({
          status: conta_pagar.status, data_pagamento: conta_pagar.data_pagamento, valor: conta_pagar.valor,
        }).eq('id', (existing as any).id)
      } else {
        const { data: novaConta, error } = await supabaseAdmin().from('contas_pagar').insert(conta_pagar).select('id').single()
        if (error) { erros++; msgs.push(error.message?.slice(0,80)); continue }
        contaPagarId = (novaConta as any)?.id || null
      }

      // Salva cópia raw com TODOS os campos
      await supabaseAdmin().from('tokio_parcelas').upsert({
        num_apolice:        numApolice || null,
        num_endosso:        numEndosso || null,
        num_proposta:       numProposta || null,
        ramo:               ramo || null,
        produto:            produto || null,
        cpf_cnpj:           cpfCnpj || null,
        nome_segurado:      nome || null,
        num_parcela:        numParcela,
        qtde_parcela:       totParcelas,
        data_vencimento:    venc,
        data_pagamento:     dataPag,
        data_baixa:         dataBaixa,
        data_emissao:       dataEmissao,
        data_competencia:   dataComp,
        vlr_premio_parcela: valor,
        vlr_juros:          vlrJuros,
        vlr_iof:            vlrIOF,
        vlr_comissao:       vlrComissao,
        vlr_liquido:        vlrLiquido,
        vlr_desconto:       vlrDesconto,
        vlr_multa:          vlrMulta,
        vlr_total:          vlrTotal,
        forma_cobranca:     formaCobr || null,
        banco_cobranca:     banco || null,
        agencia:            agencia || null,
        conta:              conta || null,
        num_boleto:         numBoleto || null,
        num_nota_fiscal:    numNotaFiscal || null,
        status_parcela:     status || null,
        situacao_parcela:   situacao || null,
        cd_corretor:        cdCorretor || null,
        nm_corretor:        nmCorretor || null,
        apolice_id:         apolice?.id || null,
        cliente_id:         clienteId || null,
        conta_pagar_id:     contaPagarId,
        importacao_id:      importacaoId || null,
        dados_brutos:       { bloco_xml: bloco.slice(0, 4000) },
      }, { onConflict: 'num_apolice,num_parcela,data_vencimento' })

      // Tarefa de aviso pra responsável (parcela vencendo em ≤7 dias)
      if (!pago && apolice?.vendedor_id && clienteId) {
        const dias = Math.floor((new Date(venc).getTime() - Date.now()) / 86400000)
        if (dias <= 7) {
          await supabaseAdmin().from('tarefas').insert({
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
async function processarComissoes(xml: string, importacaoId?: string | null) {
  const numExtrato     = getTag(xml, ['numExtrato'])
  const cdCorretor     = getTag(xml, ['CdCorretor', 'cdCorretor'])
  const nmCorretor     = getTag(xml, ['NmCorretor', 'nmCorretor'])
  const dtPagto        = toDate(getTag(xml, ['dtPagamento']))
  const dtEmissao      = toDate(getTag(xml, ['dtEmissao']))
  const vlrTotal       = num(getTag(xml, ['vlrTotal']))
  const vlrLiquido     = num(getTag(xml, ['vlrLiquido']))
  const vlrBruto       = num(getTag(xml, ['vlrBruto']))
  const vlrDescontos   = num(getTag(xml, ['vlrDescontos', 'vlrDesconto']))
  const vlrAcrescimos  = num(getTag(xml, ['vlrAcrescimos', 'vlrAcrescimo']))
  const vlrIss         = num(getTag(xml, ['vlrIss', 'vlrISS']))
  const vlrIrrf        = num(getTag(xml, ['vlrIrrf', 'vlrIRRF']))

  const detalhes = getBlocks(xml, ['DetalheComissao'])
  let importados = 0, erros = 0
  const msgs: string[] = []

  // Importação master legada (mantida)
  const { data: imp } = await supabaseAdmin().from('importacoes_comissao').insert({
    nome_arquivo: `tokio-extrato-${numExtrato || Date.now()}.xml`,
    competencia: dtPagto ? dtPagto.slice(0,7) : new Date().toISOString().slice(0,7),
    qtd_registros: detalhes.length,
    total_importado: vlrLiquido || vlrTotal || 0,
    status: 'processado',
  }).select('id').single()

  // Cabeçalho do extrato — uma linha em tokio_extrato_comissoes
  const { data: extratoRow } = await supabaseAdmin().from('tokio_extrato_comissoes').upsert({
    num_extrato:    numExtrato || `auto-${Date.now()}`,
    cd_corretor:    cdCorretor || null,
    nm_corretor:    nmCorretor || null,
    data_pagamento: dtPagto,
    data_emissao:   dtEmissao,
    competencia:    dtPagto ? dtPagto.slice(0,7) : null,
    vlr_total:      vlrTotal,
    vlr_bruto:      vlrBruto,
    vlr_liquido:    vlrLiquido,
    vlr_descontos:  vlrDescontos,
    vlr_acrescimos: vlrAcrescimos,
    vlr_iss:        vlrIss,
    vlr_irrf:       vlrIrrf,
    qtd_detalhes:   detalhes.length,
    importacao_id:  importacaoId || null,
    dados_brutos:   { xml_preview: xml.slice(0, 4000) },
  }, { onConflict: 'num_extrato' }).select('id').single()
  const extratoId = (extratoRow as any)?.id || null

  for (const bloco of detalhes) {
    try {
      const numApolice    = getTag(bloco, ['numApolice'])
      const numEndosso    = getTag(bloco, ['numEndosso'])
      const numProposta   = getTag(bloco, ['numProposta', 'NumProposta'])
      const ramo          = getTag(bloco, ['ramo'])
      const produto       = getTag(bloco, ['Produto', 'produto'])
      const tipoSeguro    = getTag(bloco, ['TipoSeguro', 'tipoSeguro'])
      const cpfCnpj       = digits(getTag(bloco, ['CPFCnpj', 'cpfCnpj']))
      const nome          = getTag(bloco, ['nomeSegurado', 'nome'])
      const tpPessoa      = getTag(bloco, ['tpPessoa'])
      const numParcela    = parseInt(getTag(bloco, ['numParcela']) || '1') || 1
      const qtdParcela    = parseInt(getTag(bloco, ['qtdeParcela']) || '1') || 1
      const pcComissao    = num(getTag(bloco, ['pcComissao']))
      const valor         = num(getTag(bloco, ['vlrComissaoParcela'])) || 0
      const vlrPremio     = num(getTag(bloco, ['vlrPremio']))
      const vlrPremioLiq  = num(getTag(bloco, ['vlrPremioLiquido']))
      const vlrIof        = num(getTag(bloco, ['vlrIOF']))
      const cdNatureza    = getTag(bloco, ['cdNatureza'])
      const dsNatureza    = getTag(bloco, ['dsNatureza'])
      const cdTipoPagto   = getTag(bloco, ['cdTipoPagto'])
      const dsTipoPagto   = getTag(bloco, ['dsTipoPagto'])
      const statusApol    = getTag(bloco, ['StatusApolice', 'statusApolice'])
      const dtEmissaoDet  = toDate(getTag(bloco, ['dtEmissao']))
      const dtPagtoDet    = toDate(getTag(bloco, ['dtPagamento'])) || dtPagto
      const dtMovimento   = toDate(getTag(bloco, ['dtMovimento']))
      const dtCompetencia = toDate(getTag(bloco, ['dtCompetencia']))

      const apolice = await buscarApolicePorNumero(numApolice)
      const vendedorId = apolice?.vendedor_id

      const obs = [
        cpfCnpj && `CPF/CNPJ ${cpfCnpj}`,
        nome, produto,
        cdTipoPagto && `Tipo ${cdTipoPagto}`,
        cdNatureza && `Natureza ${cdNatureza}`,
        numEndosso && `Endosso ${numEndosso}`,
        statusApol && `Status ${statusApol}`,
        nmCorretor && `Corretor ${cdCorretor||''} ${nmCorretor}`,
        vlrPremio != null && `Prêmio R$ ${vlrPremio}`,
      ].filter(Boolean).join(' | ')

      let comissaoRecebidaId: string | null = null
      if (vendedorId) {
        const { data: insRow, error } = await supabaseAdmin().from('comissoes_recebidas').insert({
          apolice_id:       apolice?.id || null,
          cliente_id:       apolice?.cliente_id || null,
          vendedor_id:      vendedorId,
          valor:            Math.abs(valor),
          competencia:      dtPagtoDet ? dtPagtoDet.slice(0,7) : '',
          data_recebimento: dtPagtoDet,
          parcela:          numParcela,
          total_parcelas:   qtdParcela,
          seguradora:       'Tokio Marine',
          produto:          produto || null,
          status:           valor < 0 ? 'cancelado' : 'recebido',
          origem:           'importacao',
          importacao_id:    (imp as any)?.id || null,
          obs,
        }).select('id').single()
        if (error) { msgs.push(`${numApolice}: ${error.message?.slice(0,80)} (raw salvo)`) }
        comissaoRecebidaId = (insRow as any)?.id || null
      } else {
        msgs.push(`apólice ${numApolice}: sem vendedor — só salvo em tokio_detalhe_comissao`)
      }

      // Salva sempre o detalhe raw com TODOS os campos
      await supabaseAdmin().from('tokio_detalhe_comissao').insert({
        extrato_id:           extratoId,
        num_extrato:          numExtrato || null,
        num_apolice:          numApolice || null,
        num_endosso:          numEndosso || null,
        num_proposta:         numProposta || null,
        ramo:                 ramo || null,
        produto:              produto || null,
        tipo_seguro:          tipoSeguro || null,
        cpf_cnpj:             cpfCnpj || null,
        nome_segurado:        nome || null,
        tp_pessoa:            tpPessoa || null,
        num_parcela:          numParcela,
        qtde_parcela:         qtdParcela,
        pc_comissao:          pcComissao,
        vlr_comissao_parcela: valor,
        vlr_premio:           vlrPremio,
        vlr_premio_liquido:   vlrPremioLiq,
        vlr_iof:              vlrIof,
        cd_natureza:          cdNatureza || null,
        ds_natureza:          dsNatureza || null,
        cd_tipo_pagto:        cdTipoPagto || null,
        ds_tipo_pagto:        dsTipoPagto || null,
        status_apolice:       statusApol || null,
        data_emissao:         dtEmissaoDet,
        data_pagamento:       dtPagtoDet,
        data_movimento:       dtMovimento,
        data_competencia:     dtCompetencia,
        cd_corretor:          cdCorretor || null,
        nm_corretor:          nmCorretor || null,
        apolice_id:           apolice?.id || null,
        cliente_id:           apolice?.cliente_id || null,
        comissao_recebida_id: comissaoRecebidaId,
        importacao_id:        importacaoId || null,
        dados_brutos:         { bloco_xml: bloco.slice(0, 4000) },
      })
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

// ─── PROCESSAR SINISTROS ─────────────────────────────────────
// Layout esperado do getSinistro: blocos <DadosSinistro> ou
// <Sinistro> contendo numSinistro, numApolice, dtAviso,
// dtOcorrencia, vlrIndenizacao, etc. Como a Tokio mistura nomes
// de tags, aceitamos múltiplos aliases.
async function processarSinistros(xml: string, importacaoId?: string | null) {
  const blocos = getBlocks(xml, ['DadosSinistro', 'Sinistro', 'sinistro'])
  const lista = blocos.length ? blocos : splitByAnchor(xml, ['DadosSinistro', 'Sinistro'])
  let importados = 0, erros = 0
  const msgs: string[] = []

  for (const bloco of lista) {
    try {
      const numSinistro   = getTag(bloco, ['numSinistro', 'numeroSinistro', 'nrSinistro'])
      const numApolice    = getTag(bloco, ['numApolice', 'numApoIice', 'numeroApolice'])
      const numEndosso    = getTag(bloco, ['numEndosso', 'numeroEndosso'])
      const numProposta   = getTag(bloco, ['numProposta', 'NumProposta'])
      const ramo          = getTag(bloco, ['ramo'])
      const produto       = getTag(bloco, ['Produto', 'produto'])
      const tipoSeguro    = getTag(bloco, ['TipoSeguro', 'tipoSeguro'])
      const cpfCnpj       = digits(getTag(bloco, ['CPFCnpj', 'cpfCnpj', 'cpf', 'cnpj']))
      const nome          = getTag(bloco, ['nome', 'nomeSegurado'])
      const tpPessoa      = getTag(bloco, ['tpPessoa'])
      const email         = getTag(bloco, ['e-mail', 'dsEmail', 'email'])
      const blocoTel      = (getBlocks(bloco, ['Telefone', 'telefone'])[0]) || ''
      const ddd           = getTag(blocoTel || bloco, ['ddd'])
      const telefone      = getTag(blocoTel, ['numero']) || getTag(bloco, ['nrTelefone'])
      const dtAviso       = toDate(getTag(bloco, ['dtAviso', 'dtAvisoSinistro', 'dataAviso']))
      const dtOcorrencia  = toDate(getTag(bloco, ['dtOcorrencia', 'dataOcorrencia']))
      const dtComunicacao = toDate(getTag(bloco, ['dtComunicacao', 'dataComunicacao']))
      const dtAbertura    = toDate(getTag(bloco, ['dtAbertura', 'dataAbertura']))
      const dtEncerra     = toDate(getTag(bloco, ['dtEncerramento', 'dataEncerramento']))
      const dtPagamento   = toDate(getTag(bloco, ['dtPagamento', 'dataPagamento']))
      const situacao      = getTag(bloco, ['situacao', 'StatusSinistro', 'statusSinistro'])
      const fase          = getTag(bloco, ['fase', 'fasesinistro', 'faseSinistro'])
      const causa         = getTag(bloco, ['causa', 'dsCausa', 'natureza'])
      const grupoCausa    = getTag(bloco, ['grupoCausa', 'cdGrupoCausa'])
      const localOcorr    = getTag(bloco, ['localOcorrencia', 'enderecoOcorrencia', 'endereco'])
      const ufOcorr       = getTag(bloco, ['ufOcorrencia', 'uf'])
      const cidadeOcorr   = getTag(bloco, ['cidadeOcorrencia', 'cidade', 'municipio'])
      const cepOcorr      = getTag(bloco, ['cepOcorrencia', 'cep'])
      const vlrIndeniz    = num(getTag(bloco, ['vlrIndenizacao', 'valorIndenizacao']))
      const vlrReserva    = num(getTag(bloco, ['vlrReserva', 'valorReserva']))
      const vlrFranquia   = num(getTag(bloco, ['vlrFranquia']))
      const vlrPag        = num(getTag(bloco, ['vlrPagamento']))
      const vlrDespesas   = num(getTag(bloco, ['vlrDespesas', 'vlrDespesa']))
      // Veículo do sinistro (auto)
      const blocoAuto     = (getBlocks(bloco, ['DadosVeiculo', 'DadosSeguroAutomovel'])[0]) || ''
      const placa         = getTag(blocoAuto, ['cdPlaca', 'placa'])
      const chassi        = getTag(blocoAuto, ['chassi'])
      const modelo        = getTag(blocoAuto, ['dsModelo', 'modelo'])
      const fabricante    = getTag(blocoAuto, ['fabricante'])
      const anoModelo     = getTag(blocoAuto, ['anoModelo'])
      // Regulador / Vistoriador
      const regulador     = getTag(bloco, ['regulador', 'nmRegulador'])
      const vistoriador   = getTag(bloco, ['vistoriador', 'nmVistoriador'])
      const nrProtocolo   = getTag(bloco, ['nrProtocolo', 'numProtocolo', 'numeroProtocolo'])
      const observacao    = getTag(bloco, ['observacao', 'obs'])
      // Corretor
      const blocoCor      = (getBlocks(bloco, ['Corretor'])[0]) || bloco
      const cdCorretor    = getTag(blocoCor, ['cdCorretor'])
      const nmCorretor    = getTag(blocoCor, ['nmCorretor', 'NmCorretor'])

      if (!numSinistro && !numApolice) { msgs.push('sinistro sem identificador'); erros++; continue }

      const apolice = numApolice ? await buscarApolicePorNumero(numApolice) : null
      const clienteId = apolice?.cliente_id
        || await obterOuCriarCliente({ cpfCnpj, nome, dadosBrutos: { numSinistro, numApolice } })

      const dadosBrutos = {
        numSinistro, numApolice, numEndosso, numProposta, ramo, produto, tipoSeguro,
        cpfCnpj, nome, situacao, causa, vlrIndenizacao: vlrIndeniz, vlrReserva,
        bloco_xml: bloco.slice(0, 4000),
      }

      const payload: any = {
        numero_sinistro:   numSinistro || null,
        numero_apolice:    numApolice || null,
        numero_endosso:    numEndosso || null,
        num_proposta:      numProposta || null,
        ramo:              ramo || null,
        produto:           produto || null,
        tipo_seguro:       tipoSeguro || null,
        cpf_cnpj:          cpfCnpj || null,
        nome_segurado:     nome || null,
        tp_pessoa:         tpPessoa || null,
        email:             email || null,
        ddd:               ddd || null,
        telefone:          telefone || null,
        data_aviso:        dtAviso,
        data_ocorrencia:   dtOcorrencia,
        data_comunicacao:  dtComunicacao,
        data_abertura:     dtAbertura,
        data_encerramento: dtEncerra,
        data_pagamento:    dtPagamento,
        situacao:          situacao || null,
        fase:              fase || null,
        causa:             causa || null,
        grupo_causa:       grupoCausa || null,
        local_ocorrencia:  localOcorr || null,
        uf_ocorrencia:     ufOcorr || null,
        cidade_ocorrencia: cidadeOcorr || null,
        cep_ocorrencia:    cepOcorr || null,
        valor_indenizacao: vlrIndeniz,
        valor_reserva:     vlrReserva,
        vlr_franquia:      vlrFranquia,
        vlr_pagamento:     vlrPag,
        vlr_despesas:      vlrDespesas,
        placa:             placa || null,
        chassi:            chassi || null,
        modelo:            modelo || null,
        fabricante:        fabricante || null,
        ano_modelo:        anoModelo || null,
        regulador:         regulador || null,
        vistoriador:       vistoriador || null,
        nr_protocolo:      nrProtocolo || null,
        observacao:        observacao || null,
        cd_corretor:       cdCorretor || null,
        nm_corretor:       nmCorretor || null,
        apolice_id:        apolice?.id || null,
        cliente_id:        clienteId || null,
        importacao_id:     importacaoId || null,
        dados_brutos:      dadosBrutos,
      }

      // Sem numSinistro não há como deduplicar — insere sempre
      if (numSinistro) {
        const { error } = await supabaseAdmin().from('tokio_sinistros').upsert(payload, { onConflict: 'numero_sinistro' })
        if (error) { erros++; msgs.push(`${numSinistro}: ${error.message?.slice(0,80)}`); continue }
      } else {
        const { error } = await supabaseAdmin().from('tokio_sinistros').insert(payload)
        if (error) { erros++; msgs.push(`${numApolice}: ${error.message?.slice(0,80)}`); continue }
      }

      // Histórico no cliente, se vinculado
      if (clienteId) {
        await supabaseAdmin().from('historico').insert({
          cliente_id: clienteId, tipo: 'red',
          titulo: `🚨 Sinistro Tokio: ${numSinistro || numApolice}`,
          descricao: `${causa || situacao || 'Sinistro registrado'} | Apólice ${numApolice || '—'}`,
        })
      }
      // Notificar vendedor da apólice
      if (apolice?.vendedor_id) {
        await supabaseAdmin().from('notificacoes').insert({
          user_id: apolice.vendedor_id, tipo: 'sistema',
          titulo: `🚨 Sinistro Tokio: ${numSinistro || numApolice}`,
          descricao: `${causa || situacao || 'Novo sinistro recebido'}`,
          link: '/dashboard/seguradoras',
        })
      }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

// ─── PROCESSAR RENOVAÇÕES ────────────────────────────────────
// Layout: blocos <DadosRenovacao> ou <Renovacao> com numApolice,
// vigências antigas, novas e prêmio renovado.
async function processarRenovacoes(xml: string, importacaoId?: string | null) {
  const blocos = getBlocks(xml, ['DadosRenovacao', 'Renovacao', 'renovacao'])
  const lista = blocos.length ? blocos : splitByAnchor(xml, ['DadosRenovacao', 'Renovacao'])
  let importados = 0, erros = 0
  const msgs: string[] = []

  for (const bloco of lista) {
    try {
      const numApolice    = getTag(bloco, ['numApolice', 'numApoIice', 'numeroApolice'])
      const numProposta   = getTag(bloco, ['numProposta', 'NumProposta'])
      const numRenovacao  = getTag(bloco, ['numRenovacao', 'numeroRenovacao'])
      const ramo          = getTag(bloco, ['ramo'])
      const produto       = getTag(bloco, ['Produto', 'produto'])
      const tipoSeguro    = getTag(bloco, ['TipoSeguro', 'tipoSeguro'])
      const cpfCnpj       = digits(getTag(bloco, ['CPFCnpj', 'cpfCnpj', 'cpf', 'cnpj']))
      const nome          = getTag(bloco, ['nome', 'nomeSegurado'])
      const tpPessoa      = getTag(bloco, ['tpPessoa'])
      const email         = getTag(bloco, ['e-mail', 'dsEmail', 'email'])
      const blocoTel      = (getBlocks(bloco, ['Telefone', 'telefone'])[0]) || ''
      const telefone      = getTag(blocoTel, ['numero']) || getTag(bloco, ['nrTelefone'])
      const vigIniAtual   = toDate(getTag(bloco, ['dtInicioVigenciaAtual', 'dtInicioVigenciaAnterior']))
      const vigFimAtual   = toDate(getTag(bloco, ['dtFimVigenciaAtual', 'dtFimVigenciaAnterior']))
      const vigIni        = toDate(getTag(bloco, ['dtInicioVigencia', 'dtInicioVigenciaApolice', 'dtVigenciaInicio', 'dtInicioVigenciaRenovacao']))
      const vigFim        = toDate(getTag(bloco, ['dtFimVigencia', 'dtFimVigenciaApolice', 'dtVigenciaFim', 'dtFimVigenciaRenovacao']))
      const dtRenovacao   = toDate(getTag(bloco, ['dtRenovacao', 'dataRenovacao']))
      const dtEmissao     = toDate(getTag(bloco, ['dtEmissao', 'dtEmissaoApolice']))
      const premioAtual   = num(getTag(bloco, ['vlrPremioAtual', 'vlrPremioAnterior']))
      const premioNovo    = num(getTag(bloco, ['vlrPremioRenovacao', 'vlrPremioNovo', 'vlrPremioTotal']))
      const pcComissao    = num(getTag(bloco, ['pcComissao']))
      const vlrComissao   = num(getTag(bloco, ['vlrComissao']))
      const qtdParc       = parseInt(getTag(bloco, ['qtdeParcelas']) || '') || null
      const formaPag      = getTag(bloco, ['formaPagamento', 'dsFormaCobranca'])
      const statusRen     = getTag(bloco, ['statusRenovacao', 'situacaoRenovacao', 'StatusApoliceEndosso'])
      const situacaoRen   = getTag(bloco, ['situacaoRenovacao'])
      const blocoAuto     = (getBlocks(bloco, ['DadosSeguroAutomovel'])[0]) || ''
      const placa         = getTag(blocoAuto, ['cdPlaca', 'placa'])
      const chassi        = getTag(blocoAuto, ['chassi'])
      const modelo        = getTag(blocoAuto, ['dsModelo', 'modelo'])
      const fabricante    = getTag(blocoAuto, ['fabricante'])
      const anoModelo     = getTag(blocoAuto, ['anoModelo'])
      const observacao    = getTag(bloco, ['observacao', 'obs'])
      const blocoCor      = (getBlocks(bloco, ['Corretor'])[0]) || bloco
      const cdCorretor    = getTag(blocoCor, ['cdCorretor'])
      const nmCorretor    = getTag(blocoCor, ['nmCorretor', 'NmCorretor'])

      if (!numApolice && !numProposta) { msgs.push('renovação sem identificador'); erros++; continue }

      const apolice = numApolice ? await buscarApolicePorNumero(numApolice) : null
      const clienteId = apolice?.cliente_id
        || await obterOuCriarCliente({ cpfCnpj, nome, dadosBrutos: { numApolice, numProposta } })

      const payload: any = {
        numero_apolice:     numApolice || null,
        numero_proposta:    numProposta || null,
        numero_renovacao:   numRenovacao || null,
        ramo:               ramo || null,
        produto:            produto || null,
        tipo_seguro:        tipoSeguro || null,
        cpf_cnpj:           cpfCnpj || null,
        nome_segurado:      nome || null,
        tp_pessoa:          tpPessoa || null,
        email:              email || null,
        telefone:           telefone || null,
        vigencia_ini:       vigIni,
        vigencia_fim:       vigFim,
        vigencia_ini_atual: vigIniAtual,
        vigencia_fim_atual: vigFimAtual,
        data_renovacao:     dtRenovacao,
        data_emissao:       dtEmissao,
        premio_atual:       premioAtual,
        premio_renovacao:   premioNovo,
        pc_comissao:        pcComissao,
        vlr_comissao:       vlrComissao,
        qtd_parcelas:       qtdParc,
        forma_pagamento:    formaPag || null,
        status_renovacao:   statusRen || null,
        situacao_renovacao: situacaoRen || null,
        placa:              placa || null,
        chassi:             chassi || null,
        modelo:             modelo || null,
        fabricante:         fabricante || null,
        ano_modelo:         anoModelo || null,
        observacao:         observacao || null,
        cd_corretor:        cdCorretor || null,
        nm_corretor:        nmCorretor || null,
        apolice_id:         apolice?.id || null,
        cliente_id:         clienteId || null,
        importacao_id:      importacaoId || null,
        dados_brutos:       { bloco_xml: bloco.slice(0, 4000) },
      }

      // Dedup por (numero_apolice, vigencia_fim) quando temos os dois
      if (numApolice && vigFim) {
        const { error } = await supabaseAdmin().from('tokio_renovacoes').upsert(payload, { onConflict: 'numero_apolice,vigencia_fim' })
        if (error) { erros++; msgs.push(`${numApolice}: ${error.message?.slice(0,80)}`); continue }
      } else {
        const { error } = await supabaseAdmin().from('tokio_renovacoes').insert(payload)
        if (error) { erros++; msgs.push(`${numApolice||numProposta}: ${error.message?.slice(0,80)}`); continue }
      }

      // Tarefa de renovação para o vendedor (vence próximo)
      if (apolice?.vendedor_id && clienteId && vigFim) {
        const dias = Math.floor((new Date(vigFim).getTime() - Date.now()) / 86400000)
        if (dias <= 60 && dias >= -30) {
          await supabaseAdmin().from('tarefas').insert({
            titulo: `🔁 Renovação Tokio: Apólice ${numApolice}`,
            descricao: `Vence em ${vigFim} (${dias}d) | Prêmio renovação R$ ${premioNovo ?? '—'}`,
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

// ─── PROCESSAR PENDÊNCIAS ────────────────────────────────────
// Layout: blocos <DadosPendencia> ou <Pendencia> com tipo,
// descrição, datas de abertura/limite/resolução.
async function processarPendencias(xml: string, importacaoId?: string | null) {
  const blocos = getBlocks(xml, ['DadosPendencia', 'Pendencia', 'pendencia'])
  const lista = blocos.length ? blocos : splitByAnchor(xml, ['DadosPendencia', 'Pendencia'])
  let importados = 0, erros = 0
  const msgs: string[] = []

  for (const bloco of lista) {
    try {
      const numApolice   = getTag(bloco, ['numApolice', 'numApoIice', 'numeroApolice'])
      const numProposta  = getTag(bloco, ['numProposta', 'NumProposta'])
      const numEndosso   = getTag(bloco, ['numEndosso', 'numeroEndosso'])
      const ramo         = getTag(bloco, ['ramo'])
      const produto      = getTag(bloco, ['Produto', 'produto'])
      const tipoSeguro   = getTag(bloco, ['TipoSeguro', 'tipoSeguro'])
      const cpfCnpj      = digits(getTag(bloco, ['CPFCnpj', 'cpfCnpj', 'cpf', 'cnpj']))
      const nome         = getTag(bloco, ['nome', 'nomeSegurado'])
      const tpPessoa     = getTag(bloco, ['tpPessoa'])
      const email        = getTag(bloco, ['e-mail', 'dsEmail', 'email'])
      const blocoTel     = (getBlocks(bloco, ['Telefone', 'telefone'])[0]) || ''
      const telefone     = getTag(blocoTel, ['numero']) || getTag(bloco, ['nrTelefone'])
      const tipoPend     = getTag(bloco, ['tipoPendencia', 'tpPendencia', 'tipo'])
      const descricao    = getTag(bloco, ['descricao', 'dsPendencia'])
      const dtAbertura   = toDate(getTag(bloco, ['dtAbertura', 'dataAbertura']))
      const dtLimite     = toDate(getTag(bloco, ['dtLimite', 'dataLimite']))
      const dtVencimento = toDate(getTag(bloco, ['dtVencimento']))
      const dtResolucao  = toDate(getTag(bloco, ['dtResolucao', 'dataResolucao']))
      const situacao     = getTag(bloco, ['situacao', 'StatusPendencia', 'status'])
      const responsavel  = getTag(bloco, ['responsavel', 'nmResponsavel'])
      const areaResp     = getTag(bloco, ['areaResponsavel', 'area'])
      const prioridade   = getTag(bloco, ['prioridade'])
      const observacao   = getTag(bloco, ['observacao', 'obs'])
      const blocoCor     = (getBlocks(bloco, ['Corretor'])[0]) || bloco
      const cdCorretor   = getTag(blocoCor, ['cdCorretor'])
      const nmCorretor   = getTag(blocoCor, ['nmCorretor', 'NmCorretor'])

      if (!numApolice && !numProposta) { msgs.push('pendência sem identificador'); erros++; continue }

      const apolice = numApolice ? await buscarApolicePorNumero(numApolice) : null
      const clienteId = apolice?.cliente_id
        || await obterOuCriarCliente({ cpfCnpj, nome, dadosBrutos: { numApolice, numProposta, tipoPend } })

      const payload: any = {
        numero_apolice:    numApolice || null,
        numero_proposta:   numProposta || null,
        numero_endosso:    numEndosso || null,
        ramo:              ramo || null,
        produto:           produto || null,
        tipo_seguro:       tipoSeguro || null,
        cpf_cnpj:          cpfCnpj || null,
        nome_segurado:     nome || null,
        tp_pessoa:         tpPessoa || null,
        email:             email || null,
        telefone:          telefone || null,
        tipo_pendencia:    tipoPend || null,
        descricao:         descricao || null,
        data_abertura:     dtAbertura,
        data_limite:       dtLimite,
        data_vencimento:   dtVencimento,
        data_resolucao:    dtResolucao,
        situacao:          situacao || null,
        responsavel:       responsavel || null,
        area_responsavel:  areaResp || null,
        prioridade:        prioridade || null,
        observacao:        observacao || null,
        cd_corretor:       cdCorretor || null,
        nm_corretor:       nmCorretor || null,
        apolice_id:        apolice?.id || null,
        cliente_id:        clienteId || null,
        importacao_id:     importacaoId || null,
        dados_brutos:      { bloco_xml: bloco.slice(0, 4000) },
      }
      const { error } = await supabaseAdmin().from('tokio_pendencias').insert(payload)
      if (error) { erros++; msgs.push(`${numApolice||numProposta}: ${error.message?.slice(0,80)}`); continue }

      // Tarefa para o vendedor da apólice
      if (apolice?.vendedor_id && clienteId && !dtResolucao) {
        await supabaseAdmin().from('tarefas').insert({
          titulo: `⚠️ Pendência Tokio: Apólice ${numApolice || numProposta}`,
          descricao: `${tipoPend || 'Pendência'}${descricao ? ' | ' + descricao.slice(0,140) : ''}${dtLimite ? ' | Limite ' + dtLimite : ''}`,
          tipo: 'ligacao', status: 'pendente',
          cliente_id: clienteId,
          responsavel_id: apolice.vendedor_id, criado_por: apolice.vendedor_id,
        })
      }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

// ─── PROCESSAR RECUSAS ───────────────────────────────────────
// Layout: blocos <DadosRecusa> ou <Recusa> com numProposta,
// motivoDeRecusa, dtRecusa.
async function processarRecusas(xml: string, importacaoId?: string | null) {
  const blocos = getBlocks(xml, ['DadosRecusa', 'Recusa', 'recusa'])
  const lista = blocos.length ? blocos : splitByAnchor(xml, ['DadosRecusa', 'Recusa', 'DadosSegurado'])
  let importados = 0, erros = 0
  const msgs: string[] = []

  for (const bloco of lista) {
    try {
      const numProposta   = getTag(bloco, ['numProposta', 'NumProposta'])
      const numApolice    = getTag(bloco, ['numApolice', 'numApoIice', 'numeroApolice'])
      const numEndosso    = getTag(bloco, ['numEndosso', 'numeroEndosso'])
      const ramo          = getTag(bloco, ['ramo'])
      const produto       = getTag(bloco, ['Produto', 'produto'])
      const tipoSeguro    = getTag(bloco, ['TipoSeguro', 'tipoSeguro'])
      const cpfCnpj       = digits(getTag(bloco, ['CPFCnpj', 'cpfCnpj', 'cpf', 'cnpj']))
      const nome          = getTag(bloco, ['nome', 'nomeSegurado'])
      const tpPessoa      = getTag(bloco, ['tpPessoa'])
      const email         = getTag(bloco, ['e-mail', 'dsEmail', 'email'])
      const blocoTel      = (getBlocks(bloco, ['Telefone', 'telefone'])[0]) || ''
      const telefone      = getTag(blocoTel, ['numero']) || getTag(bloco, ['nrTelefone'])
      const dtRecusa      = toDate(getTag(bloco, ['dtRecusa', 'dataRecusa']))
      const dtSolicitacao = toDate(getTag(bloco, ['dtSolicitacao', 'dataSolicitacao']))
      const motivo        = getTag(bloco, ['motivoDeRecusa', 'motivoRecusa', 'motivo'])
      const codigoMotivo  = getTag(bloco, ['cdMotivo', 'codigoMotivo'])
      const dsMotivo      = getTag(bloco, ['descricaoMotivo', 'dsMotivo'])
      const areaRecusante = getTag(bloco, ['areaRecusante', 'area'])
      const statusRecusa  = getTag(bloco, ['statusRecusa', 'situacao'])
      const obs           = getTag(bloco, ['observacao', 'obs'])
      const blocoCor      = (getBlocks(bloco, ['Corretor'])[0]) || bloco
      const cdCorretor    = getTag(blocoCor, ['cdCorretor'])
      const nmCorretor    = getTag(blocoCor, ['nmCorretor', 'NmCorretor'])

      if (!numProposta && !numApolice) { msgs.push('recusa sem identificador'); erros++; continue }

      const clienteId = await obterOuCriarCliente({ cpfCnpj, nome, dadosBrutos: { numProposta, numApolice, motivo } })

      const payload: any = {
        numero_proposta:  numProposta || null,
        numero_apolice:   numApolice || null,
        numero_endosso:   numEndosso || null,
        ramo:             ramo || null,
        produto:          produto || null,
        tipo_seguro:      tipoSeguro || null,
        cpf_cnpj:         cpfCnpj || null,
        nome_segurado:    nome || null,
        tp_pessoa:        tpPessoa || null,
        email:            email || null,
        telefone:         telefone || null,
        data_recusa:      dtRecusa,
        data_solicitacao: dtSolicitacao,
        motivo_recusa:    motivo || null,
        codigo_motivo:    codigoMotivo || null,
        descricao_motivo: dsMotivo || null,
        area_recusante:   areaRecusante || null,
        status_recusa:    statusRecusa || null,
        observacao:       obs || null,
        cd_corretor:      cdCorretor || null,
        nm_corretor:      nmCorretor || null,
        cliente_id:       clienteId || null,
        importacao_id:    importacaoId || null,
        dados_brutos:     { bloco_xml: bloco.slice(0, 4000) },
      }
      const { error } = await supabaseAdmin().from('tokio_recusas').insert(payload)
      if (error) { erros++; msgs.push(`${numProposta||numApolice}: ${error.message?.slice(0,80)}`); continue }

      if (clienteId) {
        await supabaseAdmin().from('historico').insert({
          cliente_id: clienteId, tipo: 'red',
          titulo: `🚫 Recusa Tokio: ${numProposta || numApolice}`,
          descricao: `${motivo || 'Recusa registrada'}${obs ? ' | ' + obs.slice(0,140) : ''}`,
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
  if (n.includes('extrato') || n.includes('comiss')) return 'COMISSOES'
  if (n.includes('parcel'))  return 'PARCELAS'
  if (n.includes('sinistro')) return 'SINISTRO'
  if (n.includes('renovac'))  return 'RENOVACAO'
  if (n.includes('pendenc'))  return 'PENDENCIA'
  if (n.includes('recusa'))   return 'RECUSA'
  if (n.includes('endosso')) return 'APOLICES'   // mesmo arquivo da apólice
  if (n.includes('apolice') || n.includes('proposta')) return 'APOLICES'

  const has = (re: RegExp) => re.test(xml)
  if (has(/<(?:[A-Za-z0-9_]+:)?Extrato\b/i) || has(/<(?:[A-Za-z0-9_]+:)?DetalheComissao\b/i)) return 'COMISSOES'
  if (has(/<(?:[A-Za-z0-9_]+:)?DadosSinistro\b/i) || has(/<(?:[A-Za-z0-9_]+:)?numSinistro\b/i)) return 'SINISTRO'
  if (has(/<(?:[A-Za-z0-9_]+:)?DadosRenovacao\b/i) || has(/<(?:[A-Za-z0-9_]+:)?Renovacao\b/i)) return 'RENOVACAO'
  if (has(/<(?:[A-Za-z0-9_]+:)?DadosPendencia\b/i) || has(/<(?:[A-Za-z0-9_]+:)?Pendencia\b/i)) return 'PENDENCIA'
  if (has(/<(?:[A-Za-z0-9_]+:)?DadosRecusa\b/i) || has(/<(?:[A-Za-z0-9_]+:)?motivoDeRecusa\b/i)) return 'RECUSA'
  if (has(/<(?:[A-Za-z0-9_]+:)?período\b/i) || has(/<(?:[A-Za-z0-9_]+:)?periodo\b/i) || has(/<(?:[A-Za-z0-9_]+:)?dtVencimento\b/i)) return 'PARCELAS'
  if (has(/<(?:[A-Za-z0-9_]+:)?DadosSeguro\b/i)) return 'APOLICES'
  return 'OUTRO'
}

// ─── MAPA DE SERVIÇOS DO WEBSERVICE ──────────────────────────
const SERVICO_MAP: Record<string, { endpoint: string; tipo: string }> = {
  APOLICES:  { endpoint: 'getApolice',       tipo: 'APOLICES'  },
  PARCELAS:  { endpoint: 'getParcela',       tipo: 'PARCELAS'  },
  COMISSOES: { endpoint: 'getExtratoComiss', tipo: 'COMISSOES' },
  SINISTRO:  { endpoint: 'getSinistro',      tipo: 'SINISTRO'  },
  RENOVACAO: { endpoint: 'getRenovacao',     tipo: 'RENOVACAO' },
  PENDENCIA: { endpoint: 'getPendencia',     tipo: 'PENDENCIA' },
  RECUSA:    { endpoint: 'getRecusa',        tipo: 'RECUSA'    },
}

async function processarArquivo(nomeArquivo: string, xml: string, tipo: string) {
  const { data: importacao } = await supabaseAdmin().from('importacoes_tokio').insert({
    tipo_arquivo: tipo, nome_arquivo: nomeArquivo,
    data_geracao: new Date().toISOString().split('T')[0],
    qtd_registros: (xml.match(/</g) || []).length,
    status: 'processando',
  }).select().single()
  const importacaoId = (importacao as any)?.id || null

  let resultado: { importados: number; erros: number; msgs: string[] }
  if      (tipo === 'APOLICES'  || tipo === 'ENDOSSOS') resultado = await processarApolices(xml, importacaoId)
  else if (tipo === 'PARCELAS')   resultado = await processarParcelas(xml, importacaoId)
  else if (tipo === 'COMISSOES')  resultado = await processarComissoes(xml, importacaoId)
  else if (tipo === 'SINISTRO')   resultado = await processarSinistros(xml, importacaoId)
  else if (tipo === 'RENOVACAO')  resultado = await processarRenovacoes(xml, importacaoId)
  else if (tipo === 'PENDENCIA')  resultado = await processarPendencias(xml, importacaoId)
  else if (tipo === 'RECUSA')     resultado = await processarRecusas(xml, importacaoId)
  else resultado = { importados: 0, erros: 0, msgs: ['Tipo não reconhecido — informe manualmente.'] }

  if (importacaoId) {
    await supabaseAdmin().from('importacoes_tokio').update({
      status: resultado.erros === 0 ? 'concluido' : 'parcial',
      qtd_importados: resultado.importados,
      qtd_erros: resultado.erros,
      erros: resultado.msgs.slice(0, 10),
      concluido_em: new Date().toISOString(),
    }).eq('id', importacaoId)
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
        ws_base:        TOKIO_BASE,
        ws_login_path:  TOKIO_LOGIN_PATH,
        ws_login_path_resolvido: resolvedLoginPath || '(nenhum login bem sucedido nesta instância ainda)',
        ws_user:        TOKIO_USER ? `sim (${TOKIO_USER.slice(0,8)}…)` : 'NÃO CONFIGURADO',
        ws_password:    TOKIO_PASSWORD ? 'sim' : 'NÃO CONFIGURADA',
        ws_service_key: TOKIO_SERVICE_KEY ? `sim (${TOKIO_SERVICE_KEY.length} chars)` : 'NÃO CONFIGURADA',
        endossos_cancelamento: 'desconsidera valores quando qtdeParcelas=0 e tpComplemento for de cancelamento',
      })
    }

    // Diagnóstico: tenta vários paths possíveis para o login até achar
    // um que aceite as credenciais. Sobrescreva TOKIO_LOGIN_PATH no Vercel
    // com o que funcionar.
    if (action === 'descobrir_login') {
      if (!TOKIO_USER || !TOKIO_PASSWORD || !TOKIO_SERVICE_KEY) {
        return NextResponse.json({ error: 'Credenciais incompletas' }, { status: 400 })
      }
      // /Corretor/Login retornou 404 da aplicação real (Spring Boot) ↑
      // → o WAF aceita /Corretor/*, mas o endpoint específico tem outro nome.
      // Variações comuns no Tokio + Spring Boot REST.
      const candidatos = [
        '/Corretor/login', '/Corretor/autenticar', '/Corretor/auth',
        '/Corretor/token', '/Corretor/getToken', '/Corretor/gerarToken',
        '/Corretor/Authenticate', '/Corretor/Autenticacao',
        '/Corretor/Acessar', '/Corretor/acessar',
        '/Corretor/Sessao', '/Corretor/sessao',
        '/Corretor', '/Corretor/Corretor',
        '/Corretor/getApolice',  // se ele responde 401 dá pra deduzir o endpoint de auth
      ]
      const bodies = [
        { user: TOKIO_USER, password: TOKIO_PASSWORD, serviceKey: TOKIO_SERVICE_KEY },
        { usuario: TOKIO_USER, senha: TOKIO_PASSWORD, serviceKey: TOKIO_SERVICE_KEY },
        { login: TOKIO_USER, senha: TOKIO_PASSWORD, chave: TOKIO_SERVICE_KEY },
        { username: TOKIO_USER, password: TOKIO_PASSWORD, apiKey: TOKIO_SERVICE_KEY },
        // Variação onde só user+password vão no body, serviceKey vai como header
        { user: TOKIO_USER, password: TOKIO_PASSWORD },
      ]
      const tentativas: any[] = []
      for (const path of candidatos) {
        for (const body of bodies) {
          try {
            // Faz handshake Imperva 1x antes da bateria
            if (!cookieJar) {
              try {
                const warm = await fetch(TOKIO_BASE, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(10000) })
                mergeCookies(warm.headers.get('set-cookie'))
              } catch {}
            }
            const r = await fetch(`${TOKIO_BASE}${path}`, {
              method: 'POST',
              headers: {
                ...BROWSER_HEADERS,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                // serviceKey muitas vezes vai como header em vez do body
                'serviceKey':   TOKIO_SERVICE_KEY,
                'service-key':  TOKIO_SERVICE_KEY,
                'X-Service-Key': TOKIO_SERVICE_KEY,
                'Authorization': `Bearer ${TOKIO_SERVICE_KEY}`,
                ...(cookieJar ? { 'Cookie': cookieJar } : {}),
              },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(15000),
            })
            mergeCookies(r.headers.get('set-cookie'))
            const txt = (await r.text()).slice(0, 200)
            tentativas.push({ path, body_keys: Object.keys(body).join(','), status: r.status, resposta: txt })
            if (r.ok) {
              return NextResponse.json({
                ok: true,
                encontrado: { path, body_keys: Object.keys(body), status: r.status },
                proxima_acao: `Defina TOKIO_LOGIN_PATH=${path} no Vercel`,
                resposta: txt,
                todas_tentativas: tentativas,
              })
            }
          } catch (err: any) {
            tentativas.push({ path, body_keys: Object.keys(body).join(','), erro: err.message?.slice(0,100) })
          }
        }
      }
      return NextResponse.json({
        ok: false,
        msg: 'Nenhum path/body funcionou',
        resumo_status: tentativas.reduce((acc:any, t:any) => {
          const k = t.erro ? `erro:${(t.erro+'').slice(0,30)}` : `HTTP ${t.status}`
          acc[k] = (acc[k]||0) + 1
          return acc
        }, {}),
        primeira_resposta: tentativas[0],
        tentativas,
      })
    }

    if (action === 'testar_login') {
      try {
        const token = await tokioLogin(true)
        return NextResponse.json({ ok: true, token_preview: token.slice(0,20) + '…', expira_em: '~25min', login_path: resolvedLoginPath })
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
      }
    }

    // Busca dados via webservice. params: { servico: 'APOLICES'|'PARCELAS'|..., ...filtros }
    if (action === 'sincronizar') {
      const cfg = SERVICO_MAP[String(params.servico||'').toUpperCase()]
      if (!cfg) return NextResponse.json({ error: 'parametro `servico` invalido. Use APOLICES|PARCELAS|COMISSOES|SINISTRO|RENOVACAO|PENDENCIA|RECUSA' }, { status: 400 })

      // O servidor da Tokio responde 500 (NullPointerException no
      // controller Java) quando recebe body vazio. Defaultamos para
      // últimos 30 dias e mandamos várias grafias do mesmo filtro
      // por compatibilidade — qualquer uma que o serviço aceite vai
      // ser preenchida.
      const hojeIso = new Date().toISOString().slice(0, 10)
      const trintaDiasAtrasIso = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const dIni = String(params.dataInicio || trintaDiasAtrasIso)
      const dFim = String(params.dataFim    || hojeIso)
      const filtros: Record<string,string> = {
        dataInicio:       dIni,
        dataFim:          dFim,
        dtInicio:         dIni,
        dtFim:            dFim,
        dtInicioPeriodo:  dIni,
        dtFimPeriodo:     dFim,
      }
      if (params.numApolice) {
        filtros.numApolice = String(params.numApolice)
        filtros.numeroApolice = String(params.numApolice)
      }

      try {
        const xml = await tokioGet(cfg.endpoint, filtros)
        const nome = `tokio-${cfg.endpoint}-${Date.now()}.xml`
        const resultado = await processarArquivo(nome, xml, cfg.tipo)
        return NextResponse.json({ ok: true, arquivo: nome, servico: cfg.endpoint, tipo: cfg.tipo, filtros, ...resultado })
      } catch (err: any) {
        return NextResponse.json({ error: err.message, filtros }, { status: 500 })
      }
    }

    if (action === 'processar_upload') {
      const { conteudo, storage_path, nome_arquivo, tipo_forcado } = params
      let xml: string | null = null

      if (typeof conteudo === 'string' && conteudo.length > 0) {
        xml = conteudo
      } else if (typeof storage_path === 'string' && storage_path.length > 0) {
        const { data, error } = await supabaseAdmin().storage.from('cmsegcrm').download(storage_path)
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
