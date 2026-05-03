// Endpoint de importação Allianz.
//
// Body: {
//   tipo: 'sinistros_avisados'|'sinistros_encerrados'|'inadimplencia'
//        |'comissoes_emitidas'|'comissoes_pagas'|'parcelas_emitidas'
//        |'propostas_pendentes'|'apolices_emitidas'|'apolices_renovadas',
//   linhas: Record<string, any>[],   // já parseadas no client (zip + xlsx)
//   nome_arquivo?: string
// }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Tipo =
  | 'sinistros_avisados' | 'sinistros_encerrados'
  | 'inadimplencia'
  | 'comissoes_emitidas' | 'comissoes_pagas'
  | 'parcelas_emitidas'
  | 'propostas_pendentes'
  | 'apolices_emitidas' | 'apolices_renovadas'

const TIPOS_VALIDOS: Tipo[] = [
  'sinistros_avisados','sinistros_encerrados','inadimplencia',
  'comissoes_emitidas','comissoes_pagas','parcelas_emitidas',
  'propostas_pendentes','apolices_emitidas','apolices_renovadas'
]

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  if (!userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin.from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const, userId: userData.user.id }
}

// ─── helpers ───
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

// busca um valor na linha por uma lista de dicas (case/acento insensitive,
// match exato e substring)
function pick(row: Record<string, any>, hints: string[]): any {
  const keys = Object.keys(row)
  const keysN = keys.map(norm)
  for (const h of hints) {
    const hn = norm(h)
    const i = keysN.findIndex(k => k === hn)
    if (i >= 0) {
      const v = row[keys[i]]
      if (v !== undefined && v !== null && v !== '') return v
    }
  }
  for (const h of hints) {
    const hn = norm(h)
    const i = keysN.findIndex(k => k.includes(hn))
    if (i >= 0) {
      const v = row[keys[i]]
      if (v !== undefined && v !== null && v !== '') return v
    }
  }
  return null
}

