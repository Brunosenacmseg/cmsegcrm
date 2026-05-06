// Mescla negócios duplicados por CPF/CNPJ entre os "em andamento".
//
// Critério de duplicidade: mesmo CPF/CNPJ válido (cleansed) entre negocios cuja
// etapa NÃO esteja na lista de etapas finais. Vencedor do grupo: o que tem
// rd_id (preserva vínculo com RD Station); empate → o mais antigo (created_at).
//
// O endpoint repointa as 18 FKs que apontam pra negocios e só depois deleta os
// perdedores. Sem repointar antes, FKs com NO ACTION (apolices/ligacoes)
// bloqueiam o delete e CASCADEs (anexos/cotacoes/notas/produtos/tags/tarefas)
// apagam dados reais junto.
//
// Body: { dry_run?: boolean (default true), limit_grupos?: number, funis?: string[] }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: userData } = await supabaseAdmin().auth.getUser(token)
  if (!userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await supabaseAdmin().from('users').select('role').eq('id', userData.user.id).single()
  if ((u as any)?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const }
}

const ETAPAS_FINAIS = new Set([
  'Ganho', 'Perdido', 'PROCESSO FINALIZADO', 'FINALIZADO', 'EMITIDO',
  'APOLICE EMITIDA', 'APÓLICE EMITIDA', 'ENDOSSO EMITIDO',
  'SINISTRO ENCERRADO', 'SAC FINALIZADO', 'CANCELADO',
  'Fechado Ganho', 'Fechado Perdido', 'Renovado', 'Não Renovado', 'Negado', 'Pago',
])

// 18 FKs descobertas via information_schema. Repointar TODAS antes de deletar.
const FK_TABLES: Array<{ table: string; col: string }> = [
  { table: 'anexos',                 col: 'negocio_id' },
  { table: 'apolices',               col: 'negocio_id' },
  { table: 'assinaturas',            col: 'negocio_id' },
  { table: 'automacoes_logs',        col: 'negocio_id' },
  { table: 'comissoes_recebidas',    col: 'negocio_id' },
  { table: 'cotacoes',               col: 'negocio_id' },
  { table: 'historico',              col: 'negocio_id' },
  { table: 'ligacoes',               col: 'negocio_id' },
  { table: 'meta_eventos_log',       col: 'negocio_id' },
  { table: 'meta_leads',             col: 'negocio_id' },
  { table: 'negocio_notas',          col: 'negocio_id' },
  { table: 'negocio_produtos',       col: 'negocio_id' },
  { table: 'negocio_tags',           col: 'negocio_id' },
  { table: 'seg_stage_inadimplencia',col: 'negocio_id' },
  { table: 'seg_stage_propostas',    col: 'negocio_id' },
  { table: 'seg_stage_sinistros',    col: 'negocio_id' },
  { table: 'tarefas',                col: 'negocio_id' },
  { table: 'whatsapp_mensagens',     col: 'negocio_id' },
]

function docValido(v: any): string | null {
  const d = String(v ?? '').replace(/\D/g, '')
  if (d.length !== 11 && d.length !== 14) return null
  if (/^(\d)\1+$/.test(d)) return null
  return d
}

