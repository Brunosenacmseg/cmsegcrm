import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

let _sa: ReturnType<typeof createClient<Database>> | null = null
function sa() {
  if (!_sa) _sa = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

// POST { negocio_id, vendedor? } — dispara o robô Suhai pra um negócio
// específico e grava no histórico, igual à ação de automação.
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { data: { user } } = await sa().auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({} as any))
  const negocioId: string = body?.negocio_id
  if (!negocioId) return NextResponse.json({ error: 'negocio_id obrigatório' }, { status: 400 })

  const { data: negocio } = await sa().from('negocios').select('*').eq('id', negocioId).maybeSingle()
  if (!negocio) return NextResponse.json({ error: 'negócio não encontrado' }, { status: 404 })

  const ROBO_URL = process.env.COTACAO_ROBO_URL || process.env.COTACAO_CONSULTA_URL || ''
  const ROBO_TOKEN = process.env.COTACAO_ROBO_TOKEN || ''
  if (!ROBO_URL) return NextResponse.json({ error: 'COTACAO_ROBO_URL não configurada' }, { status: 500 })

  const cpf = ((negocio as any).cpf_cnpj || '').replace(/\D/g, '')
  const placa = (((negocio as any).placa || (negocio as any).placa_veiculo) || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const cep = (((negocio as any).cep || (negocio as any).cep_negocio) || '').replace(/\D/g, '')
  if (!cpf || !placa) return NextResponse.json({ error: 'negócio sem CPF ou placa' }, { status: 400 })

  const headers: Record<string,string> = { 'Content-Type': 'application/json' }
  if (ROBO_TOKEN) headers['x-robo-token'] = ROBO_TOKEN

  const resp = await fetch(`${ROBO_URL.replace(/\/$/, '')}/cotacao-suhai`, {
    method: 'POST', headers,
    body: JSON.stringify({ dados: { cpf, placa, cep, vendedor: body?.vendedor || undefined } }),
  })
  const json: any = await resp.json().catch(() => ({}))
  if (!resp.ok || !json?.ok) {
    return NextResponse.json({ error: json?.erro || `robô respondeu ${resp.status}`, detalhe: json }, { status: 502 })
  }

  const coberturas: any[] = Array.isArray(json.coberturas) ? json.coberturas : []
  if ((negocio as any).cliente_id) {
    const inserts = coberturas.map((c: any) => {
      const linhasParcelas = (Array.isArray(c.parcelas) ? c.parcelas : [])
        .map((p: any) => `${p.n_parcelas}x  R$ ${p.valor_parcela}   (total R$ ${p.valor_total}, juros ${p.juros || '—'})`)
        .join('\n')
      const descricao = [
        c.premio_liquido && `Prêmio Líquido: R$ ${c.premio_liquido}`,
        c.premio_total   && `Prêmio Total:   R$ ${c.premio_total}`,
        linhasParcelas && '\nOpções de pagamento:\n' + linhasParcelas,
        c.erro && `Erro: ${c.erro}`,
      ].filter(Boolean).join('\n')
      return {
        cliente_id: (negocio as any).cliente_id,
        negocio_id: (negocio as any).id,
        tipo: 'cotacao',
        titulo: `Suhai — ${c.titulo}`,
        descricao,
        user_id: user.id,
      }
    })
    if (inserts.length) {
      await sa().from('historico').insert(inserts as any)
    }
  }

  return NextResponse.json({ ok: true, coberturas })
}
