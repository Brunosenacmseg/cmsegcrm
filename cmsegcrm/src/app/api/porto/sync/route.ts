import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gunzipSync, inflateRawSync } from 'zlib'

// Vercel: estender o tempo limite. Plano Hobby max 60s, Pro/Enterprise até 300s.
// O Porto SOAP é lento e cada arquivo leva 5-30s; sem isso a função expira em 10s.
export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'
export const maxDuration = 300

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PORTO_URL   = 'https://wwws.portoseguro.com.br/CentralDownloadsIntegrationService/Proxy_Services/ArquivoRetornoIntegrationService'
const PORTO_SUSEP = process.env.PORTO_SUSEP || 'J8FXUJ'
const PORTO_LOGIN = process.env.PORTO_LOGIN || ''
const PORTO_SENHA = process.env.PORTO_SENHA || ''

const FUNIL_COBRANCA_ETAPA = 'Em Atraso'
const FUNIL_SINISTRO_ETAPA = 'Novo Sinistro'

// Busca funil por NOME exato (lookup principal — replicamos os funis
// do RD Station, então temos "FUNIL COBRANÇA" e "SINISTRO"). Se não
// achar pelo nome, cai no `tipo` antigo como fallback.
async function buscarFunilPorNome(nomes: string[], tipoFallback?: 'cobranca' | 'posVenda') {
  for (const nome of nomes) {
    const { data } = await supabaseAdmin.from('funis').select('id, etapas, nome').ilike('nome', nome).limit(1).maybeSingle()
    if (data?.id) return data
  }
  if (tipoFallback) {
    const { data } = await supabaseAdmin.from('funis').select('id, etapas, nome').eq('tipo', tipoFallback).limit(1).maybeSingle()
    return data
  }
  return null
}

async function buscarEquipeId(nome: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('equipes').select('id').ilike('nome', nome).limit(1).maybeSingle()
  return data?.id || null
}

// Funis são buscados dinamicamente pelo `tipo` para evitar UUIDs hardcoded
async function buscarFunilId(tipo: 'cobranca' | 'posVenda'): Promise<string | null> {
  const { data } = await supabaseAdmin.from('funis').select('id').eq('tipo', tipo).limit(1).maybeSingle()
  return data?.id || null
}

function subDias(dateStr: string, dias: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - dias)
  return d.toISOString().split('T')[0]
}

function toDateTime(dateStr: string, end = false): string {
  return `${dateStr}T${end ? '23:59:59' : '00:00:00'}`
}

function extrairZip(bytes: Buffer): string {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Não é ZIP')
  let offset = 4
  offset += 2; offset += 2
  const compressionMethod = bytes.readUInt16LE(offset); offset += 2
  offset += 4; offset += 4
  const compressedSize = bytes.readUInt32LE(offset); offset += 4
  offset += 4
  const fileNameLen = bytes.readUInt16LE(offset); offset += 2
  const extraLen    = bytes.readUInt16LE(offset); offset += 2
  offset += fileNameLen + extraLen
  const compressed = bytes.slice(offset, offset + compressedSize)
  const data = compressionMethod === 0 ? compressed : inflateRawSync(compressed)
  return decodificarBytes(data)
}

// Porto Seguro envia arquivos em ISO-8859-1 (Latin-1).
// Decodificar como UTF-8 corrompe acentos: cedilhas e til viram caracteres estranhos.
function decodificarBytes(bytes: Buffer): string {
  const utf8 = bytes.toString('utf8')
  const latin1 = bytes.toString('latin1')
  // Mojibake tipico: pares 0xC3 0xA9 / 0xC3 0xA3 / 0xC3 0xA7 indicam UTF-8 lendo Latin-1.
  const utf8Mojibake = (utf8.match(/\u00C3[\u00A9\u00A3\u00A7\u00A1\u00BA\u00AA\u00A8]/g) || []).length
  const utf8Replacement = (utf8.match(/\uFFFD/g) || []).length
  if (utf8Replacement > 0 || utf8Mojibake > 3) return latin1
  return utf8
}

function decodificarConteudo(conteudoB64: string): string {
  if (!conteudoB64) return ''
  const bytes = Buffer.from(conteudoB64, 'base64')
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return extrairZip(bytes)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try { return decodificarBytes(gunzipSync(bytes)) } catch {}
  }
  return decodificarBytes(bytes)
}

interface RegistroCobranca {
  ramo: string
  numero_apolice: string
  cpf_cliente: string
  parcela: string
  total_parcelas: string
  status: string
  vencimento: string
  valor: number
  data_pagamento: string
  pago: boolean
  dias_atraso: number
}