interface Negocio {
  id: string
  rd_id: string | null
  cliente_id: string | null
  funil_id: string | null
  etapa: string
  created_at: string
  cpf_cnpj: string | null
  cliente_doc: string | null
  funil_nome: string | null
}

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const dryRun = body?.dry_run !== false           // default = true
  const limitGrupos: number = Number(body?.limit_grupos) || 0
  const funisFiltro: string[] | null = Array.isArray(body?.funis) && body.funis.length ? body.funis : null

  // Carrega negócios paginado, junto com cpf do cliente associado.
  const PAGE = 1000
  const negocios: Negocio[] = []
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin()
      .from('negocios')
      .select('id, rd_id, cliente_id, funil_id, etapa, created_at, cpf_cnpj, clientes(cpf_cnpj), funis(nome)')
      .order('created_at', { ascending: true })
      .range(off, off + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || !data.length) break
    for (const r of data as any[]) {
      negocios.push({
        id: r.id,
        rd_id: r.rd_id,
        cliente_id: r.cliente_id,
        funil_id: r.funil_id,
        etapa: r.etapa,
        created_at: r.created_at,
        cpf_cnpj: r.cpf_cnpj,
        cliente_doc: r.clientes?.cpf_cnpj || null,
        funil_nome: r.funis?.nome || null,
      })
    }
    if (data.length < PAGE) break
    if (off > 1_000_000) break
  }

  // Agrupa por doc válido, só os em andamento, opcionalmente filtrando funis.
  const grupos = new Map<string, Negocio[]>()
  for (const n of negocios) {
    if (ETAPAS_FINAIS.has(n.etapa)) continue
    if (funisFiltro && !funisFiltro.includes(n.funil_nome || '')) continue
    const doc = docValido(n.cpf_cnpj) || docValido(n.cliente_doc)
    if (!doc) continue
    if (!grupos.has(doc)) grupos.set(doc, [])
    grupos.get(doc)!.push(n)
  }

  // Identifica vencedor por grupo: prefere ter rd_id, empate → mais antigo.
  type Plano = { doc: string; vencedor: string; perdedores: string[]; tamanho: number; funis: string[] }
  const planos: Plano[] = []
  for (const [doc, lista] of grupos) {
    if (lista.length < 2) continue
    const ordenado = [...lista].sort((a, b) => {
      if (!!a.rd_id !== !!b.rd_id) return a.rd_id ? -1 : 1
      return a.created_at.localeCompare(b.created_at)
    })
    const [vencedor, ...perdedores] = ordenado
    planos.push({
      doc,
      vencedor: vencedor.id,
      perdedores: perdedores.map(p => p.id),
      tamanho: lista.length,
      funis: Array.from(new Set(lista.map(n => n.funil_nome || ''))),
    })
  }
  planos.sort((a, b) => b.tamanho - a.tamanho)
  const planosExec = limitGrupos > 0 ? planos.slice(0, limitGrupos) : planos

  const stats = {
    total_negocios_lidos: negocios.length,
    grupos_duplicados: planos.length,
    perdedores_total: planos.reduce((s, p) => s + p.perdedores.length, 0),
    grupos_a_processar: planosExec.length,
    perdedores_a_processar: planosExec.reduce((s, p) => s + p.perdedores.length, 0),
  }

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      stats,
      amostra: planosExec.slice(0, 10).map(p => ({
        doc_mascarado: p.doc.length === 11
          ? `${p.doc.slice(0, 3)}.***.***-${p.doc.slice(-2)}`
          : `${p.doc.slice(0, 2)}.***.***/****-${p.doc.slice(-2)}`,
        tamanho: p.tamanho,
        funis: p.funis,
        vencedor: p.vencedor,
        perdedores: p.perdedores,
      })),
    })
  }

  // Execução real: pra cada perdedor, repointa as 18 FKs e depois deleta o registro.
  let mesclados = 0
  let fkAtualizadas = 0
  let erros = 0
  const errosDetalhe: string[] = []

  for (const p of planosExec) {
    for (const perdedor of p.perdedores) {
      let okPerdedor = true
      for (const { table, col } of FK_TABLES) {
        const { error, count } = await supabaseAdmin()
          .from(table)
          .update({ [col]: p.vencedor }, { count: 'exact' })
          .eq(col, perdedor)
        if (error) {
          okPerdedor = false
          erros++
          errosDetalhe.push(`update ${table}.${col} (${perdedor}): ${error.message}`)
          break
        }
        if (count) fkAtualizadas += count
      }
      if (!okPerdedor) continue

      // Histórico do merge no vencedor.
      await supabaseAdmin().from('historico').insert({
        negocio_id: p.vencedor,
        tipo: 'gray',
        titulo: '🧹 Negócio duplicado mesclado',
        descricao: `Mesclado a partir de ${perdedor} (CPF/CNPJ ${p.doc})`,
      })

      const { error: errDel } = await supabaseAdmin().from('negocios').delete().eq('id', perdedor)
      if (errDel) {
        erros++
        errosDetalhe.push(`delete negocios ${perdedor}: ${errDel.message}`)
        continue
      }
      mesclados++
    }
  }

  return NextResponse.json({
    dry_run: false,
    stats,
    mesclados,
    fk_atualizadas: fkAtualizadas,
    erros,
    erros_amostra: errosDetalhe.slice(0, 10),
  })
}

// GET é health-check. Pra rodar dry-run use POST com {} (dry_run default true).
export function GET() {
  return NextResponse.json({ ok: true, service: 'dedupe-negocios' })
}
