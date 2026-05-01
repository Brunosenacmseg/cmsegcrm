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

  const parseBool = (v: any, def = true): boolean => {
    if (v === undefined || v === null || v === '') return def
    const t = String(v).toLowerCase().trim()
    if (/^(nao|não|no|false|0|inativo)$/.test(t)) return false
    return true
  }

  // 1. Pre-processa todas as linhas montando os payloads e coletando
  //    chaves de busca (cpf e email) — sem nenhuma chamada ao banco.
  const items: { cpf: string|null; email: string|null; payload: any; idx: number }[] = []
  for (let idx = 0; idx < linhas.length; idx++) {
    const r = linhas[idx]
    try {
      const cpf = s(r.cpf_cnpj || r.cpf || r.cnpj)
      const email = s(r.email)?.toLowerCase() || null
      const nome = s(r.nome)
      if (!nome && !cpf && !email) { stats.qtd_erros++; continue }

      const renda = r.renda_mensal || r.renda
      const rendaNum = renda ? n(renda) : null

      const payload: any = {
        nome: nome || email || cpf,
        cpf_cnpj: cpf,
        email,
        email2: s(r.email2 || r.email_2 || r['email 2'])?.toLowerCase() || null,
        email3: s(r.email3 || r.email_3 || r['email 3'])?.toLowerCase() || null,
        telefone:  s(r.telefone  || r.telefone1 || r['telefone 1'] || r.fone || r.celular),
        telefone2: s(r.telefone2 || r.telefone_2 || r['telefone 2'] || r.fone2 || r.celular2),
        telefone3: s(r.telefone3 || r.telefone_3 || r['telefone 3'] || r.fone3),
        cep: s(r.cep),
        endereco: s(r.endereco || r.logradouro || r.rua),
        numero: s(r.numero),
        complemento: s(r.complemento),
        bairro: s(r.bairro),
        cidade: s(r.cidade),
        estado: s(r.estado || r.uf),
        rg: s(r.rg),
        nascimento: dateBR(r.nascimento || r['data nascimento']),
        aniversario: s(r.aniversario),
        sexo: s(r.sexo || r.genero),
        estado_civil: s(r.estado_civil || r['estado civil']),
        profissao: s(r.profissao || r['profissão']),
        ramo: s(r.ramo),
        renda_mensal: rendaNum,
        estipulantes: s(r.estipulantes),
        filial: s(r.filial),
        parentesco: s(r.parentesco),
        pasta_cliente: s(r.pasta_cliente || r['pasta cliente']),
        vencimento_cnh: dateBR(r.vencimento_cnh || r['vencimento cnh']),
        cliente_desde: dateBR(r.cliente_desde || r['cliente desde']),
        ativo: parseBool(r.ativo, true),
        receber_email: parseBool(r.receber_email || r['receber email'], true),
        observacao: s(r.observacao || r.observacoes || r.obs),
        tipo: s(r.tipo || r['tipo de pessoa']) === 'PJ' || (cpf && cpf.replace(/\D/g,'').length > 11) ? 'PJ' : 'PF',
        fonte: s(r.fonte) || 'Importação CSV/XLSX',
      }
      items.push({ cpf, email, payload, idx })
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(`linha ${idx+1}: ${e?.message?.slice(0,100)}`)
    }
  }

  if (items.length === 0) return stats

  // 2. UMA query batch pra ver quais já existem (por CPF e por email).
  const cpfs   = Array.from(new Set(items.map(i => i.cpf  ).filter(Boolean))) as string[]
  const emails = Array.from(new Set(items.map(i => i.email).filter(Boolean))) as string[]
  const existentesPorCpf:   Record<string, string> = {}
  const existentesPorEmail: Record<string, string> = {}
  if (cpfs.length) {
    const { data } = await supabaseAdmin.from('clientes').select('id, cpf_cnpj').in('cpf_cnpj', cpfs)
    for (const c of data || []) if (c.cpf_cnpj) existentesPorCpf[c.cpf_cnpj] = c.id
  }
  if (emails.length) {
    const { data } = await supabaseAdmin.from('clientes').select('id, email').in('email', emails)
    for (const c of data || []) if (c.email) existentesPorEmail[c.email] = c.id
  }

  // 3. Separa em "novos" (insert batch) e "existentes" (update individual)
  const novos: any[] = []
  const updates: { id: string; payload: any }[] = []
  for (const it of items) {
    const existId = (it.cpf && existentesPorCpf[it.cpf]) || (it.email && existentesPorEmail[it.email]) || null
    if (existId) updates.push({ id: existId, payload: it.payload })
    else novos.push(it.payload)
  }

  // 4. Insert em batch (1 query pra centenas de linhas)
  if (novos.length) {
    const { error } = await supabaseAdmin.from('clientes').insert(novos)
    if (error) {
      // Se o batch falha por um registro ruim, faz fallback row-by-row pra
      // identificar quais linhas tem problema sem perder o resto.
      for (const p of novos) {
        const { error: e2 } = await supabaseAdmin.from('clientes').insert(p)
        if (e2) { stats.qtd_erros++; if (stats.erros.length < 20) stats.erros.push(`${p.nome}: ${e2.message?.slice(0,80)}`) }
        else stats.qtd_criados++
      }
    } else {
      stats.qtd_criados += novos.length
    }
  }

  // 5. Updates: ainda sequencial mas só pros que existem (geralmente <10)
  for (const u of updates) {
    const { error } = await supabaseAdmin.from('clientes').update(u.payload).eq('id', u.id)
    if (error) { stats.qtd_erros++; if (stats.erros.length < 20) stats.erros.push(`${u.payload.nome}: ${error.message?.slice(0,80)}`) }
    else stats.qtd_atualizados++
  }

  return stats
}

