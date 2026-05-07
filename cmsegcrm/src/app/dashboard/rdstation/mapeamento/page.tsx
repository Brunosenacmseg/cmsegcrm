'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Página admin: mapeia campos do RD Station → colunas locais de `negocios`.
// O mapeamento é singleton (id=1) e aplicado tanto no sync admin quanto no
// webhook em tempo real.

type RegraMapeamento = { rd_path: string; local_col: string }
type Campo = { rd_path?: string; col?: string; label: string; tipo?: string }

export default function RDMapeamentoPage() {
  const supabase = createClient()
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [rdFields, setRdFields] = useState<Campo[]>([])
  const [localFields, setLocalFields] = useState<Campo[]>([])
  const [regras, setRegras] = useState<RegraMapeamento[]>([])
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)
  const [salvouOk, setSalvouOk] = useState(false)

  async function carregar() {
    setCarregando(true); setErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Sessão expirou')
      const r = await fetch('/api/rdstation/mapeamento-campos', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const txt = await r.text()
      let j: any = {}
      if (!txt) throw new Error(`Resposta vazia (HTTP ${r.status})`)
      try { j = JSON.parse(txt) }
      catch { throw new Error(`Resposta inválida (HTTP ${r.status})`) }
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setRdFields(j.rd_fields || [])
      setLocalFields(j.local_fields || [])
      setRegras(j.mapeamento || [])
      setAtualizadoEm(j.atualizado_em || null)
      if (j.rd_custom_erro) setAviso(j.rd_custom_erro)
    } catch (e: any) { setErro(e?.message || String(e)) }
    finally { setCarregando(false) }
  }

  useEffect(() => { carregar() }, [])

  function adicionar() {
    setRegras([...regras, { rd_path: '', local_col: '' }])
    setSalvouOk(false)
  }
  function atualizar(idx: number, patch: Partial<RegraMapeamento>) {
    const novas = regras.slice()
    novas[idx] = { ...novas[idx], ...patch }
    setRegras(novas)
    setSalvouOk(false)
  }
  function remover(idx: number) {
    setRegras(regras.filter((_, i) => i !== idx))
    setSalvouOk(false)
  }

  async function salvar() {
    setSalvando(true); setErro(''); setSalvouOk(false)
    try {
      const validas = regras.filter(r => r.rd_path && r.local_col)
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/rdstation/mapeamento-campos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token||''}` },
        body: JSON.stringify({ mapeamento: validas }),
      })
      const txt = await r.text()
      let j: any = {}
      try { j = txt ? JSON.parse(txt) : {} }
      catch { throw new Error(`Resposta inválida (HTTP ${r.status})`) }
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setSalvouOk(true)
      setAtualizadoEm(new Date().toISOString())
    } catch (e: any) { setErro(e?.message || String(e)) }
    finally { setSalvando(false) }
  }

  const usadas = new Set(regras.map(r => r.local_col).filter(Boolean))

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',background:'var(--bg-soft)',backdropFilter:'blur(8px)',flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>⚙ Mapeamento de campos RD → Negócios</div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'28px'}}>
        <div style={{maxWidth:980,margin:'0 auto'}}>

          <div className="card" style={{marginBottom:20}}>
            <div style={{fontSize:13,color:'var(--text-muted)',lineHeight:1.6,marginBottom:8}}>
              Configure quais campos do RD Station devem preencher cada coluna da tabela <code>negocios</code>.
              Aplica-se <strong>tanto no sync manual quanto no webhook</strong>. Campos não mapeados continuam usando o comportamento padrão (que tenta auto-detectar os principais).
            </div>
            <div style={{fontSize:12,color:'var(--text-muted)'}}>
              {atualizadoEm ? `Última atualização: ${new Date(atualizadoEm).toLocaleString('pt-BR')}` : 'Nenhum mapeamento salvo ainda.'}
            </div>
          </div>

          {aviso && (
            <div style={{marginBottom:16,padding:'10px 14px',borderRadius:8,background:'rgba(201,168,76,0.08)',border:'1px solid rgba(201,168,76,0.3)',color:'var(--gold)',fontSize:12}}>
              ⚠ {aviso}
            </div>
          )}
          {erro && (
            <div style={{marginBottom:16,padding:'10px 14px',borderRadius:8,background:'rgba(224,82,82,0.08)',border:'1px solid rgba(224,82,82,0.3)',color:'var(--red)',fontSize:12}}>
              ❌ {erro}
            </div>
          )}

          {carregando ? (
            <div className="card"><p>Carregando...</p></div>
          ) : (
            <div className="card">
              <div style={{display:'grid',gridTemplateColumns:'1fr 24px 1fr 60px',gap:10,alignItems:'center',marginBottom:10,fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:0.5}}>
                <div>Campo no RD Station</div>
                <div></div>
                <div>Coluna em Negócios</div>
                <div></div>
              </div>

              {regras.length === 0 && (
                <div style={{padding:'20px 0',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
                  Nenhuma regra. Clique em "+ Adicionar regra" abaixo.
                </div>
              )}

              {regras.map((r, idx) => (
                <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 24px 1fr 60px',gap:10,alignItems:'center',marginBottom:8}}>
                  <select value={r.rd_path} onChange={e => atualizar(idx, { rd_path: e.target.value })}
                    style={{padding:'8px 10px',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:13}}>
                    <option value="">— escolha —</option>
                    {rdFields.map(f => (
                      <option key={f.rd_path} value={f.rd_path}>{f.label}</option>
                    ))}
                  </select>
                  <div style={{textAlign:'center',color:'var(--text-muted)'}}>→</div>
                  <select value={r.local_col} onChange={e => atualizar(idx, { local_col: e.target.value })}
                    style={{padding:'8px 10px',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:13}}>
                    <option value="">— escolha —</option>
                    {localFields.map(f => {
                      const jaUsada = usadas.has(f.col!) && f.col !== r.local_col
                      return (
                        <option key={f.col} value={f.col} disabled={jaUsada}>
                          {f.label} {jaUsada ? '(já mapeada)' : ''}
                        </option>
                      )
                    })}
                  </select>
                  <button onClick={() => remover(idx)}
                    style={{padding:'8px 10px',background:'rgba(224,82,82,0.1)',border:'1px solid rgba(224,82,82,0.3)',borderRadius:6,color:'var(--red)',cursor:'pointer',fontSize:12}}>
                    Remover
                  </button>
                </div>
              ))}

              <div style={{display:'flex',gap:10,marginTop:16,paddingTop:16,borderTop:'1px solid var(--border)'}}>
                <button onClick={adicionar}
                  style={{padding:'10px 16px',background:'rgba(28,181,160,0.12)',border:'1px solid rgba(28,181,160,0.4)',borderRadius:8,color:'var(--teal)',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  + Adicionar regra
                </button>
                <button onClick={salvar} disabled={salvando}
                  style={{padding:'10px 18px',background:salvando?'#888':'var(--gold)',border:'1px solid var(--gold)',borderRadius:8,color:'#fff',cursor:salvando?'wait':'pointer',fontSize:13,fontWeight:600}}>
                  {salvando ? 'Salvando…' : 'Salvar mapeamento'}
                </button>
                {salvouOk && (
                  <span style={{alignSelf:'center',color:'var(--teal)',fontSize:12}}>✓ Salvo</span>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
