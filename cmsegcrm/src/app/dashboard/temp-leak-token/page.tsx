'use client'
// TEMP: página pra disparar sincronização RD CRM e exibir tokens. **REMOVER APÓS USO.**
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TempLeakTokenPage() {
  const supabase = createClient()
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')
  const [resultado, setResultado] = useState<any>(null)
  const [erro, setErro] = useState<string>('')

  // Sync state
  const [sincronizando, setSincronizando] = useState(false)
  const [resultadoSync, setResultadoSync] = useState<any>(null)
  const [erroSync, setErroSync] = useState<string>('')
  const [acao, setAcao] = useState<string>('negocios')
  const [janelaInicio, setJanelaInicio] = useState<string>('')
  const [janelaFim, setJanelaFim]       = useState<string>('')

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

  async function rodarSync() {
    setSincronizando(true)
    setResultadoSync(null)
    setErroSync('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Sessão expirou — faça login novamente')

      const body: any = { action: acao }
      if (janelaInicio && janelaFim) {
        body.from = `${janelaInicio}T00:00:00Z`
        body.to   = `${janelaFim}T23:59:59Z`
      }

      const r = await fetch('/api/rdstation/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      })
      // Resposta defensiva: sync grande pode estourar o timeout do Vercel
      // (504) e voltar com body vazio/HTML — `r.json()` direto explode com
      // "Unexpected end of JSON input".
      const txt = await r.text()
      let j: any = {}
      if (txt) {
        try { j = JSON.parse(txt) }
        catch { j = { error: `Resposta inválida (HTTP ${r.status}): ${txt.slice(0, 160)}` } }
      } else {
        j = { error: `Resposta vazia (HTTP ${r.status}). Provável timeout — reduza a janela de datas (1-2 meses por vez) e tente de novo.` }
      }
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      if (j?.error) throw new Error(j.error)
      setResultadoSync(j)
    } catch (e: any) {
      setErroSync(e?.message || String(e))
    } finally {
      setSincronizando(false)
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <h1 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, marginBottom: 8 }}>
        🔓 Tokens + Sincronização RD CRM
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
              <button onClick={() => copiar(resultado.tokens.RDSTATION_CRM_TOKEN)}
                style={{ padding: '10px 16px', background: '#c9a84c', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer' }}>
                Copiar
              </button>
            </div>
          ) : (
            <p style={{ color: '#e05252' }}>
              ⚠️ Variável <code>RDSTATION_CRM_TOKEN</code> NÃO definida na Vercel.
            </p>
          )}

          <hr style={{ margin: '32px 0', border: 0, borderTop: '1px solid var(--border)' }} />

          <h2 style={{ fontSize: 20, marginBottom: 12 }}>🔄 Disparar sincronização do RD</h2>
          <p style={{ color: 'var(--text-soft)', marginBottom: 16, fontSize: 14 }}>
            Roda /api/rdstation/sync com seu JWT admin. Use "negocios" pra puxar deals que faltam,
            "all" pra fazer o ciclo completo (usuários → funis → motivos → produtos → contatos → negócios → atividades).
          </p>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <label>Ação:&nbsp;
              <select value={acao} onChange={e => setAcao(e.target.value)} style={{ padding: 8, borderRadius: 4 }}>
                <option value="test">test (ping)</option>
                <option value="usuarios">usuarios</option>
                <option value="funis">funis</option>
                <option value="contatos">contatos</option>
                <option value="negocios">negocios</option>
                <option value="atividades">atividades</option>
                <option value="all">all (tudo)</option>
              </select>
            </label>
            <label>Janela início:&nbsp;
              <input type="date" value={janelaInicio} onChange={e => setJanelaInicio(e.target.value)} style={{ padding: 8, borderRadius: 4 }} />
            </label>
            <label>Janela fim:&nbsp;
              <input type="date" value={janelaFim} onChange={e => setJanelaFim(e.target.value)} style={{ padding: 8, borderRadius: 4 }} />
            </label>
            <button onClick={rodarSync} disabled={sincronizando}
              style={{ padding: '10px 18px', background: sincronizando ? '#888' : '#1cb5a0', color: '#fff', border: 0, borderRadius: 6, cursor: sincronizando ? 'wait' : 'pointer' }}>
              {sincronizando ? 'Rodando...' : 'Rodar sync'}
            </button>
          </div>

          {erroSync && (
            <div style={{ padding: 12, border: '1px solid #e05252', borderRadius: 8, color: '#e05252', background: '#fff5f5', marginTop: 12 }}>
              <strong>Erro sync:</strong> {erroSync}
            </div>
          )}
          {resultadoSync && (
            <pre style={{ marginTop: 12, padding: 12, background: '#f4f4f4', borderRadius: 6, overflow: 'auto', maxHeight: 480, fontSize: 12 }}>
              {JSON.stringify(resultadoSync, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