async function importarNegocios(linhas: any[]) {
  const stats = { qtd_lidos: linhas.length, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  const { data: funis } = await supabaseAdmin.from('funis').select('id, nome, etapas, tipo').order('ordem')
  const funilDefault = (funis || []).find((f:any) => f.tipo === 'venda') || funis?.[0]
  if (!funilDefault) {
    return { ...stats, qtd_erros: linhas.length, erros: ['Nenhum funil cadastrado. Crie um funil antes de importar negócios.'] }
  }

  // BULK: pré-carrega clientes por CPF/CNPJ em UMA query
  const cpfsLote = Array.from(new Set(linhas.map(r => s(r.cpf_cnpj || r.cpf)).filter(Boolean))) as string[]
  const clientePorCpf: Record<string, string> = {}
  if (cpfsLote.length) {
    const { data: cls } = await supabaseAdmin.from('clientes').select('id, cpf_cnpj').in('cpf_cnpj', cpfsLote)
    for (const c of cls || []) if (c.cpf_cnpj) clientePorCpf[c.cpf_cnpj] = c.id
  }

  // Monta payloads em memória (sem queries)
  const novos: any[] = []
  for (const r of linhas) {
    try {
      const titulo = s(r.titulo) || s(r.cliente) || s(r.nome) || 'Negócio importado'
      const funilNome = s(r.funil)
      const f = funilNome ? (funis || []).find((x:any) => x.nome.toLowerCase() === funilNome.toLowerCase()) || funilDefault : funilDefault
      const etapa = s(r.etapa) || (f.etapas?.[0] || 'Novo')
      const cpf = s(r.cpf_cnpj || r.cpf)
      const clienteId = cpf ? (clientePorCpf[cpf] || null) : null

      const estadoRaw = (s(r.estado || r.status || r.situacao) || '').toLowerCase()
      let status: 'ganho'|'perdido'|'em_andamento' = 'em_andamento'
      let dataFech: string | null = null
      if (/vend|ganh|fechad|won/.test(estadoRaw))   { status = 'ganho';   dataFech = new Date().toISOString() }
      else if (/perd|cancel|lost/.test(estadoRaw))  { status = 'perdido'; dataFech = new Date().toISOString() }

      novos.push({
        titulo, cliente_id: clienteId, funil_id: f.id, etapa,
        produto: s(r.produto), seguradora: s(r.seguradora),
        premio: n(r.premio || r.valor),
        comissao_pct: n(r.comissao_pct || r.comissao),
        cpf_cnpj: cpf, cep: s(r.cep),
        fonte: s(r.fonte) || 'Importação CSV/XLSX',
        vencimento: dateBR(r.vencimento),
        obs: s(r.obs || r.observacoes),
        status, data_fechamento: dataFech,
        motivo_perda: status === 'perdido' ? (s(r.motivo_perda) || null) : null,
      })
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(e?.message?.slice(0, 120) || 'erro')
    }
  }

  // INSERT batch (1 query pra todo o lote). Fallback row-by-row se falhar.
  if (novos.length) {
    const { error } = await supabaseAdmin.from('negocios').insert(novos)
    if (error) {
      for (const p of novos) {
        const { error: e2 } = await supabaseAdmin.from('negocios').insert(p)
        if (e2) { stats.qtd_erros++; if (stats.erros.length < 20) stats.erros.push(`${p.titulo}: ${e2.message?.slice(0,80)}`) }
        else stats.qtd_criados++
      }
    } else {
      stats.qtd_criados += novos.length
    }
  }
  return stats
}

async function importarApolices(linhas: any[]) {
  const stats = { qtd_lidos: linhas.length, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
  // BULK: pré-carrega clientes (por CPF) e apólices existentes (por número)
  const cpfsLote = Array.from(new Set(linhas.map(r => s(r.cpf_cnpj || r.cpf)).filter(Boolean))) as string[]
  const numerosLote = Array.from(new Set(linhas.map(r => s(r.numero || r.apolice)).filter(Boolean))) as string[]
  const clientePorCpf: Record<string, string> = {}
  const apolicePorNum: Record<string, string> = {}
  if (cpfsLote.length) {
    const { data } = await supabaseAdmin.from('clientes').select('id, cpf_cnpj').in('cpf_cnpj', cpfsLote)
    for (const c of data || []) if (c.cpf_cnpj) clientePorCpf[c.cpf_cnpj] = c.id
  }
  if (numerosLote.length) {
    const { data } = await supabaseAdmin.from('apolices').select('id, numero').in('numero', numerosLote)
    for (const a of data || []) if (a.numero) apolicePorNum[a.numero] = a.id
  }

  // Pre-cria clientes que não existem (em batch)
  const novosClientes: any[] = []
  for (const r of linhas) {
    const cpf = s(r.cpf_cnpj || r.cpf)
    if (cpf && !clientePorCpf[cpf]) {
      const nome = s(r.nome) || s(r.segurado) || s(r.cliente)
      if (nome && !novosClientes.find(c => c.cpf_cnpj === cpf)) {
        novosClientes.push({
          nome, cpf_cnpj: cpf,
          tipo: cpf.replace(/\D/g,'').length > 11 ? 'PJ' : 'PF',
          fonte: 'Importação Apólices',
        })
      }
    }
  }
  if (novosClientes.length) {
    const { data: criados } = await supabaseAdmin.from('clientes').insert(novosClientes).select('id, cpf_cnpj')
    for (const c of criados || []) if (c.cpf_cnpj) clientePorCpf[c.cpf_cnpj] = c.id
  }

  // Monta payloads + separa novos vs updates
  const novos: any[] = []
  const updates: { id: string; payload: any }[] = []
  for (const r of linhas) {
    try {
      const numero = s(r.numero || r.apolice)
      if (!numero) { stats.qtd_erros++; continue }
      const cpf = s(r.cpf_cnpj || r.cpf)
      const clienteId = cpf ? (clientePorCpf[cpf] || null) : null
      if (!clienteId) { stats.qtd_erros++; if (stats.erros.length < 20) stats.erros.push(`${numero}: sem cliente`); continue }

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
      const existId = apolicePorNum[numero]
      if (existId) updates.push({ id: existId, payload })
      else novos.push(payload)
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(e?.message?.slice(0, 120) || 'erro')
    }
  }

  if (novos.length) {
    const { error } = await supabaseAdmin.from('apolices').insert(novos)
    if (error) {
      for (const p of novos) {
        const { error: e2 } = await supabaseAdmin.from('apolices').insert(p)
        if (e2) { stats.qtd_erros++; if (stats.erros.length < 20) stats.erros.push(`${p.numero}: ${e2.message?.slice(0,80)}`) }
        else stats.qtd_criados++
      }
    } else {
      stats.qtd_criados += novos.length
    }
  }
  for (const u of updates) {
    const { error } = await supabaseAdmin.from('apolices').update(u.payload).eq('id', u.id)
    if (error) { stats.qtd_erros++; if (stats.erros.length < 20) stats.erros.push(`${u.payload.numero}: ${error.message?.slice(0,80)}`) }
    else stats.qtd_atualizados++
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
