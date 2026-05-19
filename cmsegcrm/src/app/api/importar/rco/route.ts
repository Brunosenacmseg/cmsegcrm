import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const BRUNO_EMAIL = 'bruno@cmseguros.com.br'
const FUNIL_NOME = 'RCO'
const ETAPA_PADRAO = 'RENOVAÇÕES À VENCER'
const EQUIPE_ADM = 'EQUIPE ADM'

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

function pegar(row: Record<string, any>, hints: string[]): any {
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

    const { data: funil } = await sa.from('funis').select('id, etapas').eq('nome', FUNIL_NOME).maybeSingle()
    if (!funil) return NextResponse.json({ error: `funil ${FUNIL_NOME} não encontrado` }, { status: 500 })
    const etapa = (funil.etapas as string[]).includes(ETAPA_PADRAO) ? ETAPA_PADRAO : (funil.etapas as string[])[0]

    const { data: bruno } = await sa.from('users').select('id').ilike('email', BRUNO_EMAIL).maybeSingle()
    if (!bruno?.id) return NextResponse.json({ error: `usuário ${BRUNO_EMAIL} não encontrado` }, { status: 500 })

    let criados = 0
    const erros: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const titulo = s(pegar(r, ['titulo','título','negócio','negocio','cliente','nome','segurado']))
      if (!titulo) { erros.push(`linha ${i + 2}: sem título/cliente`); continue }

      const payload: any = {
        titulo,
        funil_id: funil.id,
        etapa,
        vendedor_id: bruno.id,
        status: 'em_andamento',
        premio:              n(pegar(r, ['premio','prêmio','valor','valor total','valor anual'])),
        seguradora:          s(pegar(r, ['seguradora','seguradora atual'])),
        seguradora_atual:    s(pegar(r, ['seguradora atual'])),
        produto:             s(pegar(r, ['produto','ramo','tipo de seguro'])),
        cpf_cnpj:            s(pegar(r, ['cpf','cnpj','cpf/cnpj','documento'])),
        telefone_negocio:    s(pegar(r, ['telefone','celular','whatsapp','fone'])),
        email_negocio:       s(pegar(r, ['email','e-mail'])),
        placa:               s(pegar(r, ['placa'])),
        placa_veiculo:       s(pegar(r, ['placa','placa do veículo'])),
        modelo_veiculo:      s(pegar(r, ['modelo','modelo do veículo','veiculo','veículo'])),
        vencimento:          dt(pegar(r, ['vencimento','data vencimento','vigencia fim','vigência fim'])),
        vigencia_seguro_ini: dt(pegar(r, ['vigencia inicio','vigência início','inicio vigencia'])),
        vigencia_seguro_fim: dt(pegar(r, ['vigencia fim','vigência fim','fim vigencia'])),
        previsao_fechamento: dt(pegar(r, ['vencimento','data vencimento','vigencia fim','vigência fim'])),
        comissao_pct:        n(pegar(r, ['comissao','comissão','comissao %'])),
        obs:                 s(pegar(r, ['obs','observacao','observação','anotacoes','anotações','observacoes'])),
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
