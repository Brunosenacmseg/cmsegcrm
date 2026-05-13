import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

let _sa: ReturnType<typeof createClient<Database>> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

function fmtBRL(n: number | null | undefined): string {
  return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('authorization') || ''
    const token = auth.replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ error: 'não autenticado' }, { status: 401 })
    const sa = supabaseAdmin()
    const { data: u, error: errU } = await sa.auth.getUser(token)
    if (errU || !u?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })
    const userId = u.user.id

    const { mensagens } = await request.json()

    const { data: profile } = await sa.from('users').select('id,nome,role').eq('id', userId).single()
    const eAdminOuGestao = (profile as any)?.role === 'admin' || (profile as any)?.role === 'gestao'

    // ── Dados básicos do usuário ──
    const [
      { data: negociosRaw },
      { data: tarefasRaw },
      { data: metasRaw },
      { data: clientesRaw },
      { count: totalClientes },
    ] = await Promise.all([
      sa.from('negocios').select('etapa,produto,premio,clientes(nome)').eq('vendedor_id', userId).eq('status', 'em_andamento').limit(15),
      sa.from('tarefas').select('titulo,prazo,status').eq('responsavel_id', userId).eq('status', 'pendente').order('prazo', { ascending: true }).limit(5),
      sa.from('metas').select('titulo,tipo,valor_meta,valor_atual,periodo_fim').eq('user_id', userId).eq('status', 'ativa'),
      sa.from('clientes').select('nome,tipo').eq('vendedor_id', userId).order('created_at', { ascending: false }).limit(5),
      sa.from('clientes').select('*', { count: 'exact', head: true }).eq('vendedor_id', userId),
    ])

    // ── Produtividade do próprio usuário ──
    const trintaDias = new Date(Date.now() - 30*24*60*60*1000).toISOString()
    const noventaDias = new Date(Date.now() - 90*24*60*60*1000).toISOString()
    const [
      { count: meusEmAndamento },
      { count: meusGanhos30d },
      { count: meusPerdidos30d },
      { data: meusGanhosValor30d },
    ] = await Promise.all([
      sa.from('negocios').select('*', { count: 'exact', head: true }).eq('vendedor_id', userId).eq('status', 'em_andamento'),
      sa.from('negocios').select('*', { count: 'exact', head: true }).eq('vendedor_id', userId).eq('status', 'ganho').gte('data_fechamento', trintaDias),
      sa.from('negocios').select('*', { count: 'exact', head: true }).eq('vendedor_id', userId).eq('status', 'perdido').gte('data_fechamento', trintaDias),
      sa.from('negocios').select('premio').eq('vendedor_id', userId).eq('status', 'ganho').gte('data_fechamento', trintaDias),
    ])
    const meuPremioGanho30d = (meusGanhosValor30d || []).reduce((s: number, n: any) => s + Number(n.premio || 0), 0)
    const meuTicketMedio30d = meusGanhos30d ? meuPremioGanho30d / meusGanhos30d : 0
    const meuConversao30d = (meusGanhos30d || 0) + (meusPerdidos30d || 0) > 0
      ? ((meusGanhos30d || 0) / ((meusGanhos30d || 0) + (meusPerdidos30d || 0)) * 100).toFixed(1)
      : '0'

    // ── Produtividade da equipe (só admin/gestao) ──
    let blocoEquipe = ''
    if (eAdminOuGestao) {
      const { data: vendedores } = await sa.from('users').select('id, nome').is('deleted_at', null)
      const vendIds = (vendedores || []).map((v: any) => v.id)
      if (vendIds.length) {
        const [
          { data: stats30d },
          { data: stats90d },
          { data: emAndamentoTodos },
        ] = await Promise.all([
          sa.from('negocios').select('vendedor_id, status, premio').in('vendedor_id', vendIds).gte('data_fechamento', trintaDias).in('status', ['ganho', 'perdido']),
          sa.from('negocios').select('vendedor_id, status, premio, data_fechamento').in('vendedor_id', vendIds).gte('data_fechamento', noventaDias).in('status', ['ganho', 'perdido']),
          sa.from('negocios').select('vendedor_id, premio').in('vendedor_id', vendIds).eq('status', 'em_andamento'),
        ])

        const porVend: Record<string, { nome: string; ganho30: number; perd30: number; pgan30: number; ganho90: number; perd90: number; pgan90: number; emAnd: number; emAndVal: number }> = {}
        for (const v of vendedores || []) porVend[(v as any).id] = { nome: (v as any).nome, ganho30: 0, perd30: 0, pgan30: 0, ganho90: 0, perd90: 0, pgan90: 0, emAnd: 0, emAndVal: 0 }
        for (const r of (stats30d || []) as any[]) {
          const x = porVend[r.vendedor_id]; if (!x) continue
          if (r.status === 'ganho') { x.ganho30++; x.pgan30 += Number(r.premio || 0) }
          else if (r.status === 'perdido') x.perd30++
        }
        for (const r of (stats90d || []) as any[]) {
          const x = porVend[r.vendedor_id]; if (!x) continue
          if (r.status === 'ganho') { x.ganho90++; x.pgan90 += Number(r.premio || 0) }
          else if (r.status === 'perdido') x.perd90++
        }
        for (const r of (emAndamentoTodos || []) as any[]) {
          const x = porVend[r.vendedor_id]; if (!x) continue
          x.emAnd++; x.emAndVal += Number(r.premio || 0)
        }
        const linhas = Object.values(porVend)
          .filter(v => v.ganho30 + v.perd30 + v.emAnd > 0)
          .sort((a, b) => b.pgan30 - a.pgan30)
          .slice(0, 30)
          .map(v => {
            const conv30 = v.ganho30 + v.perd30 > 0 ? ((v.ganho30 / (v.ganho30 + v.perd30)) * 100).toFixed(0) : '0'
            const ticket30 = v.ganho30 ? v.pgan30 / v.ganho30 : 0
            return `- ${v.nome}: 30d → ${v.ganho30}✓ / ${v.perd30}✕ (conv ${conv30}%, prêmio ${fmtBRL(v.pgan30)}, ticket ${fmtBRL(ticket30)}) | 90d → ${v.ganho90}✓ / ${v.perd90}✕ (${fmtBRL(v.pgan90)}) | em andamento: ${v.emAnd} (${fmtBRL(v.emAndVal)})`
          })
        blocoEquipe = `\n=== PRODUTIVIDADE DA EQUIPE ===\n${linhas.join('\n')}\n`
      }
    }

    // ── Tempo médio entre etapas (últimos 90d, do próprio usuário OU da empresa se admin) ──
    let blocoTempo = ''
    {
      const { data: histEtapas } = await sa
        .from('historico')
        .select('negocio_id, descricao, created_at')
        .eq('titulo', '🔄 Etapa atualizada via RD Station')
        .gte('created_at', noventaDias)
        .order('created_at', { ascending: true })
        .limit(2000)
      if (histEtapas && histEtapas.length) {
        // Por par (de → para), calcula tempo médio entre cards (de uma etapa pra próxima)
        const transicoes: Record<string, number[]> = {}
        const ultimaEtapa: Record<string, { etapa: string; ts: number }> = {}
        for (const h of histEtapas as any[]) {
          const m = String(h.descricao || '').match(/^(.+?)\s*→\s*(.+)$/)
          if (!m) continue
          const [_, de, para] = m
          const ts = new Date(h.created_at).getTime()
          const last = ultimaEtapa[h.negocio_id]
          if (last) {
            const k = `${last.etapa} → ${para}`
            const dias = (ts - last.ts) / (1000 * 60 * 60 * 24)
            if (dias >= 0 && dias < 365) (transicoes[k] = transicoes[k] || []).push(dias)
          }
          ultimaEtapa[h.negocio_id] = { etapa: para, ts }
        }
        const top = Object.entries(transicoes)
          .map(([k, v]) => ({ k, qtd: v.length, media: v.reduce((s, x) => s + x, 0) / v.length }))
          .sort((a, b) => b.qtd - a.qtd)
          .slice(0, 10)
        if (top.length) blocoTempo = `\n=== TEMPO MÉDIO ENTRE ETAPAS (90d) ===\n${top.map(t => `- ${t.k}: ${t.media.toFixed(1)} dias (n=${t.qtd})`).join('\n')}\n`
      }
    }

    const negocios = (negociosRaw || []) as any[]
    const tarefas  = (tarefasRaw  || []) as any[]
    const metas    = (metasRaw    || []) as any[]
    const clientes = (clientesRaw || []) as any[]

    const contexto = `
Você é o assistente virtual da CM Seguros, uma corretora de seguros brasileira.
Seu nome é "CM Assistente".
Seus papéis:
1. Responder sobre PRODUTIVIDADE e MÉTRICAS do CRM (ganhos, perdidos, conversão, ticket médio, tempo entre etapas, ranking de vendedores)
2. Consultar negócios, tarefas, metas, clientes
3. Tirar dúvidas técnicas sobre seguros (auto, vida, residencial, empresarial, saúde)

=== USUÁRIO LOGADO ===
Nome: ${(profile as any)?.nome} | Role: ${(profile as any)?.role}
Total de clientes próprios: ${totalClientes || 0}

=== MINHA PRODUTIVIDADE (últimos 30 dias) ===
- Em andamento agora: ${meusEmAndamento || 0}
- Ganhos: ${meusGanhos30d || 0} (prêmio ${fmtBRL(meuPremioGanho30d)})
- Perdidos: ${meusPerdidos30d || 0}
- Conversão: ${meuConversao30d}%
- Ticket médio: ${fmtBRL(meuTicketMedio30d)}
${blocoEquipe}${blocoTempo}
=== MEUS NEGÓCIOS EM ANDAMENTO (top 15) ===
${negocios.map((n: any) => `- ${(n.clientes as any)?.nome || '?'}: ${n.produto || '—'} | ${fmtBRL(n.premio)} | Etapa: ${n.etapa}`).join('\n') || 'Nenhum'}

=== MINHAS TAREFAS PENDENTES (top 5) ===
${tarefas.map((t: any) => `- ${t.titulo} | Prazo: ${t.prazo ? new Date(t.prazo).toLocaleDateString('pt-BR') : 'Sem prazo'}`).join('\n') || 'Nenhuma'}

=== MINHAS METAS ATIVAS ===
${metas.map((m: any) => {
  const pct = m.valor_meta > 0 ? ((m.valor_atual / m.valor_meta) * 100).toFixed(0) : 0
  return `- ${m.titulo}: ${pct}% (${fmtBRL(m.valor_atual)} de ${fmtBRL(m.valor_meta)}) | Vence: ${new Date(m.periodo_fim).toLocaleDateString('pt-BR')}`
}).join('\n') || 'Nenhuma'}

=== ÚLTIMOS CLIENTES CADASTRADOS ===
${clientes.map((c: any) => `- ${c.nome} (${c.tipo})`).join('\n') || 'Nenhum'}

=== INSTRUÇÕES ===
- Sempre responda em português brasileiro.
- Use os DADOS acima — eles são reais e atualizados deste exato momento.
- Quando perguntarem sobre vendedor X específico, use o bloco PRODUTIVIDADE DA EQUIPE.
- Para perguntas sobre tempo de etapa, use TEMPO MÉDIO ENTRE ETAPAS.
- Formate valores em BRL: R$ 1.234,56.
- Seja conciso e direto. Use bullet points quando listar.
- Se a pergunta exigir dado que NÃO está no contexto, diga: "Não tenho esse dado em tempo real — posso consultar o relatório completo?"
- Nunca invente números.
${eAdminOuGestao ? '' : '- O usuário NÃO é admin/gestão — só responda sobre produtividade dele mesmo, não da equipe.'}
`.trim()

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1200,
        messages: [
          { role: 'system', content: contexto },
          ...mensagens,
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('[IA] OpenAI error:', data?.error?.message || response.status)
      return NextResponse.json({ error: data.error?.message || 'Erro na API do OpenAI' }, { status: 500 })
    }

    const resposta = data.choices?.[0]?.message?.content || 'Não consegui processar sua pergunta.'
    return NextResponse.json({ resposta })

  } catch (err: any) {
    console.error('[IA] Erro:', err?.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
