'use client'
// TEMP: página pra exibir o RDSTATION_CRM_TOKEN. **REMOVER APÓS USO.**
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TempLeakTokenPage() {
  const supabase = createClient()
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')
  const [resultado, setResultado] = useState<any>(null)
  const [erro, setErro] = useState<string>('')

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          setEstado('erro')
          setErro('Não está logado. Vá em /login e tente de novo.')
          return
        }
        const r = await fetch('/api/admin/temp-leak-rd-token', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const j = await r.json()
        if (!r.ok) {
          setEstado('erro')
          setErro(j?.error || `HTTP ${r.status}`)
          return
        }
        setResultado(j)
        setEstado('ok')
      } catch (e: any) {
        setEstado('erro')
        setErro(e?.message || String(e))
      }
    })()
  }, [supabase])

  function copiar(v: string) {
    navigator.clipboard.writeText(v)
    alert('Copiado!')
  }

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <h1 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, marginBottom: 8 }}>
        🔓 Recuperar RDSTATION_CRM_TOKEN
      </h1>
      <p style={{ color: 'var(--text-soft)', marginBottom: 24 }}>
        Página temporária — só admin enxerga, será removida após uso.
      </p>

      {estado === 'carregando' && <p>Carregando...</p>}

      {estado === 'erro' && (
        <div style={{ padding: 16, border: '1px solid #e05252', borderRadius: 8, color: '#e05252', background: '#fff5f5' }}>
          <strong>Erro:</strong> {erro}
        </div>
      )}

      {estado === 'ok' && resultado && (
        <div>
          <p><strong>Logado como:</strong> {resultado.user}</p>
          <h3 style={{ marginTop: 24 }}>RDSTATION_CRM_TOKEN</h3>
          {resultado.tokens?.RDSTATION_CRM_TOKEN ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{
                flex: 1, padding: 12, background: '#f4f4f4', borderRadius: 6,
                fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all',
              }}>
                {resultado.tokens.RDSTATION_CRM_TOKEN}
              </code>
              <button
                onClick={() => copiar(resultado.tokens.RDSTATION_CRM_TOKEN)}
                style={{
                  padding: '10px 16px', background: '#c9a84c', color: '#fff',
                  border: 0, borderRadius: 6, cursor: 'pointer',
                }}
              >
                Copiar
              </button>
            </div>
          ) : (
            <p style={{ color: '#e05252' }}>
              ⚠️ Variável de ambiente <code>RDSTATION_CRM_TOKEN</code> NÃO está definida na Vercel.
            </p>
          )}

          <h3 style={{ marginTop: 24 }}>RDSTATION_WEBHOOK_SECRET (mascarado)</h3>
          <code style={{ padding: 8, background: '#f4f4f4', borderRadius: 6, fontFamily: 'monospace', fontSize: 13 }}>
            {resultado.tokens?.RDSTATION_WEBHOOK_SECRET || '(não definido)'}
          </code>
        </div>
      )}
    </div>
  )
}