const s = (v: any): string | null => {
  if (v === undefined || v === null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}
const n = (v: any): number | null => {
  if (v === undefined || v === null || v === '') return null
  let str = String(v).trim().replace(/[R$\s%]/g, '')
  if (!str) return null
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.')
  else if ((str.match(/\./g) || []).length > 1) str = str.replace(/\./g, '')
  const num = Number(str)
  return isFinite(num) ? num : null
}
const nClamp = (v: any, max: number): number | null => {
  const x = n(v); if (x === null) return null
  return Math.abs(x) > max ? null : x
}
const nInt = (v: any): number | null => {
  const x = n(v); return x === null ? null : Math.round(x)
}
const date = (v: any): string | null => {
  if (v === undefined || v === null || v === '') return null
  // serial Excel (number) — converte pra ISO
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
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}
const cleanCpf = (v: any) => {
  const t = s(v); if (!t) return null
  return t.replace(/\D/g, '') || null
}
const MAX_VAL = 99_999_999_999.99
const MAX_PCT = 9_999.9999

// pré-carrega lookup cliente_id por cpf_cnpj e apolice_id por numero
async function preloadLookups(cpfs: string[], apolices: string[]) {
  const clientePorCpf: Record<string, string> = {}
  const apolicePorNum: Record<string, string> = {}
  if (cpfs.length) {
    const { data } = await supabaseAdmin.from('clientes')
      .select('id, cpf_cnpj').in('cpf_cnpj', cpfs)
    for (const c of data || []) if (c.cpf_cnpj) clientePorCpf[c.cpf_cnpj] = c.id
  }
  if (apolices.length) {
    const { data } = await supabaseAdmin.from('apolices')
      .select('id, numero').in('numero', apolices)
    for (const a of data || []) if (a.numero) apolicePorNum[a.numero] = a.id
  }
  return { clientePorCpf, apolicePorNum }
}

// ─── mapeadores por tipo ───

function mapSinistro(row: any, status: 'avisado'|'encerrado') {
  return {
    status,
    numero_sinistro: s(pick(row, ['numero sinistro','sinistro','nr sinistro','n sinistro','aviso','protocolo'])),
    numero_apolice:  s(pick(row, ['numero apolice','apolice','nr apolice','n apolice'])),
    ramo:            s(pick(row, ['ramo','produto'])),
    cliente_nome:    s(pick(row, ['segurado','cliente','nome'])),
    cpf_cnpj:        cleanCpf(pick(row, ['cpf','cnpj','documento','cpf/cnpj'])),
    data_aviso:        date(pick(row, ['data aviso','data do aviso','aviso'])),
    data_ocorrencia:   date(pick(row, ['data ocorrencia','data do sinistro','ocorrencia','data evento'])),
    data_encerramento: date(pick(row, ['data encerramento','encerramento','data de encerramento','data fechamento'])),
    valor_indenizacao: nClamp(pick(row, ['valor indenizacao','indenizacao','valor pago','valor liquidado']), MAX_VAL),
    valor_reserva:     nClamp(pick(row, ['valor reserva','reserva']), MAX_VAL),
    causa:    s(pick(row, ['causa','natureza','tipo sinistro','cobertura'])),
    situacao: s(pick(row, ['situacao','status'])),
    dados: row,
  }
}

function mapInadimplencia(row: any) {
  return {
    numero_apolice:  s(pick(row, ['apolice','numero apolice'])),
    numero_proposta: s(pick(row, ['proposta','numero proposta'])),
    parcela:         nInt(pick(row, ['parcela','nr parcela','numero parcela'])),
    cliente_nome:    s(pick(row, ['segurado','cliente','nome'])),
    cpf_cnpj:        cleanCpf(pick(row, ['cpf','cnpj','documento'])),
    vencimento:      date(pick(row, ['vencimento','data vencimento','data venc'])),
    valor:           nClamp(pick(row, ['valor','valor parcela','valor em aberto','valor devido']), MAX_VAL),
    dias_atraso:     nInt(pick(row, ['dias atraso','dias em atraso','atraso'])),
    ramo:            s(pick(row, ['ramo','produto'])),
    forma_pagamento: s(pick(row, ['forma pagamento','forma de pagamento','cobranca'])),
    dados: row,
  }
}

function mapComissao(row: any, tipo: 'emitida'|'paga') {
  return {
    tipo,
    numero_apolice:  s(pick(row, ['apolice','numero apolice'])),
    numero_proposta: s(pick(row, ['proposta','numero proposta'])),
    endosso:         s(pick(row, ['endosso'])),
    parcela:         nInt(pick(row, ['parcela','nr parcela'])),
    cliente_nome:    s(pick(row, ['segurado','cliente','nome'])),
    cpf_cnpj:        cleanCpf(pick(row, ['cpf','cnpj','documento'])),
    ramo:            s(pick(row, ['ramo'])),
    produto:         s(pick(row, ['produto'])),
    data_emissao:    date(pick(row, ['emissao','data emissao','data emissão'])),
    data_pagamento:  date(pick(row, ['pagamento','data pagamento','data credito','data crédito'])),
    competencia:     s(pick(row, ['competencia','competência','referencia','referência','mes referencia'])),
    premio:          nClamp(pick(row, ['premio','prêmio','premio liquido','prêmio líquido']), MAX_VAL),
    comissao_pct:    nClamp(pick(row, ['percentual comissao','% comissao','comissao %','aliquota','alíquota']), MAX_PCT),
    comissao_valor:  nClamp(pick(row, ['valor comissao','comissao','comissão','valor comissão']), MAX_VAL),
    dados: row,
  }
}

function mapParcela(row: any) {
  return {
    numero_apolice:  s(pick(row, ['apolice','numero apolice'])),
    numero_proposta: s(pick(row, ['proposta','numero proposta'])),
    parcela:         nInt(pick(row, ['parcela','nr parcela','numero parcela'])),
    total_parcelas:  nInt(pick(row, ['total parcelas','qtd parcelas','quantidade parcelas','total de parcelas'])),
    cliente_nome:    s(pick(row, ['segurado','cliente','nome'])),
    cpf_cnpj:        cleanCpf(pick(row, ['cpf','cnpj','documento'])),
    ramo:            s(pick(row, ['ramo','produto'])),
    vencimento:      date(pick(row, ['vencimento','data vencimento','data venc'])),
    valor:           nClamp(pick(row, ['valor','valor parcela','valor emitido']), MAX_VAL),
    forma_pagamento: s(pick(row, ['forma pagamento','forma de pagamento','cobranca'])),
    status:          s(pick(row, ['situacao','status'])),
    dados: row,
  }
}

function mapProposta(row: any) {
  return {
    numero_proposta: s(pick(row, ['proposta','numero proposta','nr proposta'])),
    cliente_nome:    s(pick(row, ['segurado','cliente','nome','proponente'])),
    cpf_cnpj:        cleanCpf(pick(row, ['cpf','cnpj','documento'])),
    ramo:            s(pick(row, ['ramo'])),
    produto:         s(pick(row, ['produto'])),
    data_proposta:   date(pick(row, ['data proposta','emissao','data emissao','data envio'])),
    vigencia_ini:    date(pick(row, ['vigencia inicial','inicio vigencia','vigencia ini','inicio'])),
    vigencia_fim:    date(pick(row, ['vigencia final','fim vigencia','vigencia fim','fim'])),
    premio:          nClamp(pick(row, ['premio','prêmio','valor']), MAX_VAL),
    situacao:        s(pick(row, ['situacao','status','situação'])),
    pendencia:       s(pick(row, ['pendencia','pendência','motivo pendencia','observacao','observação'])),
    dados: row,
  }
}

function mapApoliceRel(row: any, tipo: 'emitida'|'renovada') {
  return {
    tipo,
    numero_apolice:   s(pick(row, ['apolice','numero apolice','nr apolice'])),
    numero_proposta:  s(pick(row, ['proposta','numero proposta'])),
    endosso:          s(pick(row, ['endosso'])),
    apolice_anterior: s(pick(row, ['apolice anterior','apólice anterior','renovacao','renovação'])),
    cliente_nome:     s(pick(row, ['segurado','cliente','nome'])),
    cpf_cnpj:         cleanCpf(pick(row, ['cpf','cnpj','documento'])),
    ramo:             s(pick(row, ['ramo'])),
    produto:          s(pick(row, ['produto'])),
    emissao:          date(pick(row, ['emissao','data emissao','data emissão'])),
    vigencia_ini:     date(pick(row, ['vigencia inicial','inicio vigencia','vigencia ini','inicio'])),
    vigencia_fim:     date(pick(row, ['vigencia final','fim vigencia','vigencia fim','fim','vencimento'])),
    premio_liquido:   nClamp(pick(row, ['premio liquido','prêmio líquido','liquido']), MAX_VAL),
    premio_total:    nClamp(pick(row, ['premio total','prêmio total','premio','prêmio','valor']), MAX_VAL),
    comissao_pct:    nClamp(pick(row, ['percentual comissao','% comissao','comissao %']), MAX_PCT),
    comissao_valor:  nClamp(pick(row, ['valor comissao','comissao','comissão']), MAX_VAL),
    forma_pagamento: s(pick(row, ['forma pagamento','forma de pagamento'])),
    qtd_parcelas:    nInt(pick(row, ['qtd parcelas','quantidade parcelas','parcelas'])),
    dados: row,
  }
}

// ─── inserir em batch genérico ───
async function bulkInsert(
  tabela: string,
  payloads: any[],
  conflito: string | null,
  stats: { qtd_criados: number; qtd_atualizados: number; qtd_erros: number; erros: string[] }
) {
  if (!payloads.length) return
  const TAM = 200
  for (let i = 0; i < payloads.length; i += TAM) {
    const chunk = payloads.slice(i, i + TAM)
    const q = supabaseAdmin.from(tabela).upsert(chunk, conflito ? { onConflict: conflito, ignoreDuplicates: false } : undefined)
    const { error } = await q
    const count = chunk.length
    if (error) {
      // fallback row-by-row
      for (const p of chunk) {
        const q2 = supabaseAdmin.from(tabela).upsert(p, conflito ? { onConflict: conflito } : undefined)
        const { error: e2 } = await q2
        if (e2) {
          stats.qtd_erros++
          if (stats.erros.length < 30) stats.erros.push(e2.message?.slice(0, 120) || 'erro')
        } else {
          stats.qtd_criados++
        }
      }
    } else {
      stats.qtd_criados += count
    }
  }
}

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const tipo = body.tipo as Tipo
  const linhas: any[] = Array.isArray(body.linhas) ? body.linhas : []
  const nomeArquivo = body.nome_arquivo || null

  if (!TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }
  if (linhas.length === 0) {
    return NextResponse.json({ error: 'sem linhas pra importar' }, { status: 400 })
  }

  // cria registro de importação
  const { data: imp } = await supabaseAdmin.from('allianz_importacoes').insert({
    user_id: auth.userId,
    nome_arquivo: nomeArquivo,
    tipo,
    qtd_lidos: linhas.length,
  }).select('id').single()
  const importacaoId = imp?.id || null

  const stats = { qtd_lidos: linhas.length, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }

  try {
    // pré-carrega lookups
    const cpfs = Array.from(new Set(linhas.map(r => cleanCpf(pick(r, ['cpf','cnpj','documento','cpf/cnpj']))).filter(Boolean) as string[]))
    const aps  = Array.from(new Set(linhas.map(r => s(pick(r, ['apolice','numero apolice']))).filter(Boolean) as string[]))
    const { clientePorCpf, apolicePorNum } = await preloadLookups(cpfs, aps)

    const enrich = (p: any) => {
      const cli = p.cpf_cnpj ? (clientePorCpf[p.cpf_cnpj] || null) : null
      const apo = p.numero_apolice ? (apolicePorNum[p.numero_apolice] || null) : null
      return { ...p, cliente_id: cli, apolice_id: apo, importacao_id: importacaoId }
    }

    if (tipo === 'sinistros_avisados' || tipo === 'sinistros_encerrados') {
      const status = tipo === 'sinistros_avisados' ? 'avisado' : 'encerrado'
      const payloads = linhas.map(r => enrich(mapSinistro(r, status)))
        .filter(p => p.numero_sinistro)
      await bulkInsert('allianz_sinistros', payloads, 'status,numero_sinistro', stats)
    }
    else if (tipo === 'inadimplencia') {
      const payloads = linhas.map(r => enrich(mapInadimplencia(r)))
        .filter(p => p.numero_apolice && p.parcela && p.vencimento)
      await bulkInsert('allianz_inadimplencia', payloads, 'numero_apolice,parcela,vencimento', stats)
    }
    else if (tipo === 'comissoes_emitidas' || tipo === 'comissoes_pagas') {
      const t = tipo === 'comissoes_emitidas' ? 'emitida' : 'paga'
      const payloads = linhas.map(r => enrich(mapComissao(r, t))).filter(p => p.numero_apolice || p.numero_proposta)
      await bulkInsert('allianz_comissoes', payloads, null, stats)
    }
    else if (tipo === 'parcelas_emitidas') {
      const payloads = linhas.map(r => enrich(mapParcela(r)))
        .filter(p => p.numero_apolice && p.parcela)
      await bulkInsert('allianz_parcelas_emitidas', payloads, 'numero_apolice,parcela', stats)
    }
    else if (tipo === 'propostas_pendentes') {
      const payloads = linhas.map(r => enrich(mapProposta(r))).filter(p => p.numero_proposta)
      await bulkInsert('allianz_propostas_pendentes', payloads, 'numero_proposta', stats)
    }
    else if (tipo === 'apolices_emitidas' || tipo === 'apolices_renovadas') {
      const t = tipo === 'apolices_emitidas' ? 'emitida' : 'renovada'
      const payloads = linhas.map(r => enrich(mapApoliceRel(r, t))).filter(p => p.numero_apolice)
      await bulkInsert('allianz_apolices_relatorio', payloads, 'tipo,numero_apolice', stats)

      // upsert também na tabela principal `apolices`, casando por (numero) e
      // criando cliente se necessário. Mantém status conforme o relatório.
      for (const p of payloads) {
        try {
          let clienteId = p.cliente_id
          if (!clienteId && p.cpf_cnpj && p.cliente_nome) {
            const tipoP = p.cpf_cnpj.length > 11 ? 'PJ' : 'PF'
            const { data: novo } = await supabaseAdmin.from('clientes').insert({
              nome: p.cliente_nome, cpf_cnpj: p.cpf_cnpj, tipo: tipoP, fonte: 'Allianz - Importação'
            }).select('id').single()
            if (novo) clienteId = novo.id
          }
          if (!clienteId || !p.numero_apolice) continue

          const apolicePayload: any = {
            cliente_id: clienteId,
            numero: p.numero_apolice,
            proposta: p.numero_proposta,
            endosso: p.endosso,
            ramo: p.ramo,
            produto: p.produto,
            seguradora: 'Allianz',
            emissao: p.emissao,
            vigencia_ini: p.vigencia_ini,
            vigencia_fim: p.vigencia_fim,
            premio: p.premio_total,
            premio_liquido: p.premio_liquido,
            comissao_pct: p.comissao_pct,
            qtd_parcelas: p.qtd_parcelas,
            tipo_pagamento: p.forma_pagamento,
            status: 'ativo',
          }

          if (p.apolice_id) {
            await supabaseAdmin.from('apolices').update(apolicePayload).eq('id', p.apolice_id)
            stats.qtd_atualizados++
          } else {
            await supabaseAdmin.from('apolices').insert(apolicePayload)
          }
        } catch {/* ignora — apolices_relatorio já guardou o bruto */}
      }
    }

    // finaliza importação
    await supabaseAdmin.from('allianz_importacoes').update({
      qtd_criados: stats.qtd_criados,
      qtd_atualizados: stats.qtd_atualizados,
      qtd_erros: stats.qtd_erros,
      erros: stats.erros.slice(0, 30),
      concluido_em: new Date().toISOString(),
    }).eq('id', importacaoId)

    return NextResponse.json({ ok: true, stats, importacao_id: importacaoId })
  } catch (e: any) {
    await supabaseAdmin.from('allianz_importacoes').update({
      qtd_erros: stats.qtd_lidos,
      erros: [String(e?.message || e).slice(0, 200)],
      concluido_em: new Date().toISOString(),
    }).eq('id', importacaoId)
    return NextResponse.json({ error: e.message || 'erro' }, { status: 500 })
  }
}
