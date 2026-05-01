// Endpoint genérico de importação de dados (CSV/XLSX/JSON).
// Recebe entidade + linhas mapeadas (já parseadas no client) e insere
// em batch com upsert por chave natural.
//
// Body: {
//   entidade: 'clientes'|'negocios'|'apolices'|'propostas'|'comissoes'|'tarefas',
//   linhas:   [{ ...campos }],
//   nome_arquivo?: string,
//   formato?:      'csv'|'xlsx'|'pdf'
// }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

// Normaliza string e número
const s = (v: any) => v === undefined || v === null || v === '' ? null : String(v).trim()
const n = (v: any) => {
  if (v === undefined || v === null || v === '') return null
  const num = Number(String(v).replace(/[R$\s.]/g, '').replace(',', '.'))
  return isFinite(num) ? num : null
}
const dateBR = (v: any) => {
  if (!v) return null
  const t = String(v).trim()
  // DD/MM/YYYY → YYYY-MM-DD
  const m1 = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
  // YYYY-MM-DD já OK
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return null
}

async function importarClientes(linhas: any[]) {
  const stats = { qtd_lidos: linhas.length, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  for (const r of linhas) {
    try {
      const cpf = s(r.cpf_cnpj || r.cpf || r.cnpj)
      const email = s(r.email)?.toLowerCase()
      const nome = s(r.nome)
      if (!nome && !cpf && !email) { stats.qtd_erros++; continue }

      // Tenta achar por cpf, email, ou nome
      let existente: any = null
      if (cpf) ({ data: existente } = await supabaseAdmin.from('clientes').select('id').eq('cpf_cnpj', cpf).maybeSingle())
      if (!existente && email) ({ data: existente } = await supabaseAdmin.from('clientes').select('id').eq('email', email).maybeSingle())

      const payload: any = {
        nome: nome || email || cpf,
        cpf_cnpj: cpf,
        email,
        telefone: s(r.telefone || r.fone || r.celular),
        cep: s(r.cep),
        cidade: s(r.cidade),
        estado: s(r.estado || r.uf),
        tipo: cpf && cpf.replace(/\D/g,'').length > 11 ? 'PJ' : 'PF',
        fonte: s(r.fonte) || 'Importação CSV/XLSX',
      }
      if (existente) {
        await supabaseAdmin.from('clientes').update(payload).eq('id', existente.id)
        stats.qtd_atualizados++
      } else {
        await supabaseAdmin.from('clientes').insert(payload)
        stats.qtd_criados++
      }
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(e?.message?.slice(0, 120) || 'erro')
    }
  }
  return stats
}

async function importarNegocios(linhas: any[]) {
  const stats = { qtd_lidos: linhas.length, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  // Pega funil padrão de venda (primeira linha) — pode ser overridable por linha via "funil" (nome)
  const { data: funis } = await supabaseAdmin.from('funis').select('id, nome, etapas, tipo').order('ordem')
  const funilDefault = (funis || []).find((f:any) => f.tipo === 'venda') || funis?.[0]
  if (!funilDefault) {
    return { ...stats, qtd_erros: linhas.length, erros: ['Nenhum funil cadastrado. Crie um funil antes de importar negócios.'] }
  }
  for (const r of linhas) {
    try {
      const titulo = s(r.titulo) || s(r.cliente) || s(r.nome) || 'Negócio importado'
      // Resolve funil/etapa
      const funilNome = s(r.funil)
      const f = funilNome ? (funis || []).find((x:any) => x.nome.toLowerCase() === funilNome.toLowerCase()) || funilDefault : funilDefault
      const etapa = s(r.etapa) || (f.etapas?.[0] || 'Novo')
      // Resolve cliente por CPF
      const cpf = s(r.cpf_cnpj || r.cpf)
      let clienteId: string | null = null
      if (cpf) {
        const { data: c } = await supabaseAdmin.from('clientes').select('id').eq('cpf_cnpj', cpf).maybeSingle()
        clienteId = c?.id || null
      }

      // Mapeamento estado/status → ganho/perdido/em_andamento
      // Aceita variações em pt: vendida, vendido, ganha, ganhou, ganho,
      // fechado, fechada, won → ganho. perdida, perdido, perdeu, lost,
      // cancelada, cancelado → perdido. Senão (em andamento, ativo,
      // aberto, vazio) → em_andamento.
      const estadoRaw = (s(r.estado || r.status || r.situacao) || '').toLowerCase()
      let status: 'ganho'|'perdido'|'em_andamento' = 'em_andamento'
      let dataFech: string | null = null
      if (/vend|ganh|fechad|won/.test(estadoRaw))                 { status = 'ganho';   dataFech = new Date().toISOString() }
      else if (/perd|cancel|lost/.test(estadoRaw))                { status = 'perdido'; dataFech = new Date().toISOString() }

      const payload: any = {
        titulo,
        cliente_id: clienteId,
        funil_id: f.id,
        etapa,
        produto: s(r.produto),
        seguradora: s(r.seguradora),
        premio: n(r.premio || r.valor),
        comissao_pct: n(r.comissao_pct || r.comissao),
        cpf_cnpj: cpf,
        cep: s(r.cep),
        fonte: s(r.fonte) || 'Importação CSV/XLSX',
        vencimento: dateBR(r.vencimento),
        obs: s(r.obs || r.observacoes),
        status,
        data_fechamento: dataFech,
        motivo_perda: status === 'perdido' ? (s(r.motivo_perda) || null) : null,
      }
      await supabaseAdmin.from('negocios').insert(payload)
      stats.qtd_criados++
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(e?.message?.slice(0, 120) || 'erro')
    }
  }
  return stats
}

async function importarApolices(linhas: any[]) {
  const stats = { qtd_lidos: linhas.length, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  for (const r of linhas) {
    try {
      const numero = s(r.numero || r.apolice)
      if (!numero) { stats.qtd_erros++; continue }
      const cpf = s(r.cpf_cnpj || r.cpf)
      let clienteId: string | null = null
      if (cpf) {
        const { data: c } = await supabaseAdmin.from('clientes').select('id').eq('cpf_cnpj', cpf).maybeSingle()
        clienteId = c?.id || null
      }
      if (!clienteId) {
        // Cria cliente mínimo se possível
        const nome = s(r.nome) || s(r.segurado) || s(r.cliente)
        if (nome) {
          const { data: novo } = await supabaseAdmin.from('clientes').insert({
            nome, cpf_cnpj: cpf, tipo: cpf && cpf.replace(/\D/g,'').length > 11 ? 'PJ' : 'PF',
            fonte: 'Importação Apólices'
          }).select('id').single()
          clienteId = novo?.id || null
        }
      }
      if (!clienteId) { stats.qtd_erros++; continue }

      const payload: any = {
        cliente_id: clienteId,
        numero,
        produto: s(r.produto),
        seguradora: s(r.seguradora),
        premio: n(r.premio),
        comissao_pct: n(r.comissao_pct),
        vigencia_ini: dateBR(r.vigencia_ini || r.inicio),
        vigencia_fim: dateBR(r.vigencia_fim || r.fim || r.vencimento),
        placa: s(r.placa),
      }
      const { data: existente } = await supabaseAdmin.from('apolices').select('id').eq('numero', numero).maybeSingle()
      if (existente) {
        await supabaseAdmin.from('apolices').update(payload).eq('id', existente.id)
        stats.qtd_atualizados++
      } else {
        await supabaseAdmin.from('apolices').insert(payload)
        stats.qtd_criados++
      }
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(e?.message?.slice(0, 120) || 'erro')
    }
  }
  return stats
}

async function importarTarefas(linhas: any[]) {
  const stats = { qtd_lidos: linhas.length, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  for (const r of linhas) {
    try {
      const titulo = s(r.titulo) || s(r.tarefa) || s(r.descricao)
      if (!titulo) { stats.qtd_erros++; continue }
      const payload: any = {
        titulo,
        descricao: s(r.descricao || r.obs),
        tipo: s(r.tipo) || 'tarefa',
        status: s(r.status) || 'pendente',
        prazo: dateBR(r.prazo || r.data),
      }
      await supabaseAdmin.from('tarefas').insert(payload)
      stats.qtd_criados++
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(e?.message?.slice(0, 120) || 'erro')
    }
  }
  return stats
}

export async function POST(req: NextRequest) {
  const auth = await checarAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const entidade = body.entidade as string
  const linhas: any[] = Array.isArray(body.linhas) ? body.linhas : []

  if (!entidade || linhas.length === 0) {
    return NextResponse.json({ error: 'entidade e linhas obrigatórios' }, { status: 400 })
  }

  let stats: any
  try {
    if (entidade === 'clientes')      stats = await importarClientes(linhas)
    else if (entidade === 'negocios') stats = await importarNegocios(linhas)
    else if (entidade === 'apolices') stats = await importarApolices(linhas)
    else if (entidade === 'tarefas')  stats = await importarTarefas(linhas)
    else if (entidade === 'propostas') stats = await importarNegocios(linhas) // propostas mapeiam pra negocios em fase inicial
    else if (entidade === 'comissoes') return NextResponse.json({ error: 'Use /api/comissoes/importar pra comissões' }, { status: 400 })
    else return NextResponse.json({ error: 'entidade inválida' }, { status: 400 })

    // Audit log
    await supabaseAdmin.from('importacoes_dados').insert({
      entidade,
      nome_arquivo: body.nome_arquivo || null,
      formato: body.formato || null,
      qtd_lidos: stats.qtd_lidos,
      qtd_criados: stats.qtd_criados,
      qtd_atualizados: stats.qtd_atualizados,
      qtd_erros: stats.qtd_erros,
      erros: stats.erros.slice(0, 20),
      status: stats.qtd_erros === 0 ? 'processado' : (stats.qtd_criados + stats.qtd_atualizados > 0 ? 'parcial' : 'erro'),
      user_id: auth.userId,
      concluido_em: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, stats })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
