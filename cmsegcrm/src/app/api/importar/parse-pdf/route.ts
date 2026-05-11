// Parser do export de negociações em PDF (do antigo sistema).
//
// Formato detectado: blocos por deal, cada bloco começa com a linha
// "Nome / Empresa <valor>" e contém pares "Label / Label valor / valor"
// no padrão do export. Convertemos para o mesmo formato de "row" que o
// endpoint /api/importar/negocios-merge consome a partir de uma planilha,
// permitindo reaproveitar 100% da lógica de match/merge.
//
// Body: multipart/form-data com campo `file`.
// Resposta: { rows: [{...}], total: number }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import pdfParse from 'pdf-parse'

export const maxDuration = 300
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

let _sa: ReturnType<typeof createClient<Database>> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: u } = await supabaseAdmin().auth.getUser(token)
  if (!u?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: prof } = await supabaseAdmin().from('users').select('role').eq('id', u.user.id).single()
  if (prof?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const }
}

// Lê o valor que vem depois de um label fixo na linha. Retorna:
//   undefined → label não bate como prefixo da linha (ignorar)
//   null      → label bate, mas valor está vazio (não setar, mas marcar como "consumido")
//   string    → valor extraído (já trim)
//
// IMPORTANTE: exige que o label seja PREFIXO da linha (após trim) seguido
// por espaço ou fim. Sem isso, label curto como "CPF" matcha "CPF 2" e
// devolve "2" como valor — sobrescrevendo o CPF real numa iteração
// seguinte. Combinado com ordenação por tamanho desc resolve a
// ambiguidade.
function valorApos(linha: string, label: string): string | null | undefined {
  const t = linha.trim()
  if (!t.startsWith(label)) return undefined
  const rest = t.slice(label.length)
  if (rest.length === 0) return null
  if (rest[0] !== ' ' && rest[0] !== '\t') return undefined
  return rest.slice(1).trim() || null
}

// Quebra "<a> / <b>" em [a, b]. Também trata o caso "<a> /" (trailing /
// vazio), comum em "Nome / Empresa <nome> /" quando o card não tem empresa.
function dividirPorBarra(v: string | null): [string | null, string | null] {
  if (!v) return [null, null]
  // Remove " /" no fim (valor após barra vazio)
  const t = v.replace(/\s*\/\s*$/, '').trim()
  const i = t.indexOf(' / ')
  if (i < 0) return [t || null, null]
  const a = t.slice(0, i).trim() || null
  const b = t.slice(i + 3).trim() || null
  return [a, b]
}

// Campos personalizados conhecidos do PDF (mesma lista do export XLSX).
// Cada item é processado como "<LABEL> <valor>" dentro da seção
// "Campos Personalizados".
const CAMPOS_PERSONALIZADOS_PDF = [
  'DATA DE NASCIMENTO', 'SEGURADORA', 'VIGÊNCIA DO SEGURO', 'E-MAIL',
  'COMISSAO', 'PARTICULAR?', 'RASTREADOR', 'CPF', 'PLACA',
  'MODELO DO VEICULO', 'CPF 2', 'CEP', 'TIPO DO SEGURO', 'OPERADORA',
  'TIPO DE CNPJ', 'FUNCIONARIO CLT', 'PROFISSAO', 'POSSUI PLANO',
  'PLANO ATUAL', 'MOTIVO TROCA DE PLANO', 'CIDADE', 'MENSALIDADE ATUAL',
  'IDADE DOS BENEFICIARIOS', 'POSSUI HOSPITAL DE PREFERENCIA',
  'QUAL HOSPITAL',
]

// Labels do bloco principal. Cada um vira uma ou duas colunas (split em "/")
// no row resultante. A chave de cada coluna usa o MESMO nome do header da
// planilha XLSX — assim o /api/importar/negocios-merge consome sem mapping
// extra.
const LABELS_BLOCO: { label: string; colunas: [string] | [string, string] }[] = [
  { label: 'Nome / Empresa',                                            colunas: ['Nome', 'Empresa'] },
  { label: 'Qualificação / Etapa',                                      colunas: ['Qualificação', 'Etapa'] },
  { label: 'Data do último contato / Hora do último contato',           colunas: ['Data do último contato', 'Hora do último contato'] },
  { label: 'Motivo de Perda',                                           colunas: ['Motivo de Perda'] },
  { label: 'Data de criação / Hora de criação',                         colunas: ['Data de criação', 'Hora de criação'] },
  { label: 'Data da próxima tarefa / Hora da próxima tarefa',           colunas: ['Data da próxima tarefa', 'Hora da próxima tarefa'] },
  { label: 'Previsão de fechamento',                                    colunas: ['Previsão de fechamento'] },
  { label: 'Data de fechamento / Hora de fechamento',                   colunas: ['Data de fechamento', 'Hora de fechamento'] },
  { label: 'Responsável',                                               colunas: ['Responsável'] },
  { label: 'Fonte / Campanha',                                          colunas: ['Fonte', 'Campanha'] },
  { label: 'Valor Único / Valor Recorrente',                            colunas: ['Valor Único', 'Valor Recorrente'] },
  { label: 'Estado / Pausada',                                          colunas: ['Estado', 'Pausada'] },
  { label: 'Data do primeiro contato / Hora do primeiro contato',       colunas: ['Data do primeiro contato', 'Hora do primeiro contato'] },
  { label: 'Funil de vendas',                                           colunas: ['Funil de vendas'] },
  { label: 'Equipes do responsável',                                    colunas: ['Equipes do responsável'] },
  { label: 'Anotação do motivo de perda',                               colunas: ['Anotação do motivo de perda'] },
  { label: 'Produtos',                                                  colunas: ['Produtos'] },
]

