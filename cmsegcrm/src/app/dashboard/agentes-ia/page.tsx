'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const MODELOS = [
  { id: 'claude-opus-4-7',     nome: 'Claude Opus 4.7 — máxima qualidade' },
  { id: 'claude-sonnet-4-6',   nome: 'Claude Sonnet 4.6 — equilíbrio (recomendado)' },
  { id: 'claude-haiku-4-5-20251001', nome: 'Claude Haiku 4.5 — rápido e barato' },
]

const empty = {
  nome: '', descricao: '', modelo: 'claude-sonnet-4-6',
  system_prompt: '', temperatura: '0.7', max_tokens: '1024', ativo: true,
}

export default function AgentesIAPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [agentes, setAgentes] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [form, setForm] = useState<any>(empty)

  // Teste rápido
  const [testando, setTestando] = useState<string | null>(null)
  const [testInput, setTestInput] = useState('')
  const [testResposta, setTestResposta] = useState('')

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    if (prof?.role !== 'admin') { router.push('/dashboard'); return }
    setProfile(prof)
    await carregar()
    setLoading(false)
  }

  async function carregar() {
    const { data } = await supabase.from('ai_agentes').select('*').order('nome')
    setAgentes(data || [])
  }

  async function salvar() {
    if (!form.nome || !form.system_prompt) return
    const payload: any = {
      nome: form.nome,
      descricao: form.descricao || null,
      modelo: form.modelo,
      system_prompt: form.system_prompt,
      temperatura: parseFloat(form.temperatura) || 0.7,
      max_tokens: parseInt(form.max_tokens) || 1024,
      ativo: !!form.ativo,
      criado_por: profile?.id,
    }
    if (editando) {
      const { error } = await supabase.from('ai_agentes').update(payload).eq('id', editando.id)
      if (error) { alert('Erro: ' + error.message); return }
    } else {
      const { error } = await supabase.from('ai_agentes').insert(payload)
      if (error) { alert('Erro: ' + error.message); return }
    }
    setModal(false); setEditando(null); setForm(empty)
    await carregar()
  }

  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir o agente "${nome}"? Instâncias do WhatsApp que usam ele vão perder o vínculo.`)) return
    const { error } = await supabase.from('ai_agentes').delete().eq('id', id)
    if (error) { alert('Erro: ' + error.message); return }
    await carregar()
  }

  async function testar(agente: any) {
    if (!testInput.trim()) return
    setTestResposta('Pensando...')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/agentes-ia/testar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ agente_id: agente.id, mensagem: testInput }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erro')
      setTestResposta(json.resposta || '(sem resposta)')
    } catch (e: any) {
      setTestResposta('❌ ' + e.message)
    }
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 13px', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' as const, fontFamily:'DM Sans,sans-serif' }
  const lbl: React.CSSProperties = { fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--text-muted)', display:'block', marginBottom:5 }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)'}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>🤖 Agentes de IA</div>
        <button onClick={()=>{setEditando(null);setForm(empty);setModal(true)}} className="btn-primary" style={{padding:'7px 14px',fontSize:12}}>+ Novo agente</button>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:18,maxWidth:780}}>
          Crie agentes com prompts personalizados (Claude). Depois, no módulo WhatsApp,
          você pode ativar um agente em cada instância — o agente vai responder
          automaticamente as mensagens recebidas usando o prompt que você definir.
        </div>

        {agentes.length === 0 ? (
          <div className="card" style={{textAlign:'center',padding:'40px 20px',color:'var(--text-muted)'}}>
            <div style={{fontSize:40,marginBottom:12}}>🤖</div>
            <div style={{marginBottom:12}}>Nenhum agente criado ainda.</div>
            <button onClick={()=>{setEditando(null);setForm(empty);setModal(true)}} className="btn-primary">+ Criar primeiro agente</button>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(360px, 1fr))',gap:18}}>
            {agentes.map(a => (
              <div key={a.id} className="card" style={{display:'flex',flexDirection:'column'}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:'DM Serif Display,serif',fontSize:16}}>{a.nome}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'monospace',marginTop:2}}>{a.modelo}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:600,padding:'3px 9px',borderRadius:5,background:a.ativo?'var(--success-bg)':'rgba(255,255,255,0.04)',color:a.ativo?'var(--success)':'var(--text-muted)',border:'1px solid '+(a.ativo?'var(--success-border)':'var(--border)'),textTransform:'uppercase'}}>
                    {a.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                {a.descricao && <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>{a.descricao}</div>}
                <details style={{marginBottom:12,fontSize:12}}>
                  <summary style={{cursor:'pointer',color:'var(--gold)',fontSize:11,letterSpacing:'1px',textTransform:'uppercase',fontWeight:600}}>Ver prompt</summary>
                  <pre style={{whiteSpace:'pre-wrap',marginTop:8,padding:10,background:'rgba(0,0,0,0.3)',borderRadius:8,fontSize:11,fontFamily:'monospace',color:'var(--text-muted)',maxHeight:200,overflow:'auto'}}>{a.system_prompt}</pre>
                </details>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:10}}>
                  Temp {a.temperatura} · max {a.max_tokens} tokens
                </div>

                {testando === a.id && (
                  <div style={{padding:10,marginBottom:10,borderRadius:8,background:'rgba(28,181,160,0.06)',border:'1px solid rgba(28,181,160,0.25)'}}>
                    <div style={{fontSize:11,color:'var(--teal)',fontWeight:600,marginBottom:6}}>🧪 Teste rápido</div>
                    <textarea value={testInput} onChange={e=>setTestInput(e.target.value)} placeholder="Mensagem do cliente..." rows={2}
                      style={{...inp,resize:'none',fontSize:12,marginBottom:6}} />
                    <button onClick={()=>testar(a)} className="btn-primary" style={{padding:'5px 12px',fontSize:11,marginBottom:8}}>Enviar</button>
                    {testResposta && (
                      <div style={{padding:8,background:'rgba(0,0,0,0.3)',borderRadius:6,fontSize:12,whiteSpace:'pre-wrap',color:'var(--text)'}}>{testResposta}</div>
                    )}
                  </div>
                )}

                <div style={{display:'flex',gap:6,marginTop:'auto',flexWrap:'wrap'}}>
                  <button onClick={()=>{setTestando(testando===a.id?null:a.id);setTestInput('');setTestResposta('')}}
                    style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.08)',color:'var(--teal)',cursor:'pointer'}}>
                    🧪 {testando===a.id?'Fechar teste':'Testar'}
                  </button>
                  <button onClick={()=>{
                    setEditando(a)
                    setForm({
                      nome: a.nome, descricao: a.descricao||'', modelo: a.modelo,
                      system_prompt: a.system_prompt,
                      temperatura: String(a.temperatura), max_tokens: String(a.max_tokens),
                      ativo: a.ativo,
                    })
                    setModal(true)
                  }} style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}}>✎ Editar</button>
                  <button onClick={()=>excluir(a.id, a.nome)}
                    style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div style={{position:'fixed',inset:0,background:'rgba(5,12,26,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div style={{background:'#0a1628',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:680,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:18}}>
              {editando ? '✎ Editar agente' : '🤖 Novo agente de IA'}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Nome *</label>
                <input value={form.nome} onChange={e=>setForm((f:any)=>({...f,nome:e.target.value}))} placeholder="Ex: Atendente WhatsApp" style={inp} autoFocus />
              </div>
              <div>
                <label style={lbl}>Modelo *</label>
                <select value={form.modelo} onChange={e=>setForm((f:any)=>({...f,modelo:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                  {MODELOS.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Descrição (interna)</label>
              <input value={form.descricao} onChange={e=>setForm((f:any)=>({...f,descricao:e.target.value}))} placeholder="Para que esse agente é usado" style={inp} />
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Prompt do sistema *</label>
              <textarea value={form.system_prompt} onChange={e=>setForm((f:any)=>({...f,system_prompt:e.target.value}))} rows={10}
                placeholder="Você é uma atendente da CM.seg... Responda em português do Brasil... Sempre confirme dados antes de tomar ações."
                style={{...inp,resize:'vertical',fontFamily:'monospace',fontSize:12,lineHeight:1.5}} />
              <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4}}>
                Esse prompt define o comportamento da IA. Seja específico sobre tom, limites, e o que NÃO fazer.
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:18}}>
              <div>
                <label style={lbl}>Temperatura</label>
                <input type="number" min={0} max={1} step={0.1} value={form.temperatura} onChange={e=>setForm((f:any)=>({...f,temperatura:e.target.value}))} style={inp} />
                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4}}>0 = direto, 1 = criativo</div>
              </div>
              <div>
                <label style={lbl}>Max tokens</label>
                <input type="number" min={64} max={8192} step={64} value={form.max_tokens} onChange={e=>setForm((f:any)=>({...f,max_tokens:e.target.value}))} style={inp} />
                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4}}>~250 chars/100 tokens</div>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <label style={{display:'flex',alignItems:'center',gap:8,marginTop:8,cursor:'pointer',fontSize:13}}>
                  <input type="checkbox" checked={!!form.ativo} onChange={e=>setForm((f:any)=>({...f,ativo:e.target.checked}))} style={{accentColor:'var(--teal)'}} />
                  Ativo
                </label>
              </div>
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvar} disabled={!form.nome||!form.system_prompt}>✓ Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
