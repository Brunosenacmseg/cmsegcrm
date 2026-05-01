// Cliente leve para a API da Anthropic — não precisamos do SDK aqui.
// Usa fetch direto. Prompt caching é aplicado automaticamente no
// system prompt (quase sempre é estável e grande).

interface MensagemHistorico { role: 'user' | 'assistant'; content: string }

interface ChamarClaudeOpts {
  modelo: string
  systemPrompt: string
  mensagem: string
  historico?: MensagemHistorico[]
  maxTokens?: number
  temperatura?: number
}

export async function chamarClaude(opts: ChamarClaudeOpts): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada no servidor')

  // System prompt cacheado: como ele raramente muda por agente, vale
  // muito a pena marcar como cache_control. Reduz custo e latência.
  const system = [
    {
      type: 'text',
      text: opts.systemPrompt,
      cache_control: { type: 'ephemeral' } as const,
    },
  ]

  const messages: any[] = []
  for (const m of opts.historico || []) {
    messages.push({ role: m.role, content: m.content })
  }
  messages.push({ role: 'user', content: opts.mensagem })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.modelo,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperatura ?? 0.7,
      system,
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude ${res.status}: ${err.slice(0, 200)}`)
  }

  const json = await res.json()
  const texto = (json?.content || [])
    .filter((c: any) => c?.type === 'text')
    .map((c: any) => c.text)
    .join('\n')
    .trim()
  return texto || '(sem resposta)'
}
