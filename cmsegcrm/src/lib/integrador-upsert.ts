// Funções de criação/atualização usadas pelo Integrador.
// Centraliza a lógica de upsert para que webhook de entrada e API REST
// sigam exatamente o mesmo comportamento (encontrar cliente por CPF/email/telefone, etc.).

import { supabaseAdmin, dispararWebhooksSaida } from './integrador'

// Acha cliente por CPF/CNPJ, e-mail ou telefone (na ordem). Retorna id ou null.
export async function acharClienteExistente(input: {
  cpf_cnpj?: string | null
  email?: string | null
  telefone?: string | null
}): Promise<string | null> {
  const sa = supabaseAdmin()
  const cpf = (input.cpf_cnpj || '').replace(/\D/g, '')
  if (cpf) {
    const { data } = await sa.from('clientes').select('id').eq('cpf_cnpj', cpf).limit(1).maybeSingle()
    if (data?.id) return data.id as string
  }
  if (input.email) {
    const { data } = await sa.from('clientes').select('id').ilike('email', input.email).limit(1).maybeSingle()
    if (data?.id) return data.id as string
  }
  if (input.telefone) {
    const tel = input.telefone.replace(/\D/g, '')
    if (tel) {
      const { data } = await sa.from('clientes').select('id').eq('telefone', tel).limit(1).maybeSingle()
      if (data?.id) return data.id as string
    }
  }
  return null
}

export type ClientePayload = {
  nome?: string
  tipo?: 'PF' | 'PJ'
  cpf_cnpj?: string
  email?: string
  telefone?: string
  cep?: string
  cidade?: string
  estado?: string
  fonte?: string
  corretor_id?: string
}

export async function upsertCliente(p: ClientePayload, fonteFallback?: string) {
  const sa = supabaseAdmin()
  const cpf = (p.cpf_cnpj || '').replace(/\D/g, '') || null
  const tel = (p.telefone || '').replace(/\D/g, '') || null
  const existente = await acharClienteExistente({ cpf_cnpj: cpf, email: p.email, telefone: tel })
  if (existente) {
    const upd: any = { updated_at: new Date().toISOString() }
    if (p.nome) upd.nome = p.nome
    if (cpf) upd.cpf_cnpj = cpf
    if (p.email) upd.email = p.email
    if (tel) upd.telefone = tel
    if (p.cep) upd.cep = p.cep
    if (p.cidade) upd.cidade = p.cidade
    if (p.estado) upd.estado = p.estado
    if (p.fonte || fonteFallback) upd.fonte = p.fonte || fonteFallback
    if (p.corretor_id) upd.corretor_id = p.corretor_id
    await sa.from('clientes').update(upd).eq('id', existente)
    void dispararWebhooksSaida('cliente.atualizado', { id: existente, ...upd })
    return { id: existente, criado: false }
  }
  const ins = {
    nome: p.nome || 'Sem nome',
    tipo: p.tipo || 'PF',
    cpf_cnpj: cpf,
    email: p.email || null,
    telefone: tel,
    cep: p.cep || null,
    cidade: p.cidade || null,
    estado: p.estado || null,
    fonte: p.fonte || fonteFallback || null,
    corretor_id: p.corretor_id || null,
  }
  const { data, error } = await sa.from('clientes').insert(ins).select('id').single()
  if (error) throw new Error(error.message)
  void dispararWebhooksSaida('cliente.criado', { id: data!.id, ...ins })
  return { id: data!.id as string, criado: true }
}

export type NegocioPayload = {
  cliente: ClientePayload
  funil_id?: string
  etapa?: string
  produto?: string
  seguradora?: string
  premio?: number
  comissao_pct?: number
  placa?: string
  cpf_cnpj?: string
  cep?: string
  fonte?: string
  vencimento?: string
  obs?: string
  corretor_id?: string
  custom_fields?: Record<string, any>
}