function parsearSAP(texto: string): RegistroCobranca[] {
  const registros: RegistroCobranca[] = []
  for (const linha of texto.split(/\r?\n/)) {
    const t = linha.trim()
    if (!t || t.startsWith('9')) continue
    const campos = t.split(/\s{2,}/).filter(c => c.trim().length > 0)
    if (campos.length < 3) continue

    const c0 = campos[0].trim()
    if (c0.length < 10) continue
    const ramo    = c0.slice(0, 3)
    const apolice = c0.slice(3, 13).replace(/^0+/, '') || c0.slice(3, 13)
    const cpf     = campos[1].trim()
    const c2      = campos[2].trim()
    if (c2.length < 31) continue

    const parcela       = c2.slice(0, 3)
    const totalParcelas = c2.slice(3, 6)
    const status        = c2.slice(6, 7)
    const vencimento    = c2.slice(7, 17)
    const valor         = parseInt(c2.slice(17, 32).replace(/\D/g,'') || '0') / 100
    const dataPag       = c2.length >= 42 ? c2.slice(32, 42) : ''
    const pago          = dataPag.length >= 8 || status === 'P'

    let diasAtraso = 0
    if (!pago && vencimento.includes('/')) {
      const [d, m, y] = vencimento.split('/')
      if (d && m && y) {
        const dataVenc = new Date(`${y}-${m}-${d}`)
        if (dataVenc < new Date())
          diasAtraso = Math.floor((Date.now() - dataVenc.getTime()) / 86400000)
      }
    }

    registros.push({ ramo, numero_apolice: apolice, cpf_cliente: cpf, parcela, total_parcelas: totalParcelas, status, vencimento, valor, data_pagamento: dataPag, pago, dias_atraso: diasAtraso })
  }
  return registros
}

async function soapRequest(body: string): Promise<string> {
  if (!PORTO_LOGIN || !PORTO_SENHA) {
    throw new Error('Credenciais Porto não configuradas (PORTO_LOGIN/PORTO_SENHA).')
  }
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.centraldownloadsics.pecorporativo.corporativo.porto.com/">
  <soapenv:Header>
    <ws:susep>${PORTO_SUSEP}</ws:susep>
    <ws:senha>${PORTO_SENHA}</ws:senha>
    <ws:login>${PORTO_LOGIN}</ws:login>
  </soapenv:Header>
  <soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`
  // Timeout reduzido para 25s para sobrar margem antes do limite da função.
  const res = await fetch(PORTO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' },
    body: envelope,
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) throw new Error(`Porto SOAP HTTP ${res.status}`)
  return await res.text()
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'i'))
  return m ? m[1].trim() : ''
}

function extractBlocks(xml: string, tag: string): string[] {
  const r = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>[\\s\\S]*?<\\/(?:[^:>]+:)?${tag}>`, 'gi')
  const res: string[] = []; let m
  while ((m = r.exec(xml)) !== null) res.push(m[0])
  return res
}

async function listarArquivos(ini: string, fim: string) {
  const xml = await soapRequest(`<ws:listarArquivos><inicioPeriodo>${toDateTime(ini)}</inicioPeriodo><finalPeriodo>${toDateTime(fim,true)}</finalPeriodo></ws:listarArquivos>`)
  const fault = extractTag(xml, 'faultstring')
  if (fault) return { arquivos: [], erro: fault }
  return { arquivos: extractBlocks(xml, 'arquivo').map(a => ({
    codigo: extractTag(a,'codigo'), dataGeracao: extractTag(a,'dataGeracao'),
    dataDownload: extractTag(a,'dataDownload'), nomeArquivo: extractTag(a,'nomeArquivo'),
    produto: extractTag(a,'descricao')||extractTag(a,'produto'),
    susep: extractTag(a,'susep'), tipoArquivo: extractTag(a,'tipoArquivo'),
  })) }
}

async function recuperarTexto(idArquivo: string): Promise<{ texto: string, nome: string }> {
  const xml = await soapRequest(`<ws:recuperarConteudoArquivo><idArquivo>${idArquivo}</idArquivo></ws:recuperarConteudoArquivo>`)
  const texto = decodificarConteudo(extractTag(xml, 'conteudo'))
  const nome  = extractTag(xml, 'nome')
  console.log(`[Porto] ${nome} | ${texto.length} chars | ${texto.slice(0,80).replace(/\n/g,'|')}`)
  return { texto, nome }
}

async function buscarApolice(num: string) {
  const limpo = num.replace(/^0+/, '')
  const { data } = await supabaseAdmin.from('apolices').select('id,cliente_id,vendedor_id,numero,produto')
    .or(`numero.eq.${num},numero.eq.${limpo},numero.ilike.%${limpo}%`).maybeSingle()
  return data
}

// ─── PARSER UNIVERSAL DE LINHA PORTO ─────────────────────────
// Os arquivos de retorno da Porto são fixed-width com layouts
// diferentes por tipo (.APP, .SAP, .SI2, .COM, .RET). Em vez de
// tentar adivinhar o layout exato (que muda por produto/ramo),
// extraímos via regex todos os campos identificáveis: CPF, CNPJ,
// nome, placa, datas, valores, número da apólice, ramo. Sempre que
// um padrão é encontrado, removemos do texto para não capturar de
// novo no próximo regex.
interface CamposPorto {
  ramo?:        string
  apolice?:     string
  cpf?:         string
  cnpj?:        string
  cpf_cnpj?:    string
  nome?:        string
  placa?:       string
  modelo?:      string
  ano_modelo?:  string
  vigencia_ini?: string  // YYYY-MM-DD
  vigencia_fim?: string
  premio?:      number
  iof?:         number
  comissao_pct?: number
  endosso?:     string
}

