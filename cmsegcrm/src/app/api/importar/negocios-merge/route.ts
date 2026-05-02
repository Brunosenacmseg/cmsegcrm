// Sincronização não-destrutiva de planilha do RD Station CRM em
// public.negocios.
//
// Match: por lower(titulo) = lower(Nome).
// Estratégia: para cada negócio existente encontrado, monta um patch
// somente com as colunas em que o valor atual é null/'' (ou 0 em
// numéricos) e o valor da planilha está preenchido. custom_fields
// também é mesclado por chave — só preenche o que faltava.
// Vendedor: resolvido via função SQL public.rd_resolver_responsavel().
//
// Body: { linhas: [{ ...row }] }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const s = (v: any) => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim()
const n = (v: any) => {
  if (v === undefined || v === null || v === '') return null
  let str = String(v).trim().replace(/[R$\s%]/g, '')
  if (!str) return null
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.')
  const num = Number(str)
  return isFinite(num) ? num : null
}
const dateBR = (v: any) => {
  if (!v) return null
  const t = String(v).trim()
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return null
}
const combinaDataHora = (data: any, hora: any): string | null => {
  const d = dateBR(data); if (!d) return null
  const h = String(hora || '').trim()
  const m = h.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  return `${d}T${m ? `${m[1].padStart(2,'0')}:${m[2]}:${m[3]||'00'}` : '00:00:00'}`
}
const parseBool = (v: any): boolean | null => {
  if (v === undefined || v === null || v === '') return null
  const t = String(v).toLowerCase().trim()
  if (/^(sim|s|yes|y|true|1|verdadeiro|on|ativo)$/.test(t)) return true
  if (/^(nao|não|no|false|0|inativo|off)$/.test(t))         return false
  return null
}
const isVazio = (v: any) => v === null || v === undefined || v === '' || (typeof v === 'number' && v === 0)

// Mapeamento "nome da coluna na planilha" -> chave de custom_field (slug
// usado na migration 034_seed_campos_personalizados_cards.sql).
const CUSTOM_FIELD_MAP: Record<string,string> = {
  'DATA DE NASCIMENTO': 'data_nascimento',
  'SEGURADORA': 'seguradora',
  'VIGÊNCIA DO SEGURO': 'vigencia_seguro',
  'E-MAIL': 'email',
  'COMISSAO': 'comissao',
  'PARTICULAR?': 'particular',
  'RASTREADOR': 'rastreador',
  'CPF': 'cpf',
  'PLACA': 'placa',
  'MODELO DO VEICULO': 'modelo_veiculo',
  'CPF 2': 'cpf_2',
  'CEP': 'cep',
  'TIPO DO SEGURO': 'tipo_seguro',
  'OPERADORA': 'operadora',
  'TIPO DE CNPJ': 'tipo_cnpj',
  'FUNCIONARIO CLT': 'funcionario_clt',
  'PROFISSAO': 'profissao',
  'POSSUI PLANO': 'possui_plano',
  'PLANO ATUAL': 'plano_atual',
  'MOTIVO TROCA DE PLANO': 'motivo_troca_plano',
  'CIDADE': 'cidade',
  'MENSALIDADE ATUAL': 'mensalidade_atual',
  'IDADE DOS BENEFICIARIOS': 'idade_beneficiarios',
  'POSSUI HOSPITAL DE PREFERENCIA': 'possui_hospital_preferencia',
  'QUAL HOSPITAL': 'qual_hospital',
}

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: u } = await supabaseAdmin.auth.getUser(token)
  if (!u?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: prof } = await supabaseAdmin.from('users').select('role').eq('id', u.user.id).single()
  if (prof?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const, userId: u.user.id }
}