function parseDealsPdf(texto: string): Record<string, any>[] {
  const linhas = texto.split('\n')
  // Splita em blocos: cada bloco começa quando aparece "Nome / Empresa".
  const blocos: string[][] = []
  let atual: string[] | null = null
  for (const ln of linhas) {
    if (ln.trim().startsWith('Nome / Empresa')) {
      if (atual) blocos.push(atual)
      atual = [ln]
    } else if (atual) {
      atual.push(ln)
    }
  }
  if (atual) blocos.push(atual)

  // Ordena labels por tamanho decrescente — evita que 'CPF' "consuma"
  // a linha "CPF 2" antes de 'CPF 2' ser testado.
  const labelsCustomOrdenados = [...CAMPOS_PERSONALIZADOS_PDF].sort((a, b) => b.length - a.length)

  const rows: Record<string, any>[] = []
  for (const bloco of blocos) {
    const row: Record<string, any> = {}

    // 1) Campos do bloco principal — busca linha por linha pelo label.
    for (const { label, colunas } of LABELS_BLOCO) {
      let valor: string | null = null
      for (const ln of bloco) {
        const v = valorApos(ln, label)
        if (v === undefined) continue
        valor = v // pode ser null (label sem valor) ou string
        break
      }
      if (valor === null || valor === undefined) continue
      if (colunas.length === 2) {
        const [a, b] = dividirPorBarra(valor)
        if (a !== null) row[colunas[0]] = a
        if (b !== null) row[colunas[1]] = b
      } else {
        row[colunas[0]] = valor
      }
    }

    // 2) Contatos (opcional): bloco indentado com Nome / Cargo / Email / Telefone
    const idxContatos = bloco.findIndex(l => l.trim() === 'Contatos')
    if (idxContatos >= 0) {
      for (let i = idxContatos + 1; i < bloco.length && i < idxContatos + 6; i++) {
        const ln = bloco[i]
        if (ln.trim() === 'Campos Personalizados') break
        const nomeCargo = valorApos(ln, 'Nome / Cargo')
        if (nomeCargo !== undefined) {
          if (nomeCargo) {
            const [nome, cargo] = dividirPorBarra(nomeCargo)
            if (nome && !row['Contatos']) row['Contatos'] = nome
            if (cargo && !row['Cargo']) row['Cargo'] = cargo
          }
          continue
        }
        const email = valorApos(ln, 'Email')
        if (email !== undefined) { if (email && !row['Email']) row['Email'] = email; continue }
        const tel = valorApos(ln, 'Telefone')
        if (tel !== undefined) { if (tel && !row['Telefone']) row['Telefone'] = tel; continue }
      }
    }

    // 2b) Últimas anotações (opcional): bloco multilinha entre "Últimas anotações"
    // e o próximo marcador conhecido. Junta as linhas com newline e grava em `obs`.
    const idxAnotacoes = bloco.findIndex(l => l.trim() === 'Últimas anotações')
    if (idxAnotacoes >= 0) {
      const limites = new Set(['Campos Personalizados', 'Produtos', 'Contatos'])
      const linhasNota: string[] = []
      for (let i = idxAnotacoes + 1; i < bloco.length; i++) {
        const ln = bloco[i]
        const t = ln.trim()
        if (limites.has(t)) break
        // "Produtos <valor>" também é fim — não consumimos como nota
        if (t.startsWith('Produtos ')) break
        if (t) linhasNota.push(t)
      }
      if (linhasNota.length) {
        row['Anotações'] = linhasNota.join('\n')
      }
    }

    // 3) Campos Personalizados: cada label conhecido vira chave do row.
    const idxCustom = bloco.findIndex(l => l.trim() === 'Campos Personalizados')
    if (idxCustom >= 0) {
      for (let i = idxCustom + 1; i < bloco.length; i++) {
        const ln = bloco[i]
        for (const lbl of labelsCustomOrdenados) {
          const v = valorApos(ln, lbl)
          if (v === undefined) continue
          // Label bateu — só seta se houver valor. Em qualquer caso, dá break
          // pra não testar labels mais curtos que poderiam "consumir" a linha.
          if (v) row[lbl] = v
          break
        }
      }
    }

    // Só adiciona o row se o Nome (titulo) foi extraído — bloco sem isso é
    // ruído (cabeçalho de página, etc.)
    if (row['Nome']) rows.push(row)
  }

  return rows
}

export async function POST(req: NextRequest) {
  const aut = await checarAdmin(req)
  if (!aut.ok) return NextResponse.json({ erro: aut.erro }, { status: 401 })

  let buffer: Buffer | null = null
  const ctype = req.headers.get('content-type') || ''
  if (ctype.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ erro: 'Arquivo não enviado (campo file)' }, { status: 400 })
    }
    buffer = Buffer.from(await (file as File).arrayBuffer())
  } else {
    // fallback: { file_base64 }
    const body = await req.json().catch(() => null) as { file_base64?: string } | null
    if (!body?.file_base64) {
      return NextResponse.json({ erro: 'Envie multipart/form-data ou { file_base64 }' }, { status: 400 })
    }
    buffer = Buffer.from(body.file_base64, 'base64')
  }

  let texto = ''
  try {
    const parsed = await pdfParse(buffer)
    texto = parsed.text || ''
  } catch (e: any) {
    return NextResponse.json({ erro: 'Falha ao ler PDF: ' + (e?.message || '') }, { status: 400 })
  }
  if (!texto.trim()) {
    return NextResponse.json({ erro: 'PDF sem texto extraível' }, { status: 400 })
  }

  const rows = parseDealsPdf(texto)
  return NextResponse.json({ ok: true, total: rows.length, rows })
}
