'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const STORAGE_KEY = 'cm_welcome_lider_dia'

export default function BoasVindasLider({ visivel }: { visivel: boolean }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (!visivel) return
    const hoje = new Date().toISOString().slice(0, 10)
    try {
      if (localStorage.getItem(STORAGE_KEY) === hoje) return
    } catch {}
    setAberto(true)
  }, [visivel])

  function fechar() {
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString().slice(0, 10)) } catch {}
    setAberto(false)
  }

  function irParaModulo() {
    fechar()
    router.push('/dashboard/gestao-equipe')
  }

  if (!aberto) return null

  return (
    <div onClick={fechar} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14,
        width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 32,
        fontFamily: 'DM Sans, sans-serif', position: 'relative', boxShadow: 'var(--shadow-lg)',
      }}>
        <button onClick={fechar} aria-label="Fechar" style={{
          position: 'absolute', top: 14, right: 14, background: 'none', border: 'none',
          color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1,
        }}>✕</button>

        <div style={{ fontSize: 38, marginBottom: 8 }}>🧭</div>
        <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, marginBottom: 6 }}>
          Faça a avaliação da sua equipe
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 22, lineHeight: 1.55 }}>
          Como líder, você tem acesso ao módulo <strong>Gestão de Equipe</strong>, onde registra a
          avaliação diária de cada colaborador. Leva poucos minutos e ajuda a acompanhar humor,
          produtividade e pontos de atenção do time.
        </div>

        <div style={{
          background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 10,
          padding: 16, marginBottom: 22,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            color: 'var(--gold)', marginBottom: 12,
          }}>Como avaliar — passo a passo</div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.75, color: 'var(--text)' }}>
            <li>Abra <strong>🧭 Gestão de Equipe</strong> no menu lateral (seção <em>Empresa</em>).</li>
            <li>Na aba <strong>⭐ Avaliação de Hoje</strong>, encontre o colaborador pendente e clique em <strong>“Avaliar agora”</strong>.</li>
            <li>Escolha o <strong>humor</strong> do dia (😄 🙂 😐 😟 😣) e responda as perguntas em escala de <strong>1 a 5</strong>.</li>
            <li>Se quiser, preencha os opcionais: <em>destaque</em>, <em>dificuldade</em>, <em>ação para amanhã</em> e <em>comentário</em>.</li>
            <li>Clique em <strong>“Salvar avaliação”</strong>. Pronto! ✅</li>
          </ol>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={fechar} style={{
            padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif',
          }}>Lembrar amanhã</button>
          <button onClick={irParaModulo} style={{
            padding: '10px 18px', borderRadius: 8, border: '1px solid var(--gold)',
            background: 'var(--gold)', color: 'var(--navy)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          }}>Ir para Gestão de Equipe →</button>
        </div>
      </div>
    </div>
  )
}