export async function POST(req: NextRequest) {
  const aut = await checarAdmin(req)
  if (!aut.ok) return NextResponse.json({ erro: aut.erro }, { status: 401 })

  const { linhas } = await req.json() as { linhas: any[] }
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return NextResponse.json({ erro: 'Nenhuma linha enviada' }, { status: 400 })
  }

  const stats = {
    qtd_lidos: linhas.length,
    qtd_atualizados: 0,
    qtd_sem_match: 0,
    qtd_sem_alteracao: 0,
    qtd_erros: 0,
    nomes_sem_match: [] as string[],
    erros: [] as string[],
    responsaveis_nao_resolvidos: new Set<string>(),
  }

  // 1. Pré-carrega negócios existentes (titulo lower -> [{id, ...}]).
  //    Pode haver duplicatas de título; nesse caso atualizamos todos.
  const titulos = Array.from(new Set(linhas.map(r => s(r['Nome'] ?? r.nome ?? r.titulo)?.toLowerCase()).filter(Boolean))) as string[]
  const negPorTitulo: Record<string, any[]> = {}
  if (titulos.length) {
    // Supabase aceita filtros .in() até ~1000 por vez — fatiamos
    const chunks: string[][] = []
    for (let i = 0; i < titulos.length; i += 500) chunks.push(titulos.slice(i, i+500))
    for (const ch of chunks) {
      const { data } = await supabaseAdmin
        .from('negocios')
        .select('*')
        .in('titulo', ch as any)
      // Match case-insensitive em JS pra evitar criar índice func no banco
      for (const n of data || []) {
        const k = (n.titulo || '').toLowerCase()
        if (!negPorTitulo[k]) negPorTitulo[k] = []
        negPorTitulo[k].push(n)
      }
    }
  }

  // 2. Pré-carrega aliases + users (resolve responsável em JS pra evitar
  //    chamar a função SQL linha a linha)
  const { data: aliases } = await supabaseAdmin.from('rd_responsaveis_alias').select('nome_planilha, email').eq('ativo', true)
  const { data: users }   = await supabaseAdmin.from('users').select('id, nome, email')
  const userPorEmail: Record<string,string> = {}
  const userPorNome:  Record<string,string> = {}
  for (const u of users || []) {
    if (u.email) userPorEmail[u.email.toLowerCase().trim()] = u.id
    if (u.nome)  userPorNome[u.nome.toLowerCase().trim()] = u.id
  }
  const aliasNomeParaEmail: Record<string,string> = {}
  for (const a of aliases || []) aliasNomeParaEmail[a.nome_planilha.toLowerCase().trim()] = a.email.toLowerCase()
  const fallbackId = userPorEmail['bruno@cmseguros.com.br'] || null

  function resolverResp(nome: string | null): string | null {
    if (!nome) return fallbackId
    const k = nome.toLowerCase().trim()
    const email = aliasNomeParaEmail[k]
    if (email && userPorEmail[email]) return userPorEmail[email]
    if (userPorNome[k]) return userPorNome[k]
    if (email) {
      // Alias existe mas user com aquele email não foi encontrado
      stats.responsaveis_nao_resolvidos.add(nome)
    } else {
      stats.responsaveis_nao_resolvidos.add(nome)
    }
    return fallbackId
  }

  // 3. Pré-carrega motivos de perda + equipes
  const { data: motivos } = await supabaseAdmin.from('motivos_perda').select('id, nome')
  const motivoPorNome: Record<string,string> = {}
  for (const m of motivos || []) motivoPorNome[m.nome.toLowerCase().trim()] = m.id
  const { data: equipes } = await supabaseAdmin.from('equipes').select('id, nome')
  const equipePorNome: Record<string,string> = {}
  for (const e of equipes || []) if (e.nome) equipePorNome[e.nome.toLowerCase().trim()] = e.id

  // 4. Processa linha a linha, monta patch e aplica
  for (const r of linhas) {
    try {
      const nome = s(r['Nome'] ?? r.nome ?? r.titulo)
      if (!nome) { stats.qtd_erros++; continue }
      const matches = negPorTitulo[nome.toLowerCase()] || []
      if (matches.length === 0) {
        stats.qtd_sem_match++
        if (stats.nomes_sem_match.length < 50) stats.nomes_sem_match.push(nome)
        continue
      }

      // ── valores candidatos vindos da planilha ──
      const respNome = s(r['Responsável'] ?? r.responsavel)
      const vendedorIdNovo = resolverResp(respNome)

      const estadoRaw = (s(r['Estado'] ?? r.estado) || '').toLowerCase()
      let statusNovo: 'em_andamento'|'ganho'|'perdido' | null = null
      if (/vend|ganh|won|fechad/.test(estadoRaw))   statusNovo = 'ganho'
      else if (/perd|cancel|lost/.test(estadoRaw))  statusNovo = 'perdido'
      else if (estadoRaw)                            statusNovo = 'em_andamento'

      const motivoNome = s(r['Motivo de Perda'] ?? r.motivo_perda)
      const motivoIdNovo = motivoNome ? motivoPorNome[motivoNome.toLowerCase()] || null : null
      const equipeNome = s(r['Equipes do responsável'] ?? r['Equipes do responsavel'])
      const equipeIdNovo = equipeNome ? equipePorNome[equipeNome.toLowerCase()] || null : null

      const valoresPlanilha: Record<string, any> = {
        empresa:               s(r['Empresa']),
        etapa:                 s(r['Etapa']),
        status:                statusNovo,
        motivo_perda:          s(r['Motivo de Perda']),
        motivo_perda_id:       motivoIdNovo,
        anotacao_motivo_perda: s(r['Anotação do motivo de perda']),
        valor_unico:           n(r['Valor Único']),
        valor_recorrente:      n(r['Valor Recorrente']),
        pausada:               parseBool(r['Pausada']),
        data_primeiro_contato: combinaDataHora(r['Data do primeiro contato'], r['Hora do primeiro contato']),
        data_ultimo_contato:   combinaDataHora(r['Data do último contato'],   r['Hora do último contato']),
        data_proxima_tarefa:   combinaDataHora(r['Data da próxima tarefa'],   r['Hora da próxima tarefa']),
        previsao_fechamento:   dateBR(r['Previsão de fechamento']),
        data_fechamento:       combinaDataHora(r['Data de fechamento'],       r['Hora de fechamento']),
        fonte:                 s(r['Fonte']),
        campanha:              s(r['Campanha']),
        produto:               s(r['Produtos']),
        vendedor_id:           vendedorIdNovo,
        equipe_id:             equipeIdNovo,
        cargo_contato:         s(r['Cargo']),
        email_negocio:         s(r['Email'] ?? r['E-mail'])?.toLowerCase() || null,
      }

      // Custom fields vindos da planilha
      const customNovos: Record<string, any> = {}
      for (const [colName, slug] of Object.entries(CUSTOM_FIELD_MAP)) {
        const v = s(r[colName])
        if (v !== null) customNovos[slug] = v
      }

      for (const existing of matches) {
        // Monta patch só com campos vazios no atual e preenchidos no novo
        const patch: Record<string, any> = {}
        for (const [col, novo] of Object.entries(valoresPlanilha)) {
          if (novo === null || novo === undefined) continue
          if (isVazio(existing[col])) patch[col] = novo
        }

        // custom_fields: merge não-destrutivo
        const cfAtual = (existing.custom_fields && typeof existing.custom_fields === 'object') ? existing.custom_fields : {}
        let cfMudou = false
        const cfMerged = { ...cfAtual }
        for (const [k, v] of Object.entries(customNovos)) {
          if (isVazio(cfAtual[k])) { cfMerged[k] = v; cfMudou = true }
        }
        if (cfMudou) patch.custom_fields = cfMerged

        if (Object.keys(patch).length === 0) {
          stats.qtd_sem_alteracao++
          continue
        }

        const { error } = await supabaseAdmin.from('negocios').update(patch).eq('id', existing.id)
        if (error) {
          stats.qtd_erros++
          if (stats.erros.length < 30) stats.erros.push(`${nome}: ${error.message?.slice(0,100)}`)
        } else {
          stats.qtd_atualizados++
        }
      }
    } catch (e: any) {
      stats.qtd_erros++
      if (stats.erros.length < 30) stats.erros.push(e?.message?.slice(0,120) || 'erro')
    }
  }

  return NextResponse.json({
    ok: true,
    stats: {
      ...stats,
      responsaveis_nao_resolvidos: Array.from(stats.responsaveis_nao_resolvidos),
    },
  })
}
