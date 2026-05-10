'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const MODELOS = [
  { id: 'gpt-4o',      nome: 'GPT-4o — máxima qualidade' },
  { id: 'gpt-4o-mini', nome: 'GPT-4o mini — equilíbrio (recomendado)' },
  { id: 'gpt-4-turbo', nome: 'GPT-4 Turbo' },
  { id: 'gpt-3.5-turbo', nome: 'GPT-3.5 Turbo — rápido e barato' },
]

const empty = {
  nome: '', descricao: '', modelo: 'gpt-4o-mini',
  system_prompt: '', base_conhecimento: '',
  temperatura: '0.7', max_tokens: '1024', ativo: true,
}

const emptyFluxo = {
  nome: '', descricao: '',
  funil_id: '', agente_id: '',
  etapas_tentativas: ['', '', ''] as string[],
  etapa_interacao: '', etapa_perdido: '',
  horas_entre_tentativas: '4',
  horario_util_inicio: '08:30',
  horario_util_fim: '18:00',
  prompt_template:
`Mande uma mensagem curta para o lead {{nome}} (tentativa {{tentativa_n}} de {{total_tentativas}} — {{tipo_tentativa}}).
- Se for abertura: apresente-se brevemente e pergunte sobre o produto/veículo.
- Se for followup: tom gentil, sem pressão.
- Se for última tentativa: mensagem de despedida cordial.
Português BR informal mas profissional. Máx 2 frases.`,
  ativo: true,
}

type Aba = 'agentes' | 'fluxos'

