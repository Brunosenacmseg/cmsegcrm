import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const BRUNO_EMAIL = 'bruno@cmseguros.com.br'
const FUNIL_NOME = 'RENOVAÇÕES'
const ETAPA_PADRAO = 'RENOVAÇÕES À VENCER'
const EQUIPE_ADM = 'EQUIPE ADM'

type Tipo = 'text' | 'number' | 'date'
const CAMPOS: Record<string, Tipo> = {
  titulo: 'text',
  cpf_cnpj: 'text',
  telefone_negocio: 'text',
  email_negocio: 'text',
  placa: 'text',
  modelo_veiculo: 'text',
  produto: 'text',
  seguradora: 'text',
  seguradora_atual: 'text',
  premio: 'number',
  comissao_pct: 'number',
  vencimento: 'date',
  vigencia_seguro_ini: 'date',
  vigencia_seguro_fim: 'date',
  previsao_fechamento: 'date',
  obs: 'text',
}
// Hints para fallback (compat com chamadas antigas sem mapeamento)
const HINTS: Record<string, string[]> = {
  titulo:              ['titulo','título','negócio','negocio','cliente','nome','segurado'],
  cpf_cnpj:            ['cpf','cnpj','cpf/cnpj','documento'],
  telefone_negocio:    ['telefone','celular','whatsapp','fone'],
  email_negocio:       ['email','e-mail'],
  placa:               ['placa'],
  modelo_veiculo:      ['modelo','modelo do veículo','veiculo','veículo'],
  produto:             ['produto','ramo','tipo de seguro'],
  seguradora:          ['seguradora','seguradora atual'],
  seguradora_atual:    ['seguradora atual'],
  premio:              ['premio','prêmio','valor','valor total','valor anual'],
  comissao_pct:        ['comissao','comissão','comissao %'],
  vencimento:          ['vencimento','data vencimento','vigencia fim','vigência fim'],
  vigencia_seguro_ini: ['vigencia inicio','vigência início','inicio vigencia'],
  vigencia_seguro_fim: ['vigencia fim','vigência fim','fim vigencia'],
  previsao_fechamento: ['vencimento','data vencimento','vigencia fim','vigência fim'],
  obs:                 ['obs','observacao','observação','anotacoes','anotações','observacoes'],
}
// Também grava placa_veiculo quando placa é mapeada
const ESPELHO_PLACA = true

function norm(s: string) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim() }
function s(v: any): string | null { const t = String(v ?? '').trim(); return t || null }
function n(v: any): number | null {
  if (v == null || v === '') return null
  const t = String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const num = Number(t)
  return Number.isFinite(num) ? num : null
}
function dt(v: any): string | null {
  const t = String(v ?? '').trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m) {
    const [_, d, mo, y] = m
    const ano = y.length === 2 ? '20' + y : y
    return `${ano}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  return null
}

function pegarHint(row: Record<string, any>, hints: string[]): any {
  const keys = Object.keys(row)
  for (const h of hints) {
    const k = keys.find(k => norm(k) === norm(h))
    if (k) return row[k]
  }
  for (const h of hints) {
    const k = keys.find(k => norm(k).includes(norm(h)))
    if (k) return row[k]
  }
  return null
}

// Extrai valor para um campo usando a lista de colunas mapeadas.
// Texto: concatena valores não-vazios com " | "
// Número/Data: pega o primeiro valor que parseia
function extrair(row: Record<string, any>, colunas: string[], tipo: Tipo): any {
  if (!colunas || colunas.length === 0) return null
  const valores = colunas.map(c => row[c]).filter(v => v != null && String(v).trim() !== '')
  if (!valores.length) return null
  if (tipo === 'text') {
    const txts = valores.map(v => String(v).trim()).filter(Boolean)
    return txts.length ? txts.join(' | ') : null
  }
  if (tipo === 'number') {
    for (const v of valores) { const x = n(v); if (x != null) return x }
    return null
  }
  // date
  for (const v of valores) { const x = dt(v); if (x) return x }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'sem token' }, { status: 401 })

    const sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const { data: { user }, error: eUser } = await sa.auth.getUser(token)
    if (eUser || !user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: prof } = await sa.from('users').select('id, role, email').eq('id', user.id).maybeSingle()
    let liberado = prof?.role === 'admin'
    if (!liberado) {
      const { data: eq } = await sa.from('equipes').select('id, nome').ilike('nome', EQUIPE_ADM).maybeSingle()
      if (eq?.id) {
        const lider = await sa.from('equipes').select('lider_id').eq('id', eq.id).maybeSingle()
        if (lider.data?.lider_id === user.id) liberado = true
      }
    }
    if (!liberado) return NextResponse.json({ error: 'sem permissão' }, { status: 403 })

    const body = await req.json()
    const rows: Record<string, any>[] = Array.isArray(body?.rows) ? body.rows : []
    if (!rows.length) return NextResponse.json({ error: 'planilha vazia' }, { status: 400 })

    // Mapeamento manual { campo: [coluna,...] }. Se ausente, usa hints (compat).
    const mapeamento: Record<string, string[]> | null = (body?.mapeamento && typeof body.mapeamento === 'object') ? body.mapeamento : null

    const { data: funil } = await sa.from('funis').select('id, etapas').eq('nome', FUNIL_NOME).maybeSingle()
    if (!funil) return NextResponse.json({ error: `funil ${FUNIL_NOME} não encontrado` }, { status: 500 })
    const etapa = (funil.etapas as string[]).includes(ETAPA_PADRAO) ? ETAPA_PADRAO : (funil.etapas as string[])[0]

    const { data: bruno } = await sa.from('users').select('id').ilike('email', BRUNO_EMAIL).maybeSingle()
    if (!bruno?.id) return NextResponse.json({ error: `usuário ${BRUNO_EMAIL} não encontrado` }, { status: 500 })

    function valorCampo(row: Record<string, any>, campo: string): any {
      const tipo = CAMPOS[campo]
      if (mapeamento && Array.isArray(mapeamento[campo])) {
        return extrair(row, mapeamento[campo], tipo)
      }
      const v = pegarHint(row, HINTS[campo] || [])
      if (v == null) return null
      if (tipo === 'text') return s(v)
      if (tipo === 'number') return n(v)
      return dt(v)
    }

    let criados = 0
    const erros: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const titulo = valorCampo(r, 'titulo')
      if (!titulo) { erros.push(`linha ${i + 2}: sem título/cliente`); continue }

      const payload: any = {
        titulo,
        funil_id: funil.id,
        etapa,
        vendedor_id: bruno.id,
        status: 'em_andamento',
      }
      for (const campo of Object.keys(CAMPOS)) {
        if (campo === 'titulo') continue
        const v = valorCampo(r, campo)
        if (v != null) payload[campo] = v
      }
      if (ESPELHO_PLACA && payload.placa && !payload.placa_veiculo) {
        payload.placa_veiculo = payload.placa
      }

      const { error } = await sa.from('negocios').insert(payload)
      if (error) erros.push(`linha ${i + 2}: ${error.message}`)
      else criados++
    }

    return NextResponse.json({ criados, total: rows.length, erros })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
