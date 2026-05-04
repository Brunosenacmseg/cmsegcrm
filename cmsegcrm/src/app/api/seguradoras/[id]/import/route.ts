// Importa linhas (já parseadas no cliente) para o staging do módulo seguradoras.
// Body: { tipo: 'apolices'|'sinistros'|'inadimplencia'|'comissoes',
//         formato: 'xlsx'|'csv'|'xml'|'pdf'|'ret',
//         nome_arquivo?: string,
//         linhas?: Record<string, any>[],   // padrão para xlsx/csv/xml/ret
//         pdf_base64?: string }              // somente quando formato='pdf'
//
// PDF é parseado no servidor (apenas Ezze, tipo='apolices'). Layouts suportados:
// Auto Individual e RC Transporte de Passageiros (este último gera 1 linha por veículo).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseEzzeApolicePdf } from '@/lib/parsers/ezze-apolice-pdf'

export const maxDuration = 300
export const dynamic = 'force-dynamic'
// pdf-parse precisa do runtime Node (Buffer, fs)
export const runtime = 'nodejs'

let _sa: ReturnType<typeof createClient> | null = null
function admin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

type Tipo = 'apolices' | 'sinistros' | 'inadimplencia' | 'comissoes'
const TIPOS: Tipo[] = ['apolices', 'sinistros', 'inadimplencia', 'comissoes']
const TABELAS: Record<Tipo, string> = {
  apolices: 'seg_stage_apolices',
  sinistros: 'seg_stage_sinistros',
  inadimplencia: 'seg_stage_inadimplencia',
  comissoes: 'seg_stage_comissoes',
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

function pick(row: Record<string, any>, hints: string[]): any {
  const keys = Object.keys(row)
  const keysN = keys.map(norm)
  for (const h of hints) {
    const hn = norm(h)
    const i = keysN.findIndex(k => k === hn)
    if (i >= 0 && row[keys[i]] !== '' && row[keys[i]] != null) return row[keys[i]]
  }
  for (const h of hints) {
    const hn = norm(h)
    const i = keysN.findIndex(k => k.includes(hn))
    if (i >= 0 && row[keys[i]] !== '' && row[keys[i]] != null) return row[keys[i]]
  }
  return null
}

const sStr = (v: any): string | null => {
  if (v == null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}
const num = (v: any): number | null => {
  if (v == null || v === '') return null
  let str = String(v).trim().replace(/[R$\s%]/g, '')
  if (!str) return null
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.')
  else if ((str.match(/\./g) || []).length > 1) str = str.replace(/\./g, '')
  const n = Number(str)
  return isFinite(n) ? n : null
}
const nInt = (v: any): number | null => {
  const x = num(v); return x == null ? null : Math.round(x)
}
const date = (v: any): string | null => {
  if (v == null || v === '') return null
  if (typeof v === 'number' && isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400 * 1000)
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  const t = String(v).trim()
  const m1 = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
  const m2 = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
  const d = new Date(t)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
const cleanDoc = (v: any) => {
  const t = sStr(v); if (!t) return null
  return t.replace(/\D/g, '') || null
}

function mapApolice(row: any, seguradora_id: string, importacao_id: string) {
  return {
    seguradora_id, importacao_id,
    numero:        sStr(pick(row, ['apolice','numero apolice','nr apolice','numero da apolice','n apolice','numero_apolice'])),
    cpf_cnpj:      cleanDoc(pick(row, ['cpf','cnpj','documento','cpf/cnpj','cpf cnpj','cpf_cnpj'])),
    cliente_nome:  sStr(pick(row, ['segurado','cliente','nome','cliente_nome'])),
    produto:       sStr(pick(row, ['produto','ramo'])),
    premio:        num(pick(row, ['premio','prêmio','premio total','valor'])),
    comissao_pct:  num(pick(row, ['% comissao','percentual comissao','comissao %','aliquota'])),
    vigencia_ini:  date(pick(row, ['vigencia inicial','inicio vigencia','vigencia ini','inicio'])),
    vigencia_fim:  date(pick(row, ['vigencia final','fim vigencia','vigencia fim','fim','vencimento'])),
    placa:         sStr(pick(row, ['placa'])),
    status_apolice: sStr(pick(row, ['status','situacao'])),
    // Campos extras .APP/.API tipo 50
    codigo_interno:  sStr(pick(row, ['codigo_interno','codigo interno','cod interno'])),
    endosso:         sStr(pick(row, ['endosso','numero endosso'])),
    tipo_pessoa:     sStr(pick(row, ['tipo_pessoa','tipo pessoa'])),
    data_nascimento: date(pick(row, ['data_nascimento','data nascimento','nascimento','dt nascimento'])),
    sexo:            sStr(pick(row, ['sexo','genero'])),
    dados: row,
  }
}

// mapApoliceEzze: o parser de PDF da Ezze (src/lib/parsers/ezze-apolice-pdf.ts)
// já devolve as chaves no formato snake_case esperado pelas colunas de
// seg_stage_apolices (vide migration 070_seg_stage_apolices_ezze_pdf.sql),
// então é basicamente passthrough — só precisamos converter tipos numéricos
// e injetar seguradora_id/importacao_id, e ainda preencher `premio` (coluna
// legada da tabela) com o premio_total para manter compatibilidade.
function mapApoliceEzze(row: any, seguradora_id: string, importacao_id: string) {
  const premioTotal = num(row.premio_total)
  const premioLiquido = num(row.premio_liquido)
  return {
    seguradora_id, importacao_id,
    // Campos legados / "core"
    numero:         sStr(row.numero),
    cpf_cnpj:       cleanDoc(row.cpf_cnpj),
    cliente_nome:   sStr(row.cliente_nome),
    produto:        sStr(row.produto),
    premio:         premioTotal ?? premioLiquido,
    comissao_pct:   null, // Ezze não envia comissão na apólice
    vigencia_ini:   date(row.vigencia_ini),
    vigencia_fim:   date(row.vigencia_fim),
    placa:          sStr(row.placa),
    status_apolice: sStr(row.status_apolice),
    // Cabeçalho expandido
    endosso:                  sStr(row.endosso),
    proposta:                 sStr(row.proposta),
    versao:                   sStr(row.versao),
    rule_id:                  sStr(row.rule_id),
    codigo_ci:                sStr(row.codigo_ci),
    tipo_seguro:              sStr(row.tipo_seguro),
    classe_bonus:             nInt(row.classe_bonus),
    data_emissao:             date(row.data_emissao),
    tipo_apolice:             sStr(row.tipo_apolice),
    // Segurado expandido
    segurado_nome_social:     sStr(row.segurado_nome_social),
    segurado_email:           sStr(row.segurado_email),
    segurado_telefone:        sStr(row.segurado_telefone),
    segurado_cep:             sStr(row.segurado_cep),
    segurado_cidade:          sStr(row.segurado_cidade),
    segurado_uf:              sStr(row.segurado_uf),
    segurado_estado_civil:    sStr(row.segurado_estado_civil),
    segurado_endereco:        sStr(row.segurado_endereco),
    // Corretor
    corretor_nome:            sStr(row.corretor_nome),
    corretor_cnpj:            cleanDoc(row.corretor_cnpj),
    corretor_susep:           sStr(row.corretor_susep),
    corretor_email:           sStr(row.corretor_email),
    corretor_telefone:        sStr(row.corretor_telefone),
    filial_ezze:              sStr(row.filial_ezze),
    // Questionário
    utilizacao_veiculo:       sStr(row.utilizacao_veiculo),
    principal_condutor:       sStr(row.principal_condutor),
    condutor_nome:            sStr(row.condutor_nome),
    condutor_cpf:             cleanDoc(row.condutor_cpf),
    condutor_estado_civil:    sStr(row.condutor_estado_civil),
    condutor_cobertura_jovem: sStr(row.condutor_cobertura_jovem),
    // Veículo
    marca:                    sStr(row.marca),
    modelo:                   sStr(row.modelo),
    ano_modelo:               sStr(row.ano_modelo),
    cod_fipe:                 sStr(row.cod_fipe),
    chassi:                   sStr(row.chassi),
    zero_km:                  sStr(row.zero_km),
    blindagem:                sStr(row.blindagem),
    tipo_franquia_casco:      sStr(row.tipo_franquia_casco),
    vistoria_previa:          sStr(row.vistoria_previa),
    rastreador_obrigatorio:   sStr(row.rastreador_obrigatorio),
    nr_passageiros:           nInt(row.nr_passageiros),
    tipo_veiculo:             sStr(row.tipo_veiculo),
    // Prêmio
    premio_liquido:           premioLiquido,
    adicional_fracionamento:  num(row.adicional_fracionamento),
    custo_apolice:            num(row.custo_apolice),
    iof:                      num(row.iof),
    premio_total:             premioTotal,
    // Pagamento + tabelas
    forma_pagamento:          sStr(row.forma_pagamento),
    parcelas:                 row.parcelas ?? null,
    coberturas:               row.coberturas ?? null,
    servicos:                 row.servicos ?? null,
    franquias:                row.franquias ?? null,
    // RC Transporte (campos extras)
    ramo_codigo:              sStr(row.ramo_codigo),
    sucursal:                 sStr(row.sucursal),
    faturamento:              sStr(row.faturamento),
    item_veiculo:             nInt(row.item_veiculo),
    // Debug / referência
    layout_pdf:               sStr(row.layout_pdf),
    pdf_texto_bruto:          sStr(row.pdf_texto_bruto),
    dados:                    row,
  }
}
function mapSinistro(row: any, seguradora_id: string, importacao_id: string) {
  return {
    seguradora_id, importacao_id,
    numero_sinistro:   sStr(pick(row, ['sinistro','numero sinistro','nr sinistro','aviso','protocolo'])),
    ramo:              sStr(pick(row, ['ramo'])),
    numero_apolice:    sStr(pick(row, ['apolice','numero apolice','nr apolice'])),
    item_adesao:       sStr(pick(row, ['item adesao','item/adesao','adesao'])),
    cliente_nome:      sStr(pick(row, ['nome','segurado','cliente'])),
    sexo:              sStr(pick(row, ['sexo','genero'])),
    cpf_cnpj:          cleanDoc(pick(row, ['cpf cnpj','cpf - cnpj','cpf/cnpj','cpf','cnpj','documento'])),
    data_ocorrencia:   date(pick(row, ['data sinistro','data ocorrencia','ocorrencia'])),
    item:              sStr(pick(row, ['item'])),
    // valor_total IGNORADO de proposito — usuario pediu pra nao importar
    valor_indenizacao: null,
    data_aviso:        date(pick(row, ['data aviso','aviso'])),
    data_encerramento: date(pick(row, ['data encerramento','encerramento'])),
    causa:             sStr(pick(row, ['causa','natureza','cobertura'])),
    situacao:          sStr(pick(row, ['situacao','status'])),
    dados: row,
  }
}
function mapInadimplencia(row: any, seguradora_id: string, importacao_id: string) {
  return {
    seguradora_id, importacao_id,
    ramo:                  sStr(pick(row, ['ramo'])),
    numero_apolice:        sStr(pick(row, ['apolice','numero apolice','nr apolice'])),
    item_adesao:           sStr(pick(row, ['item adesao','item/adesao','adesao'])),
    recibo:                sStr(pick(row, ['recibo','numero recibo','nr recibo'])),
    premio:                num(pick(row, ['premio','prêmio','premio total','valor'])),
    // Comissao IGNORADA — usuario pediu pra nao importar
    vencimento:            date(pick(row, ['data vencimento','vencimento'])),
    previsao_cancelamento: date(pick(row, ['previsao cancelamento','previsão cancelamento','data cancelamento'])),
    cliente_nome:          sStr(pick(row, ['nome','segurado','cliente'])),
    cpf_cnpj:              cleanDoc(pick(row, ['cpf cnpj','cpf - cnpj','cpf/cnpj','cpf','cnpj','documento'])),
    sexo:                  sStr(pick(row, ['sexo','genero'])),
    // Item IGNORADO — usuario pediu pra nao importar
    parcelas:              sStr(pick(row, ['parcelas','parcela','nr parcela'])),
    // Campos legados (sem hint na planilha Allianz; ficam null)
    parcela:               nInt(pick(row, ['parcela','nr parcela'])),
    valor:                 num(pick(row, ['valor parcela','valor em aberto','valor devido'])),
    dias_atraso:           nInt(pick(row, ['dias atraso','dias em atraso','atraso'])),
    dados: row,
  }
}
function mapComissao(row: any, seguradora_id: string, importacao_id: string) {
  return {
    seguradora_id, importacao_id,
    // Inclui aliases Tokio (numApolice, CPFCnpj, nomeSegurado, vlrPremio...)
    // E aliases Porto (numero_apolice, valor_premio, valor_comissao...)
    numero_apolice: sStr(pick(row, ['apolice','numero apolice','nr apolice','numapolice','numero_apolice'])),
    cpf_cnpj:       cleanDoc(pick(row, ['cpf','cnpj','documento','cpfcnpj','cpf_cnpj'])),
    cliente_nome:   sStr(pick(row, ['segurado','cliente','nome','nomesegurado','cliente_nome'])),
    produto:        sStr(pick(row, ['produto','ramo'])),
    competencia:    sStr(pick(row, ['competencia','competência','referencia','mes referencia'])),
    data_pagamento: date(pick(row, ['pagamento','data pagamento','data credito','dtpagamento','data_pagamento'])),
    data_emissao:   date(pick(row, ['data_emissao','data emissao','dt emissao'])),
    codigo_interno: sStr(pick(row, ['codigo_interno','codigo interno','cod interno'])),
    tipo_documento: sStr(pick(row, ['tipo_documento','tipo doc','tipo documento'])),
    numero_proposta: sStr(pick(row, ['numero_proposta','proposta','nr proposta'])),
    descricao_operacao: sStr(pick(row, ['descricao_operacao','descricao operacao','operacao'])),
    pc_comissao:    num(pick(row, ['pc_comissao','pc comissao'])),
    parcela:        nInt(pick(row, ['parcela','nr parcela','numparcela'])),
    total_parcelas: nInt(pick(row, ['total parcelas','qtd parcelas','qtdeparcela'])),
    premio:         num(pick(row, ['premio','prêmio','premio liquido','vlrpremio','valor_premio'])),
    comissao_pct:   num(pick(row, ['% comissao','percentual comissao','aliquota','pccomissao'])),
    comissao_valor: num(pick(row, ['valor comissao','comissao','comissão','valor comissão','vlrcomissaoparcela','valor_comissao'])),
    dados: row,
  }
}

// Mapeamento dedicado para Ezze Seguros.
// Colunas da planilha: NomeCorretor, DataPagamento, NumeroRecibo, NomeTipoPagamento,
// NomeSegurado, NumeroApolice, NumeroEndosso, NumeroParcela, ValorBruto, ValorLiquido, NomeProduto
// O mapeamento genérico falha aqui porque "NomeCorretor"/"NomeTipoPagamento" colidem
// com o hint "nome" e os campos "ValorBruto"/"ValorLiquido" não casam com os hints
// padrão de prêmio/comissão. Aqui usamos lookup exato pelas colunas conhecidas.
function getCI(row: Record<string, any>, key: string): any {
  const target = norm(key)
  for (const k of Object.keys(row)) {
    if (norm(k) === target) return row[k]
  }
  return null
}
// Mapeamento dedicado para sinistros da Ezze Seguros.
// Colunas: Sinistro, Sinistrado, Apólice, Cliente, Ramo, Data da comunicação, Causa, Situação
// O hint genérico "data aviso" não casa com "Data da comunicação", então mapeamos
// explicitamente. Cliente vira o cliente_nome (titular da apólice) e Sinistrado/Ramo
// ficam preservados em `dados`.
function mapSinistroEzze(row: any, seguradora_id: string, importacao_id: string) {
  return {
    seguradora_id, importacao_id,
    numero_sinistro:   sStr(getCI(row, 'Sinistro')),
    numero_apolice:    sStr(getCI(row, 'Apólice') ?? getCI(row, 'Apolice')),
    cpf_cnpj:          null,
    cliente_nome:      sStr(getCI(row, 'Cliente') ?? getCI(row, 'Sinistrado')),
    data_aviso:        date(getCI(row, 'Data da comunicação') ?? getCI(row, 'Data da comunicacao')),
    data_ocorrencia:   null,
    data_encerramento: null,
    valor_indenizacao: null,
    causa:             sStr(getCI(row, 'Causa')),
    situacao:          sStr(getCI(row, 'Situação') ?? getCI(row, 'Situacao')),
    dados: row, // preserva Sinistrado e Ramo
  }
}

function mapComissaoEzze(row: any, seguradora_id: string, importacao_id: string) {
  const dataPag = date(getCI(row, 'DataPagamento'))
  const competencia = dataPag ? dataPag.slice(0, 7) : null // YYYY-MM
  return {
    seguradora_id, importacao_id,
    numero_apolice: sStr(getCI(row, 'NumeroApolice')),
    cpf_cnpj:       null, // planilha Ezze não traz CPF/CNPJ
    cliente_nome:   sStr(getCI(row, 'NomeSegurado')),
    produto:        sStr(getCI(row, 'NomeProduto')),
    competencia,
    data_pagamento: dataPag,
    parcela:        nInt(getCI(row, 'NumeroParcela')),
    total_parcelas: null,
    premio:         null, // Ezze não envia prêmio na planilha de comissões
    comissao_pct:   null,
    comissao_valor: num(getCI(row, 'ValorBruto')), // comissão bruta paga
    dados: row, // preserva NomeCorretor, NumeroRecibo, NomeTipoPagamento, NumeroEndosso, ValorLiquido
  }
}

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: ud } = await admin().auth.getUser(token)
  if (!ud?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await admin().from('users').select('role').eq('id', ud.user.id).single()
  if ((u as any)?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const, userId: ud.user.id }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ck = await checarAdmin(req)
  if (!ck.ok) return NextResponse.json({ erro: ck.erro }, { status: 401 })

  const body = await req.json().catch(() => null) as any
  const tipo = body?.tipo as Tipo
  const formato = (body?.formato as 'xlsx'|'csv'|'xml'|'pdf'|'ret') || 'xlsx'
  let linhas: any[] = Array.isArray(body?.linhas) ? body.linhas : []
  let pdfLayout: string | null = null
  if (!TIPOS.includes(tipo)) return NextResponse.json({ erro: 'tipo inválido' }, { status: 400 })

  const { data: seg } = await admin().from('seguradoras').select('id, nome').eq('id', params.id).single()
  if (!seg) return NextResponse.json({ erro: 'seguradora não encontrada' }, { status: 404 })
  const segNome = String((seg as any).nome || '')
  const isEzze = /ezze/i.test(segNome)

  if (formato === 'pdf') {
    if (!isEzze || tipo !== 'apolices') {
      return NextResponse.json({
        erro: 'Importação por PDF só está disponível para apólices da Ezze Seguros.',
      }, { status: 400 })
    }
    const b64 = String(body?.pdf_base64 || '').trim()
    if (!b64) return NextResponse.json({ erro: 'pdf_base64 ausente no body' }, { status: 400 })
    try {
      const buf = Buffer.from(b64, 'base64')
      const r = await parseEzzeApolicePdf(buf)
      pdfLayout = r.layout
      linhas = r.rows
    } catch (e: any) {
      return NextResponse.json({ erro: `Falha ao ler PDF: ${e?.message || e}` }, { status: 400 })
    }
  }

  if (!linhas.length) return NextResponse.json({ erro: 'sem linhas' }, { status: 400 })

  // cria registro de importação
  const { data: imp, error: impErr } = await admin().from('seg_importacoes').insert({
    seguradora_id: params.id,
    user_id: ck.userId,
    tipo, formato,
    nome_arquivo: body?.nome_arquivo || null,
    qtd_linhas: linhas.length,
    qtd_pendentes: linhas.length,
  }).select('id').single()
  if (impErr || !imp) return NextResponse.json({ erro: impErr?.message || 'falha ao criar importação' }, { status: 500 })

  const importacao_id = (imp as any).id as string
  const tabela = TABELAS[tipo]
  const mapper =
    (tipo === 'apolices' && isEzze && formato === 'pdf') ? mapApoliceEzze :
    tipo === 'apolices'      ? mapApolice :
    (tipo === 'sinistros' && isEzze) ? mapSinistroEzze :
    tipo === 'sinistros'     ? mapSinistro :
    tipo === 'inadimplencia' ? mapInadimplencia :
    (tipo === 'comissoes' && isEzze) ? mapComissaoEzze :
                                mapComissao
  const payloads = linhas.map(r => mapper(r, params.id, importacao_id))

  // bulk insert em chunks
  let inseridos = 0
  for (let i = 0; i < payloads.length; i += 500) {
    const chunk = payloads.slice(i, i + 500)
    const { error } = await admin().from(tabela).insert(chunk)
    if (error) {
      await admin().from('seg_importacoes').update({
        concluido_em: new Date().toISOString(),
        qtd_erros: linhas.length - inseridos,
      }).eq('id', importacao_id)
      return NextResponse.json({ erro: error.message, inseridos }, { status: 500 })
    }
    inseridos += chunk.length
  }

  await admin().from('seg_importacoes').update({
    concluido_em: new Date().toISOString(),
    qtd_pendentes: inseridos,
  }).eq('id', importacao_id)

  return NextResponse.json({ ok: true, importacao_id, inseridos, pdf_layout: pdfLayout })
}
