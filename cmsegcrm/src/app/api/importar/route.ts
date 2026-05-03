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
  let str = String(v).trim().replace(/[R$\s%]/g, '')
  if (!str) return null
  // pt-BR ("1.234,56") vs US ("1234.56"). Sem essa heurística, "1.003.110" virava 1003110.
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else if ((str.match(/\./g) || []).length > 1) {
    str = str.replace(/\./g, '')
  } else if (/\.\d{3,}$/.test(str)) {
    str = str.replace(/\./g, '')
  }
  const num = Number(str)
  return isFinite(num) ? num : null
}
// Clampa pra caber na precisao da coluna; se estourar, devolve null em vez de quebrar o lote.
const nClamp = (v: any, max: number) => {
  const x = n(v)
  if (x === null) return null
  return Math.abs(x) > max ? null : x
}
// numeric(12,2) -> 9_999_999_999.99 ; numeric(8,2) -> 999_999.99 ; numeric(5,2) -> 999.99
const MAX_VALOR = 9_999_999_999.99
const MAX_PCT   = 999_999.99
const dateBR = (v: any) => {
  if (v === null || v === undefined || v === '') return null
  const t = String(v).trim()
  // DD/MM/YYYY → YYYY-MM-DD
  const m1 = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
  // YYYY-MM-DD já OK
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  // Serial do Excel (1900 date system) — número entre ~10000 e 80000
  if (/^\d{4,6}(\.\d+)?$/.test(t)) {
    const serial = parseFloat(t)
    if (serial > 10000 && serial < 80000) {
      // Excel epoch = 1899-12-30 (corrige bug do leap year de 1900)
      const ms = Math.round(serial) * 86400000 + Date.UTC(1899, 11, 30)
      const d = new Date(ms)
      return d.toISOString().slice(0, 10)
    }
  }
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
      const rendaNum = renda ? nClamp(renda, MAX_VALOR) : null

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

  // BULK: pré-carrega clientes (CPF) + usuarios (responsavel) + equipes
  const cpfsLote = Array.from(new Set(linhas.map(r => s(r.cpf_cnpj || r.cpf || r.CPF)).filter(Boolean))) as string[]
  const clientePorCpf: Record<string, string> = {}
  if (cpfsLote.length) {
    const { data: cls } = await supabaseAdmin.from('clientes').select('id, cpf_cnpj').in('cpf_cnpj', cpfsLote)
    for (const c of cls || []) if (c.cpf_cnpj) clientePorCpf[c.cpf_cnpj] = c.id
  }
  const { data: usuarios } = await supabaseAdmin.from('users').select('id, nome, email')
  const userPorNome:  Record<string, string> = {}
  const userPorEmail: Record<string, string> = {}
  for (const u of usuarios || []) {
    if (u.nome)  userPorNome[u.nome.toLowerCase().trim()] = u.id
    if (u.email) userPorEmail[u.email.toLowerCase().trim()] = u.id
  }
  // Aliases RD -> usuario (ex: "Bruce Cena" -> Bruno Sena)
  const { data: aliases } = await supabaseAdmin.from('user_aliases_rd').select('user_id, alias')
  const userPorAlias: Record<string, string> = {}
  for (const a of aliases || []) if (a.alias) userPorAlias[a.alias.toLowerCase().trim()] = a.user_id
  const { data: equipes } = await supabaseAdmin.from('equipes').select('id, nome')
  const equipePorNome: Record<string, string> = {}
  for (const e of equipes || []) if (e.nome) equipePorNome[e.nome.toLowerCase().trim()] = e.id

  // Helpers locais
  const parseBoolOpt = (v: any): boolean | null => {
    if (v === undefined || v === null || v === '') return null
    const t = String(v).toLowerCase().trim()
    if (/^(sim|s|yes|y|true|1|verdadeiro|on|ativo)$/.test(t)) return true
    if (/^(nao|não|no|false|0|inativo|off)$/.test(t)) return false
    return null
  }
  const combinaDataHora = (data: any, hora: any): string | null => {
    const d = dateBR(data); if (!d) return null
    const h = s(hora) || ''
    // Aceita só HH:MM ou HH:MM:SS. Se vier lixo (ex: "03/12/2025" na coluna hora),
    // ignora a hora e usa 00:00:00 — antes concatenava literal e o Postgres rejeitava.
    const m = h.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    const horaOk = m
      ? `${m[1].padStart(2,'0')}:${m[2]}:${m[3] || '00'}`
      : '00:00:00'
    return `${d}T${horaOk}`
  }
  const qualifNum = (v: any): number => {
    if (!v) return 0
    const t = String(v).trim()
    // RD usa ⭐ ou número 1-5
    const stars = (t.match(/⭐|★/g) || []).length
    if (stars > 0) return Math.min(stars, 5)
    const num = parseInt(t.replace(/\D/g,'')) || 0
    return Math.min(Math.max(num, 0), 5)
  }

  // Conjunto de campos "conhecidos" (já mapeados pra colunas).
  // Qualquer outra coluna vai pra custom_fields.
  const camposConhecidos = new Set([
    'titulo','title','nome','cliente','empresa','funil','pipeline','etapa','stage',
    'estado','status','situacao','situação','motivo_perda','motivo','razao',
    'qualificacao','qualificação','valor_unico','valor único','valor_recorrente','valor recorrente',
    'pausada','data_criacao','data de criação','hora_criacao','hora de criação',
    'data_primeiro_contato','data do primeiro contato','hora_primeiro_contato','hora do primeiro contato',
    'data_ultimo_contato','data do último contato','data do ultimo contato','hora_ultimo_contato','hora do último contato','hora do ultimo contato',
    'data_proxima_tarefa','data da próxima tarefa','data da proxima tarefa','hora_proxima_tarefa','hora da próxima tarefa','hora da proxima tarefa',
    'previsao_fechamento','previsão de fechamento','previsao de fechamento',
    'data_fechamento','data de fechamento','hora_fechamento','hora de fechamento',
    'fonte','origem','campanha','responsavel','responsável','produtos','produto','ramo',
    'equipe','equipes do responsável','equipes do responsavel','anotacao_motivo_perda','anotação do motivo de perda',
    'data_nascimento','data de nascimento','seguradora','vigencia','vigência','vigencia do seguro','vigência do seguro',
    'email','e-mail','telefone','fone','celular','whatsapp','comissao','comissao_pct',
    'particular','rastreador','cpf','cpf_cnpj','cnpj','placa','modelo','modelo do veiculo','modelo do veículo',
    'cpf_2','cpf 2','cep','tipo_seguro','tipo do seguro','operadora','tipo_cnpj','tipo de cnpj',
    'funcionario_clt','funcionário clt','funcionario clt','profissao','profissão','possui_plano','possui plano',
    'plano_atual','plano atual','motivo_troca_plano','motivo troca de plano','cidade',
    'mensalidade_atual','mensalidade atual','idade_beneficiarios','idade dos beneficiarios','idade dos beneficiários',
    'possui_hospital_preferencia','possui hospital de preferencia','possui hospital de preferência','qual_hospital','qual hospital',
    'contatos','cargo','vencimento','obs','observacoes','observações','observacao','observação',
  ])

  // Monta payloads em memória
  const novos: any[] = []
  // Coleta etapas novas por funil; ao final do lote, mescla nos arrays text[]
  // de funis.etapas pra que os cards aparecam como colunas no kanban.
  const etapasNovasPorFunil = new Map<string, Set<string>>()
  for (const r of linhas) {
    try {
      const titulo = s(r.titulo) || s(r.nome) || s(r.cliente) || s(r.empresa) || 'Negócio importado'
      const funilNome = s(r.funil) || s(r.pipeline)
      const f = funilNome ? (funis || []).find((x:any) => x.nome.toLowerCase() === funilNome.toLowerCase()) || funilDefault : funilDefault
      const etapa = s(r.etapa) || s(r.stage) || (f.etapas?.[0] || 'Novo')
      // Se a etapa veio do import e ainda nao existe nas colunas do funil, marca pra criar.
      const etapasFunil: string[] = Array.isArray(f.etapas) ? f.etapas : []
      if (etapa && !etapasFunil.some((e: string) => e.toLowerCase() === etapa.toLowerCase())) {
        if (!etapasNovasPorFunil.has(f.id)) etapasNovasPorFunil.set(f.id, new Set())
        etapasNovasPorFunil.get(f.id)!.add(etapa)
      }
      const cpf = s(r.cpf_cnpj || r.cpf || r.CPF || r.cnpj)
      const clienteId = cpf ? (clientePorCpf[cpf] || null) : null

      // Status
      const estadoRaw = (s(r.estado || r.status || r.situacao) || '').toLowerCase()
      let status: 'ganho'|'perdido'|'em_andamento' = 'em_andamento'
      let dataFech: string | null = combinaDataHora(r.data_fechamento || r['data de fechamento'], r.hora_fechamento || r['hora de fechamento'])
      if (/vend|ganh|fechad|won/.test(estadoRaw))   { status = 'ganho';   if (!dataFech) dataFech = new Date().toISOString() }
      else if (/perd|cancel|lost/.test(estadoRaw))  { status = 'perdido'; if (!dataFech) dataFech = new Date().toISOString() }

      // Responsavel: tenta alias do RD (mais especifico), depois nome, depois email
      const respRaw = s(r.responsavel || r['responsável']) || ''
      let vendedorId: string | null = null
      if (respRaw) {
        const k = respRaw.toLowerCase().trim()
        vendedorId = userPorAlias[k] || userPorNome[k] || userPorEmail[k] || null
      }

      // Equipe
      const equipeRaw = s(r.equipe || r['equipes do responsável'] || r['equipes do responsavel']) || ''
      const equipeId = equipeRaw ? equipePorNome[equipeRaw.toLowerCase()] || null : null

      // custom_fields: tudo que não casa com campo conhecido
      const customFields: Record<string, any> = {}
      for (const [k, v] of Object.entries(r)) {
        if (v === '' || v === null || v === undefined) continue
        const kn = k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim()
        if (!camposConhecidos.has(kn)) customFields[k] = v
      }

      novos.push({
        titulo,
        cliente_id: clienteId,
        funil_id: f.id,
        etapa,
        produto: s(r.produto || r.ramo) || s(r['tipo do seguro']) || s(r['tipo_seguro']),
        seguradora: s(r.seguradora),
        seguradora_atual: s(r.seguradora) || s(r['seguradora atual']),
        premio: nClamp(r.premio || r.valor || r.valor_unico || r['valor único'], MAX_VALOR),
        valor_unico: nClamp(r.valor_unico || r['valor único'], MAX_VALOR),
        valor_recorrente: nClamp(r.valor_recorrente || r['valor recorrente'] || r.mensalidade_atual || r['mensalidade atual'], MAX_VALOR),
        comissao_pct: nClamp(r.comissao_pct || r.comissao, MAX_PCT),
        comissao_valor: nClamp(r['comissao_valor'] || r['valor comissao'], MAX_VALOR),
        cpf_cnpj: cpf,
        cep: s(r.cep),
        fonte: s(r.fonte) || s(r.origem) || 'Importação CSV/XLSX',
        fonte_origem: s(r.origem),
        campanha: s(r.campanha),
        empresa: s(r.empresa),
        cargo_contato: s(r.cargo),
        vencimento: dateBR(r.vencimento || r.previsao_fechamento || r['previsão de fechamento']),
        previsao_fechamento: dateBR(r.previsao_fechamento || r['previsão de fechamento']),
        data_primeiro_contato: combinaDataHora(r.data_primeiro_contato || r['data do primeiro contato'], r.hora_primeiro_contato || r['hora do primeiro contato']),
        data_ultimo_contato:   combinaDataHora(r.data_ultimo_contato   || r['data do último contato'] || r['data do ultimo contato'], r.hora_ultimo_contato || r['hora do último contato']),
        data_proxima_tarefa:   combinaDataHora(r.data_proxima_tarefa   || r['data da próxima tarefa'] || r['data da proxima tarefa'], r.hora_proxima_tarefa || r['hora da próxima tarefa']),
        pausada: parseBoolOpt(r.pausada) ?? false,
        anotacao_motivo_perda: s(r.anotacao_motivo_perda || r['anotação do motivo de perda']),
        // Veículo
        placa_veiculo:  s(r.placa),
        modelo_veiculo: s(r.modelo || r['modelo do veículo'] || r['modelo do veiculo']),
        rastreador:     s(r.rastreador),
        // Saúde / plano
        tipo_seguro: s(r['tipo do seguro'] || r.tipo_seguro),
        operadora:   s(r.operadora),
        tipo_cnpj:   s(r['tipo de cnpj'] || r.tipo_cnpj),
        funcionario_clt: s(r['funcionario clt'] || r['funcionário clt'] || r.funcionario_clt),
        particular:        parseBoolOpt(r.particular),
        possui_plano:      parseBoolOpt(r['possui plano'] || r.possui_plano),
        plano_atual:       s(r['plano atual'] || r.plano_atual),
        motivo_troca_plano: s(r['motivo troca de plano'] || r.motivo_troca_plano),
        mensalidade_atual: nClamp(r['mensalidade atual'] || r.mensalidade_atual, MAX_VALOR),
        idade_beneficiarios: s(r['idade dos beneficiarios'] || r['idade dos beneficiários']),
        possui_hospital_pref: parseBoolOpt(r['possui hospital de preferencia'] || r['possui hospital de preferência']),
        qual_hospital: s(r['qual hospital']),
        // Outros docs
        cpf_2: s(r['cpf 2'] || r.cpf_2),
        cep_negocio: s(r.cep),
        email_negocio: s(r.email || r['e-mail'])?.toLowerCase() || null,
        // Status
        status, data_fechamento: dataFech,
        motivo_perda: status === 'perdido' ? (s(r.motivo_perda) || s(r.motivo) || null) : null,
        qualificacao: qualifNum(r.qualificacao || r['qualificação']),
        vendedor_id: vendedorId,
        equipe_id: equipeId,
        custom_fields: Object.keys(customFields).length ? customFields : null,
        obs: s(r.obs || r.observacoes || r.observacao || r['observações']),
      })
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(e?.message?.slice(0, 120) || 'erro')
    }
  }

  // INSERT batch (1 query pra todo o lote). Fallback row-by-row se falhar.
  // Mescla etapas novas nos funis afetados antes de inserir os negocios.
  for (const [funilId, etapasNovasSet] of etapasNovasPorFunil.entries()) {
    const f = (funis || []).find((x:any) => x.id === funilId)
    if (!f) continue
    const atuais: string[] = Array.isArray(f.etapas) ? f.etapas : []
    const merged = [...atuais]
    for (const e of etapasNovasSet) {
      if (!merged.some(x => x.toLowerCase() === e.toLowerCase())) merged.push(e)
    }
    await supabaseAdmin.from('funis').update({ etapas: merged }).eq('id', funilId)
    f.etapas = merged
  }

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
  // Normaliza CPF/CNPJ para casamento: a planilha pode trazer formatado
  // (033.636.658-22) e a base estar com dígitos puros (ou vice-versa).
  // Indexamos clientes por dígitos-só para resolver os dois casos.
  const onlyDigits = (v: any) => String(v ?? '').replace(/\D/g, '')
  const cpfsRaw = Array.from(new Set(linhas.map(r => s(r.cpf_cnpj || r.cpf)).filter(Boolean))) as string[]
  const cpfsDigits = Array.from(new Set(cpfsRaw.map(onlyDigits).filter(Boolean)))
  const cpfsLote = Array.from(new Set([...cpfsRaw, ...cpfsDigits]))
  const numerosLote = Array.from(new Set(linhas.map(r => s(r.numero || r.apolice)).filter(Boolean))) as string[]
  const clientePorCpf: Record<string, string> = {}
  const apolicePorNum: Record<string, string> = {}
  const negocioPorApoliceNum: Record<string, string> = {}
  if (cpfsLote.length) {
    // Busca em chunks de 500 (PostgREST limita ~1000 por filtro .in)
    for (let i = 0; i < cpfsLote.length; i += 500) {
      const chunk = cpfsLote.slice(i, i + 500)
      const { data } = await supabaseAdmin.from('clientes').select('id, cpf_cnpj').in('cpf_cnpj', chunk)
      for (const c of data || []) if (c.cpf_cnpj) {
        clientePorCpf[c.cpf_cnpj] = c.id
        clientePorCpf[onlyDigits(c.cpf_cnpj)] = c.id
      }
    }
  }
  // Pré-busca apólices existentes em chunks de 500 (PostgREST limita 1000 por request)
  if (numerosLote.length) {
    for (let i = 0; i < numerosLote.length; i += 500) {
      const chunk = numerosLote.slice(i, i + 500)
      const { data } = await supabaseAdmin.from('apolices').select('id, numero, negocio_id').in('numero', chunk)
      for (const a of data || []) if (a.numero) {
        apolicePorNum[a.numero] = a.id
        if (a.negocio_id) negocioPorApoliceNum[a.numero] = a.negocio_id
      }
    }
  }

  // Funil/etapa default para os negócios criados a partir das apólices
  // (a página de Apólices lê de public.negocios, então cada apólice
  // precisa de um negócio espelho pra aparecer na listagem).
  let funilDefaultId: string | null = null
  let etapaDefault = 'Ativo'
  {
    const { data: funil } = await supabaseAdmin.from('funis').select('id, etapas').order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (funil?.id) {
      funilDefaultId = funil.id
      const etapas = Array.isArray(funil.etapas) ? funil.etapas : []
      // Prefere uma etapa de "ganho/ativo" se existir; senão a última (geralmente fechamento)
      etapaDefault = etapas.find((e:any)=>/ativ|ganh|fech|emit/i.test(String(e))) || etapas[etapas.length-1] || etapas[0] || 'Ativo'
    }
  }

  // Pre-cria clientes que não existem (em batch). Considera tanto a
  // forma formatada quanto digits-only — se já há cliente com o mesmo
  // CPF (em qualquer formato), reaproveita.
  const novosClientes: any[] = []
  for (const r of linhas) {
    const cpf = s(r.cpf_cnpj || r.cpf)
    if (!cpf) continue
    const dig = onlyDigits(cpf)
    if (clientePorCpf[cpf] || (dig && clientePorCpf[dig])) continue
    const nome = s(r.nome) || s(r.segurado) || s(r.cliente)
    if (!nome) continue
    if (novosClientes.find(c => onlyDigits(c.cpf_cnpj) === dig)) continue
    novosClientes.push({
      nome, cpf_cnpj: dig || cpf,
      tipo: dig.length > 11 ? 'PJ' : 'PF',
      fonte: 'Importação Apólices',
    })
  }
  if (novosClientes.length) {
    // Insere em chunks de 500 pra evitar payloads enormes
    for (let i = 0; i < novosClientes.length; i += 500) {
      const chunk = novosClientes.slice(i, i + 500)
      const { data: criados, error } = await supabaseAdmin.from('clientes').insert(chunk).select('id, cpf_cnpj')
      if (error) {
        // fallback linha a linha para não perder o lote inteiro
        for (const c of chunk) {
          const { data: one } = await supabaseAdmin.from('clientes').insert(c).select('id, cpf_cnpj').single()
          if (one?.id && one.cpf_cnpj) {
            clientePorCpf[one.cpf_cnpj] = one.id
            clientePorCpf[onlyDigits(one.cpf_cnpj)] = one.id
          }
        }
      } else {
        for (const c of criados || []) if (c.cpf_cnpj) {
          clientePorCpf[c.cpf_cnpj] = c.id
          clientePorCpf[onlyDigits(c.cpf_cnpj)] = c.id
        }
      }
    }
  }

  // Mapa numero da apólice → id do negócio espelho (carregado da
  // tabela apolices na consulta acima ou criado em batch a seguir).
  const negocioPorNum: Record<string, string> = { ...negocioPorApoliceNum }

  // Monta payloads + separa novos vs updates
  const novos: any[] = []
  const updates: { id: string; payload: any }[] = []
  // Negócios a criar para apólices que ainda não têm negócio vinculado
  const negociosACriar: { numero: string; payload: any }[] = []
  for (const r of linhas) {
    try {
      const numero = s(r.numero || r.apolice)
      if (!numero) { stats.qtd_erros++; continue }
      const cpf = s(r.cpf_cnpj || r.cpf)
      const cpfKey = cpf ? (clientePorCpf[cpf] ? cpf : onlyDigits(cpf)) : ''
      const clienteId = cpfKey ? (clientePorCpf[cpfKey] || null) : null
      if (!clienteId) { stats.qtd_erros++; if (stats.erros.length < 20) stats.erros.push(`${numero}: sem cliente`); continue }

      // Prepara payload do negocio que precisa existir para a apólice
      // aparecer nas listagens (módulo Apólices e aba do cliente leem
      // de public.negocios)
      if (funilDefaultId && !negocioPorNum[numero] && !negociosACriar.find(x => x.numero === numero)) {
        const nomeCli = s(r.nome) || s(r.segurado) || s(r.cliente) || 'Apólice'
        const produtoNeg = s(r.produto) || s(r.ramo) || null
        const venc = dateBR(r.vigencia_fim || r.fim || r.vencimento)
        const premioNeg = nClamp(r.premio || r.premio_total, MAX_VALOR)
        negociosACriar.push({
          numero,
          payload: {
            titulo:        produtoNeg ? `${nomeCli} — ${produtoNeg}` : nomeCli,
            cliente_id:    clienteId,
            funil_id:      funilDefaultId,
            etapa:         etapaDefault,
            status:        'ganho',
            produto:       produtoNeg,
            seguradora:    s(r.seguradora),
            premio:        premioNeg,
            comissao_pct:  nClamp(r.comissao_pct || r.comissao, MAX_PCT),
            vencimento:    venc,
            cpf_cnpj:      cpf,
            placa:         s(r.placa),
          },
        })
      }

      const parseBool = (v: any): boolean | null => {
        if (v === undefined || v === null || v === '') return null
        const t = String(v).toLowerCase().trim()
        if (/^(sim|s|yes|y|true|1|verdadeiro|on|ativo|conferida|assinada)$/.test(t)) return true
        if (/^(nao|não|no|false|0|inativo|off|pendente)$/.test(t)) return false
        return null
      }
      const statusVal = (() => {
        const v = (s(r.status) || '').toLowerCase()
        if (/cancel/.test(v)) return 'cancelado'
        if (/renov/.test(v))  return 'renovar'
        if (/venc/.test(v))   return 'vencido'
        if (v) return 'ativo'
        return 'ativo'
      })()
      const payload: any = {
        cliente_id: clienteId,
        negocio_id: negocioPorNum[numero] || null,
        numero,
        proposta:           s(r.proposta),
        endosso:            s(r.endosso),
        proposta_endosso:   s(r.proposta_endosso),
        tipo_documento:     s(r.tipo_documento),
        // tipo_pessoa não existe na coluna; mapeia pra clientes.tipo se necessário (ignorado aqui)
        estipulante:        s(r.estipulante),
        ramo:               s(r.ramo),
        produto:            s(r.produto),
        seguradora:         s(r.seguradora),
        item:               s(r.item),
        vigencia_ini:       dateBR(r.vigencia_ini || r.inicio),
        vigencia_fim:       dateBR(r.vigencia_fim || r.fim || r.vencimento),
        emissao:            dateBR(r.emissao),
        data_controle:      dateBR(r.data_controle),
        premio:             nClamp(r.premio, MAX_VALOR),
        premio_liquido:     nClamp(r.premio_liquido, MAX_VALOR),
        comissao_pct:       nClamp(r.comissao_pct, MAX_PCT),
        repasse_vendedor_pct: nClamp(r.repasse_vendedor_pct, MAX_PCT),
        qtd_parcelas:       (() => { const x = n(r.qtd_parcelas); return x === null ? null : Math.round(x) })(),
        tipo_pagamento:     s(r.tipo_pagamento),
        banco:              s(r.banco),
        agencia:            s(r.agencia),
        conta:              s(r.conta),
        tipo_vendedores:    s(r.tipo_vendedores),
        negocio_corretora:  s(r.negocio_corretora),
        filial:             s(r.filial),
        pasta:              s(r.pasta),
        pasta_cliente:      s(r.pasta_cliente),
        apolice_conferida:  parseBool(r.apolice_conferida) ?? false,
        proposta_assinada:  parseBool(r.proposta_assinada) ?? false,
        status_assinatura:  s(r.status_assinatura),
        transmissao:        s(r.transmissao),
        placa:              s(r.placa),
        status:             statusVal,
      }
      const existId = apolicePorNum[numero]
      if (existId) updates.push({ id: existId, payload })
      else novos.push(payload)
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 20) stats.erros.push(e?.message?.slice(0, 120) || 'erro')
    }
  }

  // Cria os negócios necessários em batch (chunks de 200). Como
  // public.negocios não tem coluna `numero`, casamos pela ORDEM do
  // chunk com a ORDEM dos ids retornados — Postgres preserva a ordem
  // do INSERT...VALUES no RETURNING.
  if (negociosACriar.length) {
    for (let i = 0; i < negociosACriar.length; i += 200) {
      const chunk = negociosACriar.slice(i, i + 200)
      const { data, error } = await supabaseAdmin.from('negocios')
        .insert(chunk.map(x => x.payload)).select('id')
      if (error || !data || data.length !== chunk.length) {
        // fallback linha a linha (mantém a relação numero ↔ id)
        for (const x of chunk) {
          const { data: one, error: e2 } = await supabaseAdmin.from('negocios').insert(x.payload).select('id').single()
          if (!e2 && one?.id) negocioPorNum[x.numero] = one.id
          else if (e2 && stats.erros.length < 20) stats.erros.push(`negocio ${x.numero}: ${e2.message?.slice(0,80)}`)
        }
      } else {
        for (let j = 0; j < chunk.length; j++) negocioPorNum[chunk[j].numero] = data[j].id
      }
    }
    // Back-fill negocio_id em payloads de apolices que ficaram pendentes
    for (const p of novos) if (!p.negocio_id && p.numero) p.negocio_id = negocioPorNum[p.numero] || null
    for (const u of updates) if (!u.payload.negocio_id && u.payload.numero) u.payload.negocio_id = negocioPorNum[u.payload.numero] || null
  }

  // UPSERT por numero (idempotente — atualiza se ja existe, insere caso contrario).
  // Evita quebrar com 'apolices_numero_unique' quando o pre-fetch nao detecta tudo.
  if (novos.length) {
    const { error } = await supabaseAdmin.from('apolices').upsert(novos, { onConflict: 'numero' })
    if (error) {
      for (const p of novos) {
        const { error: e2 } = await supabaseAdmin.from('apolices').upsert(p, { onConflict: 'numero' })
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
