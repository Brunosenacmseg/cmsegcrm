'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Mensagem {
  role: 'user' | 'assistant'
  content: string
}

const SUGESTOES = [
  'Quais são meus negócios em andamento?',
  'Tenho alguma tarefa atrasada?',
  'Como estou em relação às minhas metas?',
  'O que é franquia no seguro auto?',
  'Qual a diferença entre seguro de vida e previdência?',
  'Como calcular o prêmio de um seguro?',
]

export default function ChatIA() {
  const supabase = createClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [aberto, setAberto] = useState(false)
  const [userId, setUserId] = useState<string>('')
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [mostrarSugestoes, setMostrarSugestoes] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  useEffect(() => {
    if (aberto && mensagens.length === 0) {
      setMensagens([{
        role: 'assistant',
        content: 'Olá! Sou o assistente da CM Seguros 👋\n\nPosso te ajudar com informações do seu CRM e tirar dúvidas sobre seguros. Como posso ajudar?'
      }])
    }
    if (aberto) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [aberto])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, carregando])

  async function enviar(texto?: string) {
    const msg = texto || input.trim()
    if (!msg || carregando) return

    setMostrarSugestoes(false)
    setInput('')
    const novasMensagens: Mensagem[] = [...mensagens, { role: 'user', content: msg }]
    setMensagens(novasMensagens)
    setCarregando(true)

    try {
      const res = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          mensagens: novasMensagens.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      if (data.error) {
        setMensagens(m => [...m, { role: 'assistant', content: `❌ Erro: ${data.error}` }])
      } else {
        setMensagens(m => [...m, { role: 'assistant', content: data.resposta }])
      }
    } catch (err: any) {
      setMensagens(m => [...m, { role: 'assistant', content: '❌ Erro de conexão. Tente novamente.' }])
    }

    setCarregando(false)
  }

  function limparConversa() {
    setMensagens([{
      role: 'assistant',
      content: 'Conversa reiniciada! Como posso ajudar? 😊'
    }])
    setMostrarSugestoes(true)
  }

  function formatarMensagem(texto: string) {
    return texto.split('\n').map((linha, i) => (
      <span key={i}>
        {linha.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j}>{part.slice(2, -2)}</strong>
            : part
        )}
        {i < texto.split('\n').length - 1 && <br />}
      </span>
    ))
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setAberto(!aberto)}
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 999,
          width: 56, height: 56, borderRadius: '50%',
          background: aberto ? 'rgba(10,22,40,0.95)' : 'linear-gradient(135deg, var(--gold), #e8a020)',
          border: aberto ? '2px solid var(--gold)' : 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, boxShadow: '0 4px 20px rgba(201,168,76,0.4)',
          transition: 'all 0.3s ease',
          color: aberto ? 'var(--gold)' : '#000',
        }}
        title={aberto ? 'Fechar assistente' : 'Abrir assistente IA'}
      >
        {aberto ? '✕' : '🤖'}
      </button>

      {/* Painel do chat */}
      {aberto && (
        <div style={{
          position: 'fixed', bottom: 96, right: 28, zIndex: 998,
          width: 380, height: 560, maxHeight: 'calc(100vh - 120px)',
          background: '#0a1628', border: '1px solid var(--border)',
          borderRadius: 20, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          animation: 'slideUp 0.25s ease',
          color: '#f5f5f7',
        }}>

          {/* Header */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--gold), #e8a020)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>CM Assistente</div>
              <div style={{ fontSize: 11, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', display: 'inline-block' }} />
                Online · GPT-4o mini
              </div>
            </div>
            <button onClick={limparConversa} title="Limpar conversa" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '4px 6px', borderRadius: 6 }}>🗑</button>
          </div>

          {/* Mensagens */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mensagens.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, var(--gold), #e8a020)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, marginRight: 8, alignSelf: 'flex-end' }}>🤖</div>
                )}
                <div style={{
                  maxWidth: '78%', padding: '9px 13px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? 'linear-gradient(135deg, var(--gold), #e8a020)' : 'rgba(255,255,255,0.08)',
                  color: m.role === 'user' ? '#000' : '#f5f5f7',
                  fontSize: 13, lineHeight: 1.5,
                  border: m.role === 'assistant' ? '1px solid rgba(255,255,255,0.1)' : 'none',
                }}>
                  {formatarMensagem(m.content)}
                </div>
              </div>
            ))}

            {/* Sugestões iniciais */}
            {mostrarSugestoes && mensagens.length === 1 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Sugestões:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SUGESTOES.map((s, i) => (
                    <button key={i} onClick={() => enviar(s)}
                      style={{ fontSize: 11, padding: '5px 10px', borderRadius: 14, cursor: 'pointer', border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.08)', color: 'var(--gold)', fontFamily: 'DM Sans,sans-serif', textAlign: 'left', lineHeight: 1.3 }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading */}
            {carregando && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, var(--gold), #e8a020)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🤖</div>
                <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block', animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
              placeholder="Pergunte sobre seguros ou seu CRM..."
              disabled={carregando}
              style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', borderRadius: 20, padding: '9px 14px', color: '#f5f5f7', fontSize: 13, fontFamily: 'DM Sans,sans-serif', outline: 'none' }}
            />
            <button onClick={() => enviar()} disabled={carregando || !input.trim()}
              style={{ width: 38, height: 38, borderRadius: '50%', background: input.trim() && !carregando ? 'linear-gradient(135deg, var(--gold), #e8a020)' : 'rgba(255,255,255,0.08)', border: 'none', cursor: input.trim() && !carregando ? 'pointer' : 'default', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: input.trim() ? '#000' : 'var(--text-muted)', transition: 'all 0.2s' }}>
              ➤
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes bounce { 0%,60%,100% { transform: translateY(0) } 30% { transform: translateY(-6px) } }
      `}</style>
    </>
  )
}
