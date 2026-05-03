// Cliente leve para a API da OpenAI (ChatGPT) — usa fetch direto.

interface MensagemHistorico { role: 'user' | 'assistant'; content: string }

interface ChamarChatGPTOpts {
  modelo: string
  systemPrompt: string
  mensagem: string
  historico?: MensagemHistorico[]
  maxTokens?: number
  temperatura?: number
}

export async function chamarChatGPT(opts: ChamarChatGPTOpts): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada no servidor')

  const messages: any[] = [{ role: 'system', content: opts.systemPrompt }]
  for (const m of opts.historico || []) {
    messages.push({ role: m.role, content: m.content })
  }
  messages.push({ role: 'user', content: opts.mensagem })

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.modelo,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperatura ?? 0.7,
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 200)}`)
  }

  const json = await res.json()
  const texto = (json?.choices?.[0]?.message?.content || '').trim()
  return texto || '(sem resposta)'
}