function normalizarData(s: string): string | null {
  if (!s) return null
  // dd/mm/yyyy ou dd-mm-yyyy
  let m = s.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  // yyyymmdd
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // ddmmyyyy
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

function extrairCamposPorto(linha: string): CamposPorto {
  const out: CamposPorto = {}
  let buf = ' ' + linha + ' '

  // Placa (Mercosul ABC1D23 ou antiga ABC1234)
  const placaMatch = buf.match(/\b([A-Z]{3}[ -]?[0-9][A-Z0-9][0-9]{2})\b/i)
  if (placaMatch) {
    out.placa = placaMatch[1].replace(/[ -]/g, '').toUpperCase()
    buf = buf.replace(placaMatch[0], ' '.repeat(placaMatch[0].length))
  }

  // CNPJ (14 dígitos juntos ou com pontuação)
  const cnpjMatch = buf.match(/(?<!\d)(\d{2}[\.\-\/]?\d{3}[\.\-\/]?\d{3}[\.\-\/]?\d{4}[\.\-\/]?\d{2}|\d{14})(?!\d)/)
  if (cnpjMatch) {
    const d = cnpjMatch[1].replace(/\D/g,'')
    if (d.length === 14) { out.cnpj = d; out.cpf_cnpj = d; buf = buf.replace(cnpjMatch[0], ' '.repeat(cnpjMatch[0].length)) }
  }
  if (!out.cnpj) {
    // CPF (11 dígitos)
    const cpfMatch = buf.match(/(?<!\d)(\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?\d{2}|\d{11})(?!\d)/)
    if (cpfMatch) {
      const d = cpfMatch[1].replace(/\D/g,'')
      if (d.length === 11) { out.cpf = d; out.cpf_cnpj = d; buf = buf.replace(cpfMatch[0], ' '.repeat(cpfMatch[0].length)) }
    }
  }

  // Datas: pega a primeira (vigência início) e segunda (vigência fim)
  const datasMatch = Array.from(buf.matchAll(/(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{8})/g))
  if (datasMatch.length >= 1) out.vigencia_ini = normalizarData(datasMatch[0][1]) || undefined
  if (datasMatch.length >= 2) out.vigencia_fim = normalizarData(datasMatch[1][1]) || undefined
  for (const d of datasMatch) buf = buf.replace(d[0], ' '.repeat(d[0].length))

  // Valor monetário: padrão "1.234,56" ou "00000123456" (valor em centavos com 13 dígitos)
  // Pega o primeiro como prêmio. Outros vão pra IOF se acharmos.
  const valorMatch = buf.match(/\b(\d{1,3}(?:\.\d{3})*,\d{2})\b/)
  if (valorMatch) {
    out.premio = parseFloat(valorMatch[1].replace(/\./g,'').replace(',','.'))
    buf = buf.replace(valorMatch[0], ' '.repeat(valorMatch[0].length))
  } else {
    // Fixed-width: 11-15 dígitos representando centavos (valor*100 zero-padded)
    const valorFW = buf.match(/(?<!\d)(\d{11,15})(?!\d)/)
    if (valorFW && parseInt(valorFW[1]) > 0) {
      const cents = parseInt(valorFW[1])
      if (cents < 1e12) { // sanity check: não passa de 10 bilhões
        out.premio = cents / 100
        buf = buf.replace(valorFW[0], ' '.repeat(valorFW[0].length))
      }
    }
  }

  // Ramo (3 dígitos no início) + Apólice (10 dígitos depois) em fixed-width
  const ramoApol = linha.match(/^(\d{3})(\d{10})/)
  if (ramoApol) {
    out.ramo = ramoApol[1]
    out.apolice = ramoApol[2].replace(/^0+/, '') || ramoApol[2]
  }

  // Endosso (5-6 dígitos depois da apólice em alguns formatos)
  // Não confiável sem layout — pulamos por enquanto.

  // Modelo do veículo: muitas vezes é texto longo após placa.
  // Vamos pegar uma palavra de marca conhecida + possivelmente palavras seguintes.
  const modeloMatch = linha.match(/\b(VOLKSWAGEN|FIAT|CHEVROLET|GM|FORD|HONDA|TOYOTA|HYUNDAI|RENAULT|NISSAN|PEUGEOT|CITROEN|JEEP|BMW|MERCEDES|AUDI|VOLVO|MITSUBISHI|KIA|LAND ROVER|RANGE ROVER|HARLEY|YAMAHA|SUZUKI|KAWASAKI|DUCATI|TRIUMPH)\b[\s\w\-\/\.]{0,40}/i)
  if (modeloMatch) out.modelo = modeloMatch[0].trim().slice(0, 80)

  // Ano modelo (4 dígitos entre 1980-2100)
  const anoMatch = buf.match(/\b(19[89]\d|20\d{2}|21\d{2})\b/)
  if (anoMatch) out.ano_modelo = anoMatch[1]

  // Nome do segurado: depois de tirar CPF/CNPJ/placa/datas/valores,
  // pega a sequência mais longa de letras + espaços (nome em maiúsculas
  // é o padrão Porto). Mín 8 chars, máx 80.
  const restoLimpo = buf
    .replace(/\d/g, ' ')
    .replace(/[^\wÀ-ÿ\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
  const candidatos = restoLimpo.split(/\s{2,}/).map(s => s.trim()).filter(Boolean)
  // Pega o mais longo que parece nome (>= 2 palavras de 3+ letras)
  let melhorNome = ''
  for (const c of candidatos) {
    if (c.length < 8 || c.length > 80) continue
    const palavras = c.split(/\s+/).filter(p => /^[A-ZÀ-ÿ][A-Za-zÀ-ÿ]{2,}$/.test(p))
    if (palavras.length >= 2 && c.length > melhorNome.length) melhorNome = c
  }
  if (melhorNome) out.nome = melhorNome

  return out
}

// Procura ou cria cliente com base nos campos extraídos. Quando criamos
// novo, fonte = 'Porto Seguro' e tipo PJ se temos CNPJ.
async function obterOuCriarCliente(c: CamposPorto, dadosBrutos?: any): Promise<string | null> {
  const cpfCnpj = c.cpf_cnpj || c.cpf || c.cnpj
  if (!cpfCnpj && !c.nome) return null

  // 1) Match por CPF/CNPJ
  if (cpfCnpj) {
    const { data: existente } = await supabaseAdmin.from('clientes')
      .select('id, nome, fonte').or(`cpf_cnpj.eq.${cpfCnpj}`).maybeSingle()
    if (existente) {
      // Atualiza nome se estava vazio e agora temos
      if (c.nome && (!existente.nome || existente.nome === 'Sem nome')) {
        await supabaseAdmin.from('clientes').update({ nome: c.nome }).eq('id', existente.id)
      }
      return existente.id
    }
  }

  // 2) Match por nome + sem CPF (fallback fraco — só se não tem CPF nenhum)
  if (!cpfCnpj && c.nome) {
    const { data: existente } = await supabaseAdmin.from('clientes')
      .select('id').ilike('nome', c.nome).maybeSingle()
    if (existente) return existente.id
  }

  // 3) Cria cliente novo se temos pelo menos CPF/CNPJ ou nome
  const tipo = c.cnpj ? 'PJ' : 'PF'
  const payload: any = {
    nome:     c.nome || (cpfCnpj ? `Cliente ${cpfCnpj}` : 'Cliente Porto'),
    tipo,
    cpf_cnpj: cpfCnpj || null,
    fonte:    'Porto Seguro',
  }
  if (dadosBrutos) payload.dados_porto = dadosBrutos
  const { data: novo, error } = await supabaseAdmin.from('clientes').insert(payload).select('id').single()
  if (error) {
    console.warn('[Porto] erro criando cliente:', error.message, payload)
    return null
  }
  return novo?.id || null
}

// Criar negócio — cliente_id e equipe_id opcionais
async function criarNegocio(opts: {
  funilId: string; etapa: string; titulo: string; produto: string; premio: number; obs: string;
  clienteId?: string | null; cpfCnpj?: string; equipeId?: string | null;
}) {
  const { funilId, etapa, titulo, produto, premio, obs, clienteId, cpfCnpj, equipeId } = opts
  // Se tem cliente, verificar se já existe negócio aberto
  if (clienteId) {
    const { data: existing } = await supabaseAdmin.from('negocios').select('id')
      .eq('cliente_id', clienteId).eq('funil_id', funilId)
      .not('etapa', 'in', '("Pago","Cancelado","Concluído","Negado","Fechado Ganho","Fechado Perdido")')
      .maybeSingle()
    if (existing?.id) {
      await supabaseAdmin.from('negocios').update({ etapa, obs, equipe_id: equipeId || null }).eq('id', existing.id)
      return existing.id
    }
  } else if (cpfCnpj) {
    const { data: existing } = await supabaseAdmin.from('negocios').select('id')
      .eq('cpf_cnpj', cpfCnpj).eq('funil_id', funilId)
      .not('etapa', 'in', '("Pago","Cancelado","Concluído","Negado","Fechado Ganho","Fechado Perdido")')
      .maybeSingle()
    if (existing?.id) {
      await supabaseAdmin.from('negocios').update({ etapa, obs, equipe_id: equipeId || null }).eq('id', existing.id)
      return existing.id
    }
  }

  const { data } = await supabaseAdmin.from('negocios').insert({
    titulo, funil_id: funilId, etapa, produto, premio, obs,
    cliente_id: clienteId || null,
    cpf_cnpj:   cpfCnpj   || null,
    equipe_id:  equipeId  || null,
    fonte:      'Porto Seguro',
    seguradora: 'Porto Seguro',
  }).select('id').single()
  return data?.id || null
}

async function processarSAP(arquivo: any, texto: string) {
  const registros = parsearSAP(texto)
  console.log(`[Porto] SAP: ${registros.length} registros`)
  let importados = 0, erros = 0
  const msgs: string[] = []
  const apolicesVistas = new Set<string>()
  const funilCobranca = await buscarFunilPorNome(['FUNIL COBRANÇA','FUNIL COBRANCA','COBRANÇA','Cobrança'], 'cobranca')
  if (!funilCobranca) return { importados: 0, erros: registros.length, msgs: ['Funil de Cobrança não encontrado.'] }
  const FUNIL_COBRANCA_ID = funilCobranca.id
  const etapaInicialCob = (funilCobranca.etapas || [])[0] || FUNIL_COBRANCA_ETAPA
  const equipeCobrancaId = await buscarEquipeId('Cobrança')

  for (const reg of registros) {
    try {
      if (reg.pago) { importados++; continue }

      // Re-extrai campos da linha pra pegar nome do segurado
      // (o parsearSAP simples não extrai isso). Procura pela linha
      // original que casa com esse número de apólice.
      const linhaOriginal = texto.split(/\r?\n/).find(l => l.includes(reg.numero_apolice)) || ''
      const camposExtra = linhaOriginal ? extrairCamposPorto(linhaOriginal) : ({} as CamposPorto)

      // Buscar cliente pelo CPF; se não existe E temos nome, cria
      const cpfRaw = (reg.cpf_cliente||'').replace(/\D/g,'') || camposExtra.cpf_cnpj || ''
      let clienteId: string | null = null
      if (cpfRaw.length >= 8) {
        const { data: cli } = await supabaseAdmin.from('clientes').select('id')
          .or(`cpf_cnpj.eq.${cpfRaw},cpf_cnpj.ilike.%${cpfRaw}%`).maybeSingle()
        clienteId = cli?.id || null
      }
      if (!clienteId && (camposExtra.nome || cpfRaw)) {
        clienteId = await obterOuCriarCliente({
          ...camposExtra,
          cpf_cnpj: cpfRaw || camposExtra.cpf_cnpj,
        }, { linha: linhaOriginal, registro: reg, arquivo: arquivo.nomeArquivo })
      }

      // Buscar apólice
      let apolice = await buscarApolice(reg.numero_apolice)

      // Criar apólice se não existe
      if (!apolice) {
        const { data: nova } = await supabaseAdmin.from('apolices').upsert({
          numero: reg.numero_apolice, seguradora: 'Porto Seguro', fonte: 'Porto Seguro',
          produto: arquivo.produto || '', cliente_id: clienteId, status: 'ativo',
          nome_segurado: camposExtra.nome || null,
          cpf_cnpj_segurado: cpfRaw || null,
        }, { onConflict: 'numero', ignoreDuplicates: false })
          .select('id,cliente_id,vendedor_id,numero,produto').single()
        apolice = nova
      } else if (!apolice.cliente_id && clienteId) {
        await supabaseAdmin.from('apolices').update({ cliente_id: clienteId }).eq('id', apolice.id)
        apolice = { ...apolice, cliente_id: clienteId }
      }

      const clienteFinal = apolice?.cliente_id || clienteId

      // Criar card no funil Cobrança (uma vez por apólice) — com ou sem cliente
      if (!apolicesVistas.has(reg.numero_apolice)) {
        apolicesVistas.add(reg.numero_apolice)

        const negId = await criarNegocio({
          funilId:   FUNIL_COBRANCA_ID,
          etapa:     etapaInicialCob,
          titulo:    `Cobrança - Apólice ${reg.numero_apolice}`,
          produto:   arquivo.produto || 'Cobrança',
          premio:    reg.valor,
          obs:       `Apólice ${reg.numero_apolice} | Parcela ${reg.parcela}/${reg.total_parcelas} | Venc: ${reg.vencimento} | R$ ${reg.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})} | ${reg.dias_atraso} dias em atraso`,
          clienteId: clienteFinal,
          cpfCnpj:   cpfRaw || undefined,
          equipeId:  equipeCobrancaId,
        })

        // Notificar gestores
        const { data: gestores } = await supabaseAdmin.from('users').select('id').in('role', ['admin','lider'])
        for (const g of gestores||[]) {
          await supabaseAdmin.from('notificacoes').insert({
            user_id: g.id, tipo: 'vencimento',
            titulo: `⚠️ Inadimplência: Apólice ${reg.numero_apolice}`,
            descricao: `Parcela ${reg.parcela}/${reg.total_parcelas} | Venc: ${reg.vencimento} | R$ ${reg.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})} | ${reg.dias_atraso}d`,
            link: '/dashboard/funis',
          })
        }

        // Tarefa para o responsável
        if (apolice?.vendedor_id && clienteFinal) {
          await supabaseAdmin.from('tarefas').insert({
            titulo: `📞 Parcela vencida: Apólice ${reg.numero_apolice}`,
            descricao: `Parcela ${reg.parcela}/${reg.total_parcelas} | R$ ${reg.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})} | Venc: ${reg.vencimento} | ${reg.dias_atraso} dias`,
            tipo: 'ligacao', status: 'pendente',
            cliente_id: clienteFinal, negocio_id: negId,
            responsavel_id: apolice.vendedor_id, criado_por: apolice.vendedor_id,
          })
        }
      }
      importados++
    } catch (err: any) {
      erros++
      msgs.push(`${reg.numero_apolice}: ${err.message?.slice(0,80)}`)
    }
  }
  return { importados, erros, msgs }
}

async function processarAPP(arquivo: any, texto: string) {
  let importados = 0, erros = 0
  const msgs: string[] = []
  const produto = arquivo.produto || 'AUTOMOVEL'

  for (const linha of texto.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('9'))) {
    try {
      // Extrai TUDO o que conseguir da linha
      const campos = extrairCamposPorto(linha)

      const num = campos.apolice
      if (!num || num.length < 3) {
        // Linha que não conseguimos parsear apólice — guarda pra debug
        msgs.push(`SemNumApolice: ${linha.slice(0,80)}`)
        continue
      }

      // 1) Cria/atualiza cliente com nome+CPF se temos
      const dadosBrutos = { linha, campos, arquivo: arquivo.nomeArquivo }
      const clienteId = await obterOuCriarCliente(campos, dadosBrutos)

      // 2) Upsert apólice com TODOS os campos extraídos
      const apolicePayload: any = {
        numero:           num,
        seguradora:       'Porto Seguro',
        fonte:            'Porto Seguro',
        produto,
        status:           'ativo',
        cliente_id:       clienteId,
        nome_segurado:    campos.nome || null,
        cpf_cnpj_segurado: campos.cpf_cnpj || null,
        placa:            campos.placa || null,
        modelo:           campos.modelo || null,
        ano_modelo:       campos.ano_modelo || null,
        vigencia_ini:     campos.vigencia_ini || null,
        vigencia_fim:     campos.vigencia_fim || null,
        premio:           campos.premio || null,
        valor_iof:        campos.iof || null,
        comissao_pct:     campos.comissao_pct || null,
        dados_porto:      dadosBrutos,
      }
      const { data: apolice, error: errApol } = await supabaseAdmin.from('apolices').upsert(apolicePayload, {
        onConflict: 'numero', ignoreDuplicates: false,
      }).select('id, cliente_id, vendedor_id, premio, comissao_pct').single()
      if (errApol) {
        msgs.push(`Apólice ${num}: ${errApol.message?.slice(0,80)}`)
        erros++; continue
      }

      // 3) Espelha em negocios para aparecer no módulo /dashboard/apolices
      if (apolice) {
        const { data: existing } = await supabaseAdmin.from('negocios').select('id')
          .eq('produto', produto).eq('seguradora', 'Porto Seguro')
          .or(`titulo.ilike.%${num}%,obs.ilike.%${num}%`).maybeSingle()

        if (!existing) {
          await supabaseAdmin.from('negocios').insert({
            titulo:       campos.nome ? `Apólice ${num} — ${campos.nome}` : `Apólice ${num}`,
            cliente_id:   clienteId || apolice.cliente_id || null,
            vendedor_id:  apolice.vendedor_id || null,
            etapa:        'Ativo',
            produto,
            seguradora:   'Porto Seguro',
            fonte:        'Porto Seguro',
            placa:        campos.placa || null,
            cpf_cnpj:     campos.cpf_cnpj || null,
            premio:       apolice.premio || campos.premio || 1,
            comissao_pct: apolice.comissao_pct || 0,
            obs:          `Apólice Porto ${num}${campos.placa ? ' · '+campos.placa : ''}${campos.modelo ? ' · '+campos.modelo : ''} (importação Porto)`,
          })
        }
      }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

async function processarCOM(arquivo: any, texto: string) {
  let importados = 0, erros = 0
  const msgs: string[] = []
  for (const linha of texto.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('9'))) {
    try {
      const campos = linha.includes(';') ? linha.split(';').map(c=>c.trim()) : linha.trim().split(/\s{2,}/)
      await supabaseAdmin.from('importacoes_comissao').insert({
        nome_arquivo: arquivo.nomeArquivo,
        competencia:  arquivo.dataGeracao?.slice(0,7) || '',
        total_importado: parseFloat((campos[4]||campos[3]||'0').replace(/\./g,'').replace(',','.')) || 0,
        qtd_registros: 1, status: 'processado',
      })
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

async function processarSI2(arquivo: any, texto: string) {
  let importados = 0, erros = 0
  const msgs: string[] = []
  const funilSinistro = await buscarFunilPorNome(['SINISTRO','Sinistros'], 'posVenda')
  if (!funilSinistro) return { importados: 0, erros: 1, msgs: ['Funil de Sinistros não encontrado.'] }
  const FUNIL_SINISTRO_ID = funilSinistro.id
  const etapaInicialSin = (funilSinistro.etapas || [])[0] || FUNIL_SINISTRO_ETAPA
  const equipeSinistroId = await buscarEquipeId('Sinistro')

  for (const linha of texto.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('9'))) {
    try {
      const t  = linha.trim()
      const campos = extrairCamposPorto(t)
      const num = campos.apolice || (t.match(/(\d{3})(\d{10})/)?.[2]?.replace(/^0+/,'') || '')

      if (!num || num.length < 3) continue

      const { data: apolice } = await supabaseAdmin.from('apolices')
        .select('id,cliente_id,vendedor_id,negocio_id').or(`numero.eq.${num},numero.ilike.%${num}%`).maybeSingle()

      // Se não existe apólice + temos nome/CPF, cria cliente novo
      let clienteSinistro: string | null = apolice?.cliente_id || null
      if (!clienteSinistro && (campos.nome || campos.cpf_cnpj)) {
        clienteSinistro = await obterOuCriarCliente(campos, { linha: t, arquivo: arquivo.nomeArquivo })
      }

      // 1) Tenta achar negociação ja existente — primeiro pela apólice,
      //    depois pelo cliente (em qualquer funil que não esteja
      //    fechado).
      let negocioExistenteId: string | null = null
      if (apolice?.negocio_id) {
        const { data } = await supabaseAdmin.from('negocios').select('id').eq('id', apolice.negocio_id).maybeSingle()
        if (data?.id) negocioExistenteId = data.id
      }
      if (!negocioExistenteId && clienteSinistro) {
        const { data } = await supabaseAdmin.from('negocios').select('id')
          .eq('cliente_id', clienteSinistro)
          .not('status', 'eq', 'perdido')
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (data?.id) negocioExistenteId = data.id
      }

      let negId: string | null = null
      if (negocioExistenteId) {
        await supabaseAdmin.from('negocios').update({
          obs: `🚨 Sinistro recebido da Porto: Apólice ${num} | ${t.slice(0,200)}`,
        }).eq('id', negocioExistenteId)
        negId = negocioExistenteId
      } else {
        negId = await criarNegocio({
          funilId:   FUNIL_SINISTRO_ID,
          etapa:     etapaInicialSin,
          titulo:    campos.nome ? `Sinistro - ${campos.nome} (Apólice ${num})` : `Sinistro - Apólice ${num}`,
          produto:   'Sinistro',
          premio:    0,
          obs:       `Apólice ${num}${campos.placa?' · Placa '+campos.placa:''} | ${t.slice(0,200)}`,
          clienteId: clienteSinistro,
          cpfCnpj:   campos.cpf_cnpj || undefined,
          equipeId:  equipeSinistroId,
        })
      }

      if (clienteSinistro) {
        await supabaseAdmin.from('historico').insert({
          cliente_id: clienteSinistro, tipo: 'red',
          titulo: `🚨 Sinistro Porto Seguro`,
          descricao: `Apólice ${num} | ${t.slice(0,100)}`,
          negocio_id: negId,
        })
      }
      if (apolice?.vendedor_id) {
        await supabaseAdmin.from('notificacoes').insert({
          user_id: apolice.vendedor_id, tipo: 'sistema',
          titulo: `🚨 Sinistro: Apólice ${num}`,
          descricao: t.slice(0,100), link: '/dashboard/funis',
        })
      }
      importados++
    } catch (err: any) { erros++; msgs.push(err.message?.slice(0,80)) }
  }
  return { importados, erros, msgs }
}

function detectarTipo(produto: string, nomeArquivo: string): string {
  const p = (produto||'').toUpperCase()
  const n = (nomeArquivo||'').toUpperCase()
  if (n.endsWith('.COM')) return 'COMISSOES'
  if (n.endsWith('.SAP') || n.endsWith('.CBS') || n.endsWith('.RET')) return 'COBRANCA'
  if (n.endsWith('.SI2')) return 'SINISTRO'
  if (['.APP','.API','.XPP','.IRE','.XPI'].some(e => n.endsWith(e))) return 'APOLICES'
  if (p.includes('COMISS')) return 'COMISSOES'
  if (p.includes('COBRAN')) return 'COBRANCA'
  if (p.includes('SINIST')) return 'SINISTRO'
  if (['AUTOMOVEL','VIDA','RE','IMOBILIARIA','PREVIDENCIA'].some(x => p.includes(x))) return 'APOLICES'
  return 'OUTRO'
}

async function processarArquivo(arquivo: any, texto: string, tipo: string) {
  const { data: importacao } = await supabaseAdmin.from('importacoes_porto').insert({
    tipo_arquivo: tipo, nome_arquivo: arquivo.nomeArquivo,
    produto: arquivo.produto, data_geracao: arquivo.dataGeracao,
    qtd_registros: texto.split('\n').length, status: 'processando',
  }).select().single()

  let resultado: { importados: number, erros: number, msgs: string[] }
  if      (tipo === 'COBRANCA')  resultado = await processarSAP(arquivo, texto)
  else if (tipo === 'APOLICES')  resultado = await processarAPP(arquivo, texto)
  else if (tipo === 'COMISSOES') resultado = await processarCOM(arquivo, texto)
  else if (tipo === 'SINISTRO')  resultado = await processarSI2(arquivo, texto)
  else resultado = { importados: 0, erros: 0, msgs: ['Tipo não processado'] }

  if (importacao?.id) {
    await supabaseAdmin.from('importacoes_porto').update({
      status: resultado.erros === 0 ? 'concluido' : 'parcial',
      qtd_importados: resultado.importados, qtd_erros: resultado.erros,
      erros: resultado.msgs.slice(0,10), concluido_em: new Date().toISOString(),
    }).eq('id', importacao.id)
  }
  return resultado
}

export async function POST(request: NextRequest) {
  try {
    const { action, ...params } = await request.json()
    const hoje = new Date().toISOString().split('T')[0]

    // Diagnóstico: confere se as credenciais e ENV estão configuradas
    if (action === 'config') {
      return NextResponse.json({
        ok: true,
        susep: PORTO_SUSEP,
        login_configurado: PORTO_LOGIN ? `sim (${PORTO_LOGIN.length} chars)` : 'NÃO CONFIGURADO',
        senha_configurada: PORTO_SENHA ? 'sim' : 'NÃO CONFIGURADA',
        supabase_url:  process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configurado' : 'FALTA',
        supabase_role: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configurado' : 'FALTA',
        nota: PORTO_LOGIN && PORTO_SENHA ? 'Credenciais OK. Use action=listar para testar a conexão.' : 'Configure as variáveis PORTO_LOGIN, PORTO_SENHA e PORTO_SUSEP no painel do Vercel/Supabase.',
      })
    }

    if (action === 'debug') {
      const ini = subDias(hoje, 6)
      return NextResponse.json({ susep: PORTO_SUSEP, periodo: `${ini} a ${hoje}`, ...await listarArquivos(ini, hoje) })
    }

    // Processa UM arquivo por vez. Frontend chama em loop para evitar timeout.
    if (action === 'sincronizar_arquivo') {
      if (!params.codigo) return NextResponse.json({ error: 'Parâmetro `codigo` obrigatório' }, { status: 400 })
      const arquivo = {
        codigo:      params.codigo,
        nomeArquivo: params.nomeArquivo || '',
        produto:     params.produto     || '',
        dataGeracao: params.dataGeracao || '',
        tipoArquivo: params.tipoArquivo || '',
      }
      const tipo = detectarTipo(arquivo.produto, arquivo.nomeArquivo)
      if (tipo === 'OUTRO') return NextResponse.json({ ok: true, arquivo: arquivo.nomeArquivo, tipo: 'IGNORADO' })
      const { texto, nome } = await recuperarTexto(arquivo.codigo)
      if (!texto.trim()) return NextResponse.json({ ok: true, arquivo: arquivo.nomeArquivo, tipo, aviso: 'Vazio' })
      const resultado = await processarArquivo(arquivo, texto, tipo)
      return NextResponse.json({ ok: true, arquivo: nome || arquivo.nomeArquivo, tipo, ...resultado })
    }

    if (action === 'debug_conteudo') {
      const ini = subDias(hoje, 6)
      const { arquivos } = await listarArquivos(ini, hoje)
      if (!arquivos?.length) return NextResponse.json({ erro: 'Nenhum arquivo disponível' })
      const { texto, nome } = await recuperarTexto(arquivos[0].codigo)
      const linhas = texto.split('\n').filter(l => l.trim())
      return NextResponse.json({ arquivo: nome, total_linhas: linhas.length, primeiras_5: linhas.slice(0,5) })
    }

    if (action === 'listar') {
      const ini = params.inicio || subDias(hoje, 6)
      const fim = params.fim    || hoje
      return NextResponse.json(await listarArquivos(ini, fim))
    }

    if (action === 'sincronizar') {
      let res = await listarArquivos(subDias(hoje, 1), hoje)
      if (res.erro) return NextResponse.json({ error: res.erro })
      let arquivos: any[] = res.arquivos || []
      if (!arquivos.length) {
        const res6 = await listarArquivos(subDias(hoje, 6), hoje)
        arquivos = res6.arquivos || []
        if (!arquivos.length) return NextResponse.json({ ok: true, resultados: [], total: 0, aviso: 'Nenhum arquivo disponível' })
      }
      const resultados: any[] = []
      for (const arquivo of arquivos) {
        try {
          const tipo = detectarTipo(arquivo.produto, arquivo.nomeArquivo)
          if (tipo === 'OUTRO') { resultados.push({ arquivo: arquivo.nomeArquivo, tipo: 'IGNORADO' }); continue }
          const { texto, nome } = await recuperarTexto(arquivo.codigo)
          if (!texto.trim()) { resultados.push({ arquivo: arquivo.nomeArquivo, tipo, aviso: 'Vazio' }); continue }
          const resultado = await processarArquivo(arquivo, texto, tipo)
          resultados.push({ arquivo: nome||arquivo.nomeArquivo, tipo, ...resultado })
        } catch (err: any) {
          resultados.push({ arquivo: arquivo.nomeArquivo, erro: err.message })
        }
      }
      return NextResponse.json({ ok: true, resultados, total: arquivos.length })
    }

    if (action === 'sincronizar_tipo') {
      const ini = subDias(hoje, 6)
      const { arquivos } = await listarArquivos(ini, hoje)
      const filtrados = (arquivos||[]).filter((a:any) => a.produto?.toUpperCase().includes((params.tipo_produto||'').toUpperCase()))
      const resultados: any[] = []
      for (const arquivo of filtrados) {
        try {
          const tipo = detectarTipo(arquivo.produto, arquivo.nomeArquivo)
          const { texto, nome } = await recuperarTexto(arquivo.codigo)
          if (texto.trim()) {
            const resultado = await processarArquivo(arquivo, texto, tipo)
            resultados.push({ arquivo: nome||arquivo.nomeArquivo, tipo, ...resultado })
          }
        } catch (err: any) {
          resultados.push({ arquivo: arquivo.nomeArquivo, erro: err.message })
        }
      }
      return NextResponse.json({ ok: true, resultados })
    }

    if (action === 'processar_upload') {
      const { conteudo, storage_path, nome_arquivo, tipo_forcado, produto } = params
      let texto: string | null = null

      if (typeof conteudo === 'string' && conteudo.length > 0) {
        texto = conteudo
      } else if (typeof storage_path === 'string' && storage_path.length > 0) {
        // Baixa do Supabase Storage (bucket cmsegcrm)
        const { data, error } = await supabaseAdmin.storage.from('cmsegcrm').download(storage_path)
        if (error || !data) {
          return NextResponse.json({ error: `Falha ao baixar do storage: ${error?.message || 'desconhecido'}` }, { status: 500 })
        }
        const buf = Buffer.from(await data.arrayBuffer())
        texto = new TextDecoder('latin1').decode(buf)
      } else {
        return NextResponse.json({ error: 'envie conteudo (string) ou storage_path' }, { status: 400 })
      }

      const arquivo = {
        nomeArquivo: nome_arquivo || 'upload.RET',
        produto: produto || '',
        dataGeracao: new Date().toISOString().split('T')[0],
        tipoArquivo: 'UPLOAD',
        codigo: 'manual-' + Date.now(),
      }
      const tipo = (tipo_forcado as string) || detectarTipo(arquivo.produto, arquivo.nomeArquivo)
      try {
        const resultado = await processarArquivo(arquivo, texto, tipo)
        return NextResponse.json({ ok: true, arquivo: arquivo.nomeArquivo, tipo, ...resultado })
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Erro ao processar' }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (err: any) {
    console.error('[Porto] Erro:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
