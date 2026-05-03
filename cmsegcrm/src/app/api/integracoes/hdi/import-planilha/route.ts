// Importação de planilhas (XLS/XLSX/CSV) da HDI.
//
// Body: {
//   tipo: 'comissoes_emitidas' | 'comissoes_pagas' | 'inadimplencia',
//   linhas: Record<string, any>[],   // já parseadas no client (xlsx)
//   nome_arquivo?: string
// }
//
// Mantém o mesmo formato/contrato da rota Allianz para reaproveitar o
// componente de upload no front.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Tipo = 'comissoes_emitidas' | 'comissoes_pagas' | 'inadimplencia'
const TIPOS_VALIDOS: Tipo[] = ['comissoes_emitidas', 'comissoes_pagas', 'inadimplencia']

async function checarAdmin(req: NextRequest, supabaseAdmin: any) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  if (!userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin.from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const, userId: userData.user.id }
}

// ─── helpers de normalização ───
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

const s = (v: any): string | null => {
  if (v === undefined || v === null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}
const num = (v: any): number | null => {
  if (v === undefined || v === null || v === '') return null
  let str = String(v).trim().replace(/[R$\s%]/g, '')
  if (!str) return null
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.')
  else if ((str.match(/\./g) || []).length > 1) str = str.replace(/\./g, '')
  const n = Number(str)
  return isFinite(n) ? n : null
}
const MAX_VAL = 99_999_999_999.99
const MAX_PCT = 9_999.9999
const nClamp = (v: any, max: number): number | null => {
  const x = num(v); if (x === null) return null
  return Math.abs(x) > max ? null : x
}
const nInt = (v: any): number | null => {
  const x = num(v); return x === null ? null : Math.round(x)
}
const date = (v: any): string | null => {
  if (v === undefined || v === null || v === '') return null
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

// ─── mapeadores ───
function mapComissao(row: any, tipo: 'emitida' | 'paga') {
  return {
    tipo,
    numero_apolice:  s(pick(row, ['apolice','numero apolice','nr apolice','n apolice','n° apolice'])),
    numero_proposta: s(pick(row, ['proposta','numero proposta','nr proposta'])),
    endosso:         s(pick(row, ['endosso','nr endosso'])),
    parcela:         nInt(pick(row, ['parcela','nr parcela','numero parcela'])),
    cliente_nome:    s(pick(row, ['segurado','cliente','nome'])),
    cpf_cnpj:        cleanCpf(pick(row, ['cpf','cnpj','documento','cpf/cnpj'])),
    ramo:            s(pick(row, ['ramo'])),
    produto:         s(pick(row, ['produto'])),
    data_emissao:    date(pick(row, ['emissao','data emissao','data emissão'])),
    data_pagamento:  date(pick(row, ['pagamento','data pagamento','data credito','data crédito','data repasse'])),
    competencia:     s(pick(row, ['competencia','competência','referencia','referência','mes referencia','mês referência'])),
    premio:          nClamp(pick(row, ['premio','prêmio','premio liquido','prêmio líquido']), MAX_VAL),
    comissao_pct:    nClamp(pick(row, ['percentual comissao','% comissao','comissao %','aliquota','alíquota','%']), MAX_PCT),
    comissao_valor:  nClamp(pick(row, ['valor comissao','comissao','comissão','valor comissão']), MAX_VAL),
    dados: row,
  }
}

function mapInadimplencia(row: any) {
  return {
    numero_apolice:  s(pick(row, ['apolice','numero apolice','nr apolice'])),
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

// ─── lookup cliente/apólice por cpf e numero ───
async function preloadLookups(supabaseAdmin: any, cpfs: string[], apolices: string[]) {
  const clientePorCpf: Record<string, string> = {}
  const apolicePorNum: Record<string, string> = {}
  if (cpfs.length) {
    const { data } = await supabaseAdmin.from('clientes').select('id, cpf_cnpj').in('cpf_cnpj', cpfs)
    for (const c of data || []) if (c.cpf_cnpj) clientePorCpf[c.cpf_cnpj] = c.id
  }
  if (apolices.length) {
    const { data } = await supabaseAdmin.from('apolices').select('id, numero').in('numero', apolices)
    for (const a of data || []) if (a.numero) apolicePorNum[a.numero] = a.id
  }
  return { clientePorCpf, apolicePorNum }
}

async function bulkInsert(
  supabaseAdmin: any,
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
    if (error) {
      for (const p of chunk) {
        const { error: e2 } = await supabaseAdmin.from(tabela).upsert(p, conflito ? { onConflict: conflito } : undefined)
        if (e2) {
          stats.qtd_erros++
          if (stats.erros.length < 30) stats.erros.push(e2.message?.slice(0, 120) || 'erro')
        } else {
          stats.qtd_criados++
        }
      }
    } else {
      stats.qtd_criados += chunk.length
    }
  }
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getAdmin()
  const auth = await checarAdmin(req, supabaseAdmin)
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

  const { data: imp } = await supabaseAdmin.from('hdi_importacoes').insert({
    user_id: auth.userId,
    nome_arquivo: nomeArquivo,
    tipo,
    qtd_lidos: linhas.length,
  }).select('id').single()
  const importacaoId = imp?.id || null

  const stats = { qtd_lidos: linhas.length, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }

  try {
    const cpfs = Array.from(new Set(linhas.map(r => cleanCpf(pick(r, ['cpf','cnpj','documento','cpf/cnpj']))).filter(Boolean) as string[]))
    const aps  = Array.from(new Set(linhas.map(r => s(pick(r, ['apolice','numero apolice']))).filter(Boolean) as string[]))
    const { clientePorCpf, apolicePorNum } = await preloadLookups(supabaseAdmin, cpfs, aps)

    const enrich = (p: any) => {
      const cli = p.cpf_cnpj ? (clientePorCpf[p.cpf_cnpj] || null) : null
      const apo = p.numero_apolice ? (apolicePorNum[p.numero_apolice] || null) : null
      return { ...p, cliente_id: cli, apolice_id: apo, importacao_id: importacaoId }
    }

    if (tipo === 'comissoes_emitidas' || tipo === 'comissoes_pagas') {
      const t = tipo === 'comissoes_emitidas' ? 'emitida' : 'paga'
      const payloads = linhas.map(r => enrich(mapComissao(r, t)))
        .filter((p: any) => p.numero_apolice || p.numero_proposta)
      await bulkInsert(supabaseAdmin, 'hdi_comissoes', payloads, null, stats)
    } else if (tipo === 'inadimplencia') {
      const payloads = linhas.map(r => enrich(mapInadimplencia(r)))
        .filter((p: any) => p.numero_apolice && p.parcela && p.vencimento)
      await bulkInsert(supabaseAdmin, 'hdi_inadimplencia', payloads, 'numero_apolice,parcela,vencimento', stats)
    }

    await supabaseAdmin.from('hdi_importacoes').update({
      qtd_criados: stats.qtd_criados,
      qtd_atualizados: stats.qtd_atualizados,
      qtd_erros: stats.qtd_erros,
      erros: stats.erros.slice(0, 30),
      concluido_em: new Date().toISOString(),
    }).eq('id', importacaoId)

    return NextResponse.json({ ok: true, stats, importacao_id: importacaoId })
  } catch (e: any) {
    await supabaseAdmin.from('hdi_importacoes').update({
      qtd_erros: stats.qtd_lidos,
      erros: [String(e?.message || e).slice(0, 200)],
      concluido_em: new Date().toISOString(),
    }).eq('id', importacaoId)
    return NextResponse.json({ error: e.message || 'erro' }, { status: 500 })
  }
}