export default function AgentesIAPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<Aba>('agentes')

  // Agentes
  const [agentes, setAgentes] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [form, setForm] = useState<any>(empty)
  const [abaModal, setAbaModal] = useState<'geral'|'comportamento'|'conhecimento'>('geral')

  // Teste rápido
  const [testando, setTestando] = useState<string | null>(null)
  const [testInput, setTestInput] = useState('')
  const [testResposta, setTestResposta] = useState('')

  // Fluxos SDR
  const [fluxos, setFluxos] = useState<any[]>([])
  const [funis, setFunis] = useState<any[]>([])
  const [agentesAtivos, setAgentesAtivos] = useState<any[]>([])
  const [modalFluxo, setModalFluxo] = useState(false)
  const [editandoFluxo, setEditandoFluxo] = useState<any>(null)
  const [formFluxo, setFormFluxo] = useState<any>(emptyFluxo)
  const [salvandoFluxo, setSalvandoFluxo] = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    if (prof?.role !== 'admin') { router.push('/dashboard'); return }
    setProfile(prof)
    await Promise.all([carregar(), carregarFluxos(), carregarFunis()])
    setLoading(false)
  }

  async function carregar() {
    const { data } = await supabase.from('ai_agentes').select('*').order('nome')
    setAgentes(data || [])
    setAgentesAtivos((data || []).filter((a: any) => a.ativo))
  }

  async function carregarFluxos() {
    const { data } = await supabase
      .from('sdr_fluxos')
      .select('*, funis(nome, etapas), ai_agentes(nome)')
      .order('created_at', { ascending: false })
    setFluxos(data || [])
  }

  async function carregarFunis() {
    const { data } = await supabase.from('funis').select('id, nome, etapas').order('nome')
    setFunis(data || [])
  }

  async function salvar() {
    if (!form.nome || !form.system_prompt) return
    const payload: any = {
      nome: form.nome,
      descricao: form.descricao || null,
      modelo: form.modelo,
      system_prompt: form.system_prompt,
      base_conhecimento: form.base_conhecimento || null,
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

  // ── Fluxos SDR ──────────────────────────────────────────────────
  const funilDoForm = funis.find(f => f.id === formFluxo.funil_id)
  const etapasDisponiveis: string[] = (funilDoForm?.etapas as string[] | undefined) || []

  function novoFluxo() {
    setEditandoFluxo(null)
    setFormFluxo(emptyFluxo)
    setModalFluxo(true)
  }
  function editarFluxo(f: any) {
    setEditandoFluxo(f)
    setFormFluxo({
      nome: f.nome,
      descricao: f.descricao || '',
      funil_id: f.funil_id,
      agente_id: f.agente_id,
      etapas_tentativas: Array.isArray(f.etapas_tentativas) && f.etapas_tentativas.length ? [...f.etapas_tentativas] : [''],
      etapa_interacao: f.etapa_interacao,
      etapa_perdido: f.etapa_perdido,
      horas_entre_tentativas: String(f.horas_entre_tentativas),
      horario_util_inicio: (f.horario_util_inicio || '08:30:00').slice(0,5),
      horario_util_fim: (f.horario_util_fim || '18:00:00').slice(0,5),
      prompt_template: f.prompt_template || '',
      ativo: !!f.ativo,
    })
    setModalFluxo(true)
  }

  async function salvarFluxo() {
    const tentativasLimpas = (formFluxo.etapas_tentativas as string[]).map(s => (s || '').trim()).filter(Boolean)
    if (!formFluxo.nome || !formFluxo.funil_id || !formFluxo.agente_id || !formFluxo.etapa_interacao || !formFluxo.etapa_perdido || !formFluxo.prompt_template) {
      alert('Preencha todos os campos obrigatórios.'); return
    }
    if (tentativasLimpas.length < 1) {
      alert('Configure pelo menos 1 etapa de tentativa.'); return
    }
    const horas = parseFloat(formFluxo.horas_entre_tentativas)
    if (!Number.isFinite(horas) || horas <= 0 || horas > 168) {
      alert('Horas entre tentativas deve ser um número entre 0 e 168.'); return
    }
    setSalvandoFluxo(true)
    const payload: any = {
      nome: formFluxo.nome,
      descricao: formFluxo.descricao || null,
      funil_id: formFluxo.funil_id,
      agente_id: formFluxo.agente_id,
      etapas_tentativas: tentativasLimpas,
      etapa_interacao: formFluxo.etapa_interacao,
      etapa_perdido: formFluxo.etapa_perdido,
      horas_entre_tentativas: horas,
      horario_util_inicio: formFluxo.horario_util_inicio,
      horario_util_fim: formFluxo.horario_util_fim,
      prompt_template: formFluxo.prompt_template,
      ativo: !!formFluxo.ativo,
      created_by: profile?.id,
    }
    let error: any = null
    if (editandoFluxo) {
      const r = await supabase.from('sdr_fluxos').update(payload).eq('id', editandoFluxo.id)
      error = r.error
    } else {
      const r = await supabase.from('sdr_fluxos').insert(payload)
      error = r.error
    }
    setSalvandoFluxo(false)
    if (error) { alert('Erro: ' + error.message); return }
    setModalFluxo(false); setEditandoFluxo(null); setFormFluxo(emptyFluxo)
    await carregarFluxos()
  }

  async function alternarFluxoAtivo(f: any) {
    const novo = !f.ativo
    const { error } = await supabase.from('sdr_fluxos').update({ ativo: novo }).eq('id', f.id)
    if (error) { alert('Erro: ' + error.message); return }
    await carregarFluxos()
  }

  async function excluirFluxo(f: any) {
    if (!confirm(`Excluir o fluxo "${f.nome}"? Negócios já em andamento neste fluxo continuarão até finalizar, mas novos não serão capturados.`)) return
    const { error } = await supabase.from('sdr_fluxos').delete().eq('id', f.id)
    if (error) { alert('Erro: ' + error.message); return }
    await carregarFluxos()
  }

  function setTentativa(idx: number, valor: string) {
    setFormFluxo((f: any) => {
      const arr = [...(f.etapas_tentativas as string[])]
      arr[idx] = valor
      return { ...f, etapas_tentativas: arr }
    })
  }
  function adicionarTentativa() {
    setFormFluxo((f: any) => {
      const arr = f.etapas_tentativas as string[]
      if (arr.length >= 10) return f
      return { ...f, etapas_tentativas: [...arr, ''] }
    })
  }
  function removerTentativa(idx: number) {
    setFormFluxo((f: any) => {
      const arr = (f.etapas_tentativas as string[]).filter((_, i) => i !== idx)
      return { ...f, etapas_tentativas: arr.length ? arr : [''] }
    })
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 13px', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' as const, fontFamily:'DM Sans,sans-serif' }
  const lbl: React.CSSProperties = { fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--text-muted)', display:'block', marginBottom:5 }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)'}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>🤖 Agentes de IA</div>
        {aba === 'agentes' ? (
          <button onClick={()=>{setEditando(null);setForm(empty);setAbaModal('geral');setModal(true)}} className="btn-primary" style={{padding:'7px 14px',fontSize:12}}>+ Novo agente</button>
        ) : (
          <button onClick={novoFluxo} className="btn-primary" style={{padding:'7px 14px',fontSize:12}}>+ Novo fluxo</button>
        )}
      </div>

      {/* Aba principal: Agentes vs Fluxos SDR */}
      <div style={{borderBottom:'1px solid var(--border)',display:'flex',padding:'0 28px',gap:4,background:'var(--bg-soft)'}}>
        {([
          ['agentes','🧠 Agentes', agentes.length],
          ['fluxos','🚀 Fluxos SDR', fluxos.length],
        ] as const).map(([id, label, n]) => (
          <button key={id} onClick={()=>setAba(id as Aba)}
            style={{padding:'12px 18px',fontSize:13,fontWeight:600,letterSpacing:'0.5px',border:'none',background:'transparent',cursor:'pointer',color:aba===id?'var(--gold)':'var(--text-muted)',borderBottom:'2px solid '+(aba===id?'var(--gold)':'transparent'),marginBottom:-1,display:'flex',alignItems:'center',gap:8}}>
            {label}
            <span style={{fontSize:10,padding:'2px 7px',borderRadius:10,background:aba===id?'rgba(201,168,76,0.18)':'rgba(255,255,255,0.06)',color:aba===id?'var(--gold)':'var(--text-muted)'}}>{n}</span>
          </button>
        ))}
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        {aba === 'agentes' && (
          <>
            <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:18,maxWidth:780}}>
              Crie agentes com prompts personalizados (ChatGPT). Depois, no módulo WhatsApp,
              você pode ativar um agente em cada instância — o agente vai responder
              automaticamente as mensagens recebidas usando o prompt que você definir.
            </div>

            {agentes.length === 0 ? (
              <div className="card" style={{textAlign:'center',padding:'40px 20px',color:'var(--text-muted)'}}>
                <div style={{fontSize:40,marginBottom:12}}>🤖</div>
                <div style={{marginBottom:12}}>Nenhum agente criado ainda.</div>
                <button onClick={()=>{setEditando(null);setForm(empty);setAbaModal('geral');setModal(true)}} className="btn-primary">+ Criar primeiro agente</button>
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
                          base_conhecimento: a.base_conhecimento || '',
                          temperatura: String(a.temperatura), max_tokens: String(a.max_tokens),
                          ativo: a.ativo,
                        })
                        setAbaModal('geral')
                        setModal(true)
                      }} style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}}>✎ Editar</button>
                      <button onClick={()=>excluir(a.id, a.nome)}
                        style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {aba === 'fluxos' && (
          <>
            <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:18,maxWidth:820}}>
              Cada fluxo SDR aborda automaticamente leads que entram em um funil específico.
              O cron <code style={{fontFamily:'monospace',background:'rgba(0,0,0,0.25)',padding:'1px 5px',borderRadius:4}}>/api/cron/suhai-followup</code> roda a cada minuto, manda a 1ª mensagem
              via agente IA e faz N tentativas espaçadas em horário útil. Se o cliente
              responde, o card vai pra etapa de Interação; senão, para a etapa Perdido.
            </div>

            {fluxos.length === 0 ? (
              <div className="card" style={{textAlign:'center',padding:'40px 20px',color:'var(--text-muted)'}}>
                <div style={{fontSize:40,marginBottom:12}}>🚀</div>
                <div style={{marginBottom:12}}>Nenhum fluxo SDR criado ainda.</div>
                <button onClick={novoFluxo} className="btn-primary">+ Criar primeiro fluxo</button>
              </div>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(380px, 1fr))',gap:18}}>
                {fluxos.map(f => (
                  <div key={f.id} className="card" style={{display:'flex',flexDirection:'column'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:'DM Serif Display,serif',fontSize:16}}>{f.nome}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                          📂 {f.funis?.nome || '(funil removido)'} · 🤖 {f.ai_agentes?.nome || '(agente removido)'}
                        </div>
                      </div>
                      <span style={{fontSize:10,fontWeight:600,padding:'3px 9px',borderRadius:5,background:f.ativo?'var(--success-bg)':'rgba(255,255,255,0.04)',color:f.ativo?'var(--success)':'var(--text-muted)',border:'1px solid '+(f.ativo?'var(--success-border)':'var(--border)'),textTransform:'uppercase'}}>
                        {f.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    {f.descricao && <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>{f.descricao}</div>}

                    <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:10,display:'grid',gridTemplateColumns:'1fr',gap:4}}>
                      <div><b style={{color:'var(--text)'}}>Tentativas:</b> {(f.etapas_tentativas||[]).join(' → ')}</div>
                      <div><b style={{color:'var(--text)'}}>Resposta →</b> {f.etapa_interacao}</div>
                      <div><b style={{color:'var(--text)'}}>Sem resposta →</b> {f.etapa_perdido}</div>
                      <div><b style={{color:'var(--text)'}}>Intervalo:</b> {f.horas_entre_tentativas}h úteis · {(f.horario_util_inicio||'').slice(0,5)}–{(f.horario_util_fim||'').slice(0,5)}</div>
                    </div>

                    <details style={{marginBottom:12,fontSize:12}}>
                      <summary style={{cursor:'pointer',color:'var(--gold)',fontSize:11,letterSpacing:'1px',textTransform:'uppercase',fontWeight:600}}>Ver prompt template</summary>
                      <pre style={{whiteSpace:'pre-wrap',marginTop:8,padding:10,background:'rgba(0,0,0,0.3)',borderRadius:8,fontSize:11,fontFamily:'monospace',color:'var(--text-muted)',maxHeight:200,overflow:'auto'}}>{f.prompt_template}</pre>
                    </details>

                    <div style={{display:'flex',gap:6,marginTop:'auto',flexWrap:'wrap'}}>
                      <button onClick={()=>alternarFluxoAtivo(f)}
                        style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid '+(f.ativo?'rgba(224,82,82,0.3)':'rgba(28,181,160,0.4)'),background:f.ativo?'rgba(224,82,82,0.06)':'rgba(28,181,160,0.08)',color:f.ativo?'var(--red)':'var(--teal)',cursor:'pointer'}}>
                        {f.ativo ? '⏸ Pausar' : '▶ Ativar'}
                      </button>
                      <button onClick={()=>editarFluxo(f)}
                        style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}}>✎ Editar</button>
                      <button onClick={()=>excluirFluxo(f)}
                        style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Agente */}
      {modal && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:680,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:18}}>
              {editando ? '✎ Editar agente' : '🤖 Novo agente de IA'}
            </div>

            <div style={{display:'flex',gap:4,borderBottom:'1px solid var(--border)',marginBottom:18}}>
              {([
                ['geral','Geral'],
                ['comportamento','Comportamento'],
                ['conhecimento','Base de conhecimento'],
              ] as const).map(([id,label])=>(
                <button key={id} onClick={()=>setAbaModal(id)}
                  style={{padding:'9px 16px',fontSize:12,fontWeight:600,letterSpacing:'0.5px',border:'none',background:'transparent',cursor:'pointer',color:abaModal===id?'var(--gold)':'var(--text-muted)',borderBottom:'2px solid '+(abaModal===id?'var(--gold)':'transparent'),marginBottom:-1}}>
                  {label}
                </button>
              ))}
            </div>

            {abaModal==='geral' && (<>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12,marginBottom:14}}>
                <div>
                  <label style={lbl}>Nome *</label>
                  <input value={form.nome} onChange={e=>setForm((f:any)=>({...f,nome:e.target.value}))} placeholder="Ex: Atendente WhatsApp" style={inp} autoFocus />
                </div>
                <div>
                  <label style={lbl}>Modelo *</label>
                  <select value={form.modelo} onChange={e=>setForm((f:any)=>({...f,modelo:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                    {MODELOS.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
              </div>

              <div style={{marginBottom:14}}>
                <label style={lbl}>Descrição (interna)</label>
                <input value={form.descricao} onChange={e=>setForm((f:any)=>({...f,descricao:e.target.value}))} placeholder="Para que esse agente é usado" style={inp} />
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
            </>)}

            {abaModal==='comportamento' && (
              <div style={{marginBottom:18}}>
                <label style={lbl}>Comportamento (prompt do sistema) *</label>
                <textarea value={form.system_prompt} onChange={e=>setForm((f:any)=>({...f,system_prompt:e.target.value}))} rows={16}
                  placeholder="Você é uma atendente da CM.seg... Responda em português do Brasil... Tom de voz: cordial e objetivo. Sempre confirme dados antes de tomar ações. Nunca invente preços."
                  style={{...inp,resize:'vertical',fontFamily:'monospace',fontSize:12,lineHeight:1.5}} />
                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:6}}>
                  Defina quem é o agente, tom de voz, regras, limites e o que NÃO fazer.
                </div>
              </div>
            )}

            {abaModal==='conhecimento' && (
              <div style={{marginBottom:18}}>
                <label style={lbl}>Base de conhecimento</label>
                <textarea value={form.base_conhecimento} onChange={e=>setForm((f:any)=>({...f,base_conhecimento:e.target.value}))} rows={16}
                  placeholder={'Cole aqui informações que o agente deve usar como referência:\n\n- Tabelas de produtos\n- FAQs\n- Procedimentos internos\n- Scripts de atendimento\n- Endereços, telefones, horários...'}
                  style={{...inp,resize:'vertical',fontFamily:'monospace',fontSize:12,lineHeight:1.5}} />
                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:6}}>
                  Esse texto é anexado ao prompt como contexto de consulta. Quanto mais específico, melhor.
                </div>
              </div>
            )}

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvar} disabled={!form.nome||!form.system_prompt}>✓ Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Fluxo SDR */}
      {modalFluxo && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalFluxo(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:760,maxWidth:'95vw',maxHeight:'92vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:18}}>
              {editandoFluxo ? '✎ Editar fluxo SDR' : '🚀 Novo fluxo SDR'}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Nome *</label>
                <input value={formFluxo.nome} onChange={e=>setFormFluxo((f:any)=>({...f,nome:e.target.value}))} placeholder="Ex: SUHAI SDR" style={inp} autoFocus />
              </div>
              <div>
                <label style={lbl}>Status</label>
                <label style={{display:'flex',alignItems:'center',gap:8,marginTop:8,cursor:'pointer',fontSize:13}}>
                  <input type="checkbox" checked={!!formFluxo.ativo} onChange={e=>setFormFluxo((f:any)=>({...f,ativo:e.target.checked}))} style={{accentColor:'var(--teal)'}} />
                  Ativo
                </label>
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Descrição (interna)</label>
              <input value={formFluxo.descricao} onChange={e=>setFormFluxo((f:any)=>({...f,descricao:e.target.value}))} placeholder="Para que serve esse fluxo" style={inp} />
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Funil disparador *</label>
                <select value={formFluxo.funil_id} onChange={e=>setFormFluxo((f:any)=>({...f,funil_id:e.target.value,etapas_tentativas:[''],etapa_interacao:'',etapa_perdido:''}))} style={{...inp,background:'#ffffff'}}>
                  <option value="">— selecione —</option>
                  {funis.map(fn => <option key={fn.id} value={fn.id}>{fn.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Agente IA *</label>
                <select value={formFluxo.agente_id} onChange={e=>setFormFluxo((f:any)=>({...f,agente_id:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                  <option value="">— selecione —</option>
                  {agentesAtivos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
            </div>

            <div style={{marginBottom:14,padding:12,background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
              <label style={lbl}>Sequência de tentativas *</label>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:10}}>
                Cada tentativa corresponde a uma etapa do funil. O fluxo move o card pra essa etapa quando manda a mensagem da tentativa.
              </div>
              {(formFluxo.etapas_tentativas as string[]).map((etapa, idx) => (
                <div key={idx} style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                  <span style={{fontSize:11,color:'var(--text-muted)',width:24,fontWeight:600,textAlign:'center'}}>#{idx+1}</span>
                  <select value={etapa} onChange={e=>setTentativa(idx, e.target.value)} disabled={!formFluxo.funil_id}
                    style={{...inp,background:'#ffffff',flex:1}}>
                    <option value="">— escolha uma etapa do funil —</option>
                    {etapasDisponiveis.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <button onClick={()=>removerTentativa(idx)}
                    style={{padding:'6px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>✕</button>
                </div>
              ))}
              {(formFluxo.etapas_tentativas as string[]).length < 10 && (
                <button onClick={adicionarTentativa} disabled={!formFluxo.funil_id}
                  style={{padding:'6px 12px',borderRadius:6,fontSize:11,border:'1px dashed var(--border)',background:'transparent',color:'var(--gold)',cursor:formFluxo.funil_id?'pointer':'not-allowed',marginTop:4}}>
                  + Adicionar tentativa
                </button>
              )}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Etapa quando RESPONDE *</label>
                <select value={formFluxo.etapa_interacao} onChange={e=>setFormFluxo((f:any)=>({...f,etapa_interacao:e.target.value}))} disabled={!formFluxo.funil_id}
                  style={{...inp,background:'#ffffff'}}>
                  <option value="">— selecione —</option>
                  {etapasDisponiveis.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Etapa quando NÃO responde *</label>
                <select value={formFluxo.etapa_perdido} onChange={e=>setFormFluxo((f:any)=>({...f,etapa_perdido:e.target.value}))} disabled={!formFluxo.funil_id}
                  style={{...inp,background:'#ffffff'}}>
                  <option value="">— selecione —</option>
                  {etapasDisponiveis.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Intervalo (h úteis) *</label>
                <input type="number" min={0.5} max={168} step={0.5} value={formFluxo.horas_entre_tentativas} onChange={e=>setFormFluxo((f:any)=>({...f,horas_entre_tentativas:e.target.value}))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Início janela útil</label>
                <input type="time" value={formFluxo.horario_util_inicio} onChange={e=>setFormFluxo((f:any)=>({...f,horario_util_inicio:e.target.value}))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Fim janela útil</label>
                <input type="time" value={formFluxo.horario_util_fim} onChange={e=>setFormFluxo((f:any)=>({...f,horario_util_fim:e.target.value}))} style={inp} />
              </div>
            </div>

            <div style={{marginBottom:18}}>
              <label style={lbl}>Prompt template *</label>
              <textarea value={formFluxo.prompt_template} onChange={e=>setFormFluxo((f:any)=>({...f,prompt_template:e.target.value}))} rows={10}
                style={{...inp,resize:'vertical',fontFamily:'monospace',fontSize:12,lineHeight:1.5}} />
              <div style={{fontSize:10,color:'var(--text-muted)',marginTop:6,lineHeight:1.5}}>
                Placeholders: <code>{'{{nome}}'}</code>, <code>{'{{tentativa_n}}'}</code>, <code>{'{{total_tentativas}}'}</code>, <code>{'{{tipo_tentativa}}'}</code> (= <code>abertura</code> | <code>followup</code> | <code>ultima_tentativa</code>).
                A persona/regras gerais ficam no <b>system_prompt do agente IA</b>.
              </div>
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalFluxo(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarFluxo} disabled={salvandoFluxo}>
                {salvandoFluxo ? 'Salvando...' : '✓ Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
