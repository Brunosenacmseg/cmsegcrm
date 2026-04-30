import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { mensagens, user_id } = await request.json()

    const [
      { data: profile },
      { data: negociosRaw },
      { data: tarefasRaw },
      { data: metasRaw },
      { data: clientesRaw },
      { count: totalClientes },
    ] = await Promise.all([
      supabaseAdmin.from('users').select('nome,role').eq('id', user_id).single(),
      supabaseAdmin.from('negocios').select('etapa,produto,premio,clientes(nome)').eq('vendedor_id', user_id).not('etapa', 'in', '("Fechado Ganho","Fechado Perdido")').limit(10),
      supabaseAdmin.from('tarefas').select('titulo,prazo,status').eq('responsavel_id', user_id).eq('status', 'pendente').order('prazo', { ascending: true }).limit(5),
      supabaseAdmin.from('metas').select('titulo,tipo,valor_meta,valor_atual,periodo_fim').eq('user_id', user_id).eq('status', 'ativa'),
      supabaseAdmin.from('clientes').select('nome,tipo').eq('vendedor_id', user_id).order('created_at', { ascending: false }).limit(5),
      supabaseAdmin.from('clientes').select('*', { count: 'exact', head: true }).eq('vendedor_id', user_id),
    ])

    const negocios = (negociosRaw || []) as any[]
    const tarefas  = (tarefasRaw  || []) as any[]
    const metas    = (metasRaw    || []) as any[]
    const clientes = (clientesRaw || []) as any[]

    const contexto = `
Você é o assistente virtual da CM Seguros, uma corretora de seguros brasileira.
Seu nome é "CM Assistente".
Você tem dois papéis principais:
1. Auxiliar ${(profile as any)?.nome || 'o corretor'} com informações do CRM (negócios, tarefas, metas, clientes)
2. Tirar dúvidas técnicas sobre seguros (auto, vida, residencial, empresarial, saúde, etc.)

=== DADOS DO CRM ===
Usuário logado: ${(profile as any)?.nome} (${(profile as any)?.role})
Total de clientes: ${totalClientes || 0}

Negócios em andamento (${negocios.length}):
${negocios.map((n: any) => `- ${(n.clientes as any)?.nome}: ${n.produto} | Prêmio: R$ ${(n.premio || 0).toLocaleString('pt-BR')} | Etapa: ${n.etapa}`).join('\n') || 'Nenhum negócio em andamento'}

Tarefas pendentes (${tarefas.length}):
${tarefas.map((t: any) => `- ${t.titulo} | Prazo: ${t.prazo ? new Date(t.prazo).toLocaleDateString('pt-BR') : 'Sem prazo'}`).join('\n') || 'Nenhuma tarefa pendente'}

Metas ativas:
${metas.map((m: any) => {
  const pct = m.valor_meta > 0 ? ((m.valor_atual / m.valor_meta) * 100).toFixed(0) : 0
  return `- ${m.titulo}: ${pct}% (${m.valor_atual.toLocaleString('pt-BR')} de ${m.valor_meta.toLocaleString('pt-BR')}) | Vence: ${new Date(m.periodo_fim).toLocaleDateString('pt-BR')}`
}).join('\n') || 'Nenhuma meta ativa'}

Últimos clientes cadastrados:
${clientes.map((c: any) => `- ${c.nome} (${c.tipo})`).join('\n') || 'Nenhum cliente'}

=== INSTRUÇÕES ===
- Responda sempre em português brasileiro
- Seja objetivo e direto
- Para dúvidas sobre seguros, use linguagem acessível e explique termos técnicos
- Quando falar de valores, use formato brasileiro (R$ 1.000,00)
- Se não souber algo específico do negócio, diga que vai precisar verificar
- Nunca invente dados que não estão no contexto acima
- Para perguntas fora do contexto de seguros ou CRM, redirecione gentilmente
`.trim()

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 800,
        messages: [
          { role: 'system', content: contexto },
          ...mensagens,
        ],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[IA] OpenAI error:', data)
      return NextResponse.json({ error: data.error?.message || 'Erro na API do OpenAI' }, { status: 500 })
    }

    const resposta = data.choices?.[0]?.message?.content || 'Não consegui processar sua pergunta.'
    return NextResponse.json({ resposta })

  } catch (err: any) {
    console.error('[IA] Erro:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