// Cria negócio (e cliente associado se não existir). Se funil_id não for
// passado, usa o primeiro funil ordenado por `ordem`. Se etapa não for passada,
// usa a primeira etapa do funil.
export async function criarNegocio(p: NegocioPayload, defaults?: { funil_id?: string; etapa?: string; responsavel_id?: string }) {
  const sa = supabaseAdmin()
  const cli = await upsertCliente(p.cliente || {}, p.fonte)
  let funilId = p.funil_id || defaults?.funil_id || null
  let etapa = p.etapa || defaults?.etapa || null
  if (!funilId) {
    const { data: f } = await sa.from('funis').select('id, etapas').order('ordem').limit(1).maybeSingle()
    if (!f) throw new Error('Nenhum funil cadastrado')
    funilId = f.id as string
    if (!etapa) etapa = (f.etapas as string[])?.[0] || 'Novo'
  } else if (!etapa) {
    const { data: f } = await sa.from('funis').select('etapas').eq('id', funilId).maybeSingle()
    etapa = (f?.etapas as string[] | undefined)?.[0] || 'Novo'
  }
  const ins: any = {
    cliente_id: cli.id,
    funil_id: funilId,
    etapa,
    produto: p.produto || null,
    seguradora: p.seguradora || null,
    premio: typeof p.premio === 'number' ? p.premio : null,
    comissao_pct: typeof p.comissao_pct === 'number' ? p.comissao_pct : null,
    placa: p.placa || null,
    cpf_cnpj: (p.cpf_cnpj || '').replace(/\D/g, '') || null,
    cep: p.cep || null,
    fonte: p.fonte || null,
    vencimento: p.vencimento || null,
    obs: p.obs || null,
    corretor_id: p.corretor_id || defaults?.responsavel_id || null,
    custom_fields: p.custom_fields || {},
  }
  const { data, error } = await sa.from('negocios').insert(ins).select('*').single()
  if (error) throw new Error(error.message)
  void dispararWebhooksSaida('negocio.criado', data)
  return data
}

export type TarefaPayload = {
  titulo: string
  descricao?: string
  tipo?: 'tarefa' | 'ligacao' | 'email' | 'reuniao' | 'nota'
  prazo?: string
  responsavel_id?: string
  cliente_id?: string
  negocio_id?: string
}

export async function criarTarefa(p: TarefaPayload, defaults?: { responsavel_id?: string }) {
  if (!p.titulo) throw new Error('titulo obrigatório')
  const ins = {
    titulo: p.titulo,
    descricao: p.descricao || null,
    tipo: p.tipo || 'tarefa',
    status: 'pendente',
    prazo: p.prazo || null,
    responsavel_id: p.responsavel_id || defaults?.responsavel_id || null,
    cliente_id: p.cliente_id || null,
    negocio_id: p.negocio_id || null,
  }
  const { data, error } = await supabaseAdmin().from('tarefas').insert(ins).select('*').single()
  if (error) throw new Error(error.message)
  void dispararWebhooksSaida('tarefa.criada', data)
  return data
}

export type NotaPayload = {
  titulo: string
  descricao?: string
  tipo?: 'gold' | 'teal' | 'red' | 'blue' | 'gray'
  cliente_id?: string
  negocio_id?: string
  user_id?: string
}

export async function criarNota(p: NotaPayload) {
  if (!p.titulo) throw new Error('titulo obrigatório')
  if (!p.cliente_id && !p.negocio_id) throw new Error('cliente_id ou negocio_id obrigatório')
  // historico exige cliente_id; se vier só negocio_id, busca o cliente do negócio.
  let clienteId = p.cliente_id || null
  if (!clienteId && p.negocio_id) {
    const { data: n } = await supabaseAdmin().from('negocios').select('cliente_id').eq('id', p.negocio_id).maybeSingle()
    clienteId = (n?.cliente_id as string) || null
  }
  if (!clienteId) throw new Error('cliente_id não pôde ser resolvido')
  const ins = {
    cliente_id: clienteId,
    negocio_id: p.negocio_id || null,
    tipo: p.tipo || 'gray',
    titulo: p.titulo,
    descricao: p.descricao || null,
    user_id: p.user_id || null,
  }
  const { data, error } = await supabaseAdmin().from('historico').insert(ins).select('*').single()
  if (error) throw new Error(error.message)
  void dispararWebhooksSaida('nota.criada', data)
  return data
}
