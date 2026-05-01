'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/Avatar'

const STATUS_CORES: Record<string,string> = { pendente:'var(--gold)', em_andamento:'var(--teal)', concluida:'var(--text-muted)', cancelada:'var(--red)' }
const STATUS_LABELS: Record<string,string> = { pendente:'⏳ Pendente', em_andamento:'🔄 Em andamento', concluida:'✅ Concluída', cancelada:'❌ Cancelada' }
const TIPOS = ['tarefa','ligação','reunião','email','visita','outro']

export default function TarefasPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [profile, setProfile]       = useState<any>(null)
  const [usuarios, setUsuarios]     = useState<any[]>([])
  const [tarefas, setTarefas]       = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState('pendente')
  const [filtroResponsavel, setFiltroResponsavel] = useState('meus')
  const [salvando, setSalvando]     = useState(false)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [clientesBusca, setClientesBusca] = useState<any[]>([])
  const [clienteSel, setClienteSel] = useState<any>(null)

  const [form, setForm] = useState({
    titulo:'', descricao:'', tipo:'tarefa', status:'pendente',
    prazo:'', responsavel_id:'',
  })

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('id,nome,role,avatar_url').eq('id', user?.id||'').single()
    setProfile(prof)
    const { data: usr } = await supabase.from('users').select('id,nome,role,avatar_url').order('nome')
    setUsuarios(usr||[])
    await carregarTarefas()
    setLoading(false)
  }

  async function carregarTarefas() {
    const { data } = await supabase
      .from('tarefas')
      .select(`
        *,
        clientes(nome),
        responsavel:users!tarefas_responsavel_id_fkey(id,nome,role,avatar_url),
        atribuidor:users!tarefas_atribuido_por_fkey(id,nome,role,avatar_url)
      `)
      .order('prazo', { ascending: true, nullsFirst: false })
    setTarefas(data||[])
  }

  async function buscarClientes(q: string) {
    setBuscaCliente(q)
    if (q.length < 2) { setClientesBusca([]); return }
    const { data } = await supabase.from('clientes').select('id,nome,cpf_cnpj').or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%`).limit(6)
    setClientesBusca(data||[])
  }

  async function salvarTarefa() {
    if (!form.titulo.trim()) { alert('Informe o título'); return }
    setSalvando(true)
    const responsavelId = form.responsavel_id || profile?.id
    await supabase.from('tarefas').insert({
      titulo:         form.titulo,
      descricao:      form.descricao || null,
      tipo:           form.tipo,
      status:         form.status,
      prazo:          form.prazo ? new Date(form.prazo).toISOString() : null,
      responsavel_id: responsavelId,
      cliente_id:     clienteSel?.id || null,
      criado_por:     profile?.id,
      atribuido_por:  form.responsavel_id && form.responsavel_id !== profile?.id ? profile?.id : null,
    })
    if (form.responsavel_id && form.responsavel_id !== profile?.id) {
      await supabase.from('notificacoes').insert({
        user_id:   form.responsavel_id, tipo: 'tarefa',
        titulo:    `${profile?.nome} atribuiu uma tarefa para você`,
        descricao: form.titulo, link: '/dashboard/tarefas',
      })
    }
    setModalAberto(false)
    setForm({ titulo:'', descricao:'', tipo:'tarefa', status:'pendente', prazo:'', responsavel_id:'' })
    setClienteSel(null); setBuscaCliente('')
    setSalvando(false)
    await carregarTarefas()
  }

  async function alterarStatus(id: string, status: string) {
    await supabase.from('tarefas').update({ status }).eq('id', id)
    await carregarTarefas()
  }

  const tarefasFiltradas = tarefas.filter(t => {
    const statusOk = filtroStatus === 'todos' || t.status === filtroStatus
    const respOk = filtroResponsavel === 'todos'
      || (filtroResponsavel === 'meus' && t.responsavel_id === profile?.id)
      || (filtroResponsavel === 'atribuidas' && t.atribuido_por === profile?.id && t.responsavel_id !== profile?.id)
    return statusOk && respOk
  })

  const vencendo = tarefas.filter(t => {
    if (!t.prazo || t.status === 'concluida' || t.status === 'cancelada') return false
    const diff = new Date(t.prazo).getTime() - Date.now()
    return diff > 0 && diff < 48*3600*1000 && t.responsavel_id === profile?.id
  })

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box' as const }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>✅ Tarefas</div>
        <button className="btn-primary" onClick={()=>{setModalAberto(true);setForm({titulo:'',descricao:'',tipo:'tarefa',status:'pendente',prazo:'',responsavel_id:profile?.id||''})}}>
          + Nova Tarefa
        </button>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'20px 28px'}}>
        {vencendo.length > 0 && (
          <div style={{marginBottom:16,padding:'12px 16px',background:'rgba(224,82,82,0.1)',border:'1px solid rgba(224,82,82,0.3)',borderRadius:10,fontSize:13,color:'var(--red)'}}>
            ⚠️ Você tem {vencendo.length} tarefa{vencendo.length>1?'s':''} vencendo nas próximas 48h!
          </div>
        )}

        {/* Filtros */}
        <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
          {['pendente','em_andamento','concluida','todos'].map(s=>(
            <button key={s} onClick={()=>setFiltroStatus(s)}
              style={{padding:'6px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:filtroStatus===s?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:filtroStatus===s?'var(--gold)':'var(--text-muted)',borderColor:filtroStatus===s?'var(--gold)':'var(--border)'}}>
              {s==='todos'?'Todas':STATUS_LABELS[s]}
            </button>
          ))}
          <div style={{width:1,background:'var(--border)',margin:'0 4px'}}/>
          {[{k:'meus',l:'Minhas'},{k:'atribuidas',l:'Atribuí'},{k:'todos',l:'Todas'}].map(({k,l})=>(
            <button key={k} onClick={()=>setFiltroResponsavel(k)}
              style={{padding:'6px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:filtroResponsavel===k?'rgba(28,181,160,0.12)':'rgba(255,255,255,0.04)',color:filtroResponsavel===k?'var(--teal)':'var(--text-muted)',borderColor:filtroResponsavel===k?'var(--teal)':'var(--border)'}}>
              {l}
            </button>
          ))}
        </div>

        {tarefasFiltradas.length === 0 ? (
          <div className="card" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <div>Nenhuma tarefa encontrada</div>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {tarefasFiltradas.map(t => {
              const vence = t.prazo ? new Date(t.prazo) : null
              const atrasada = vence && vence < new Date() && t.status !== 'concluida'
              const vencendoEm48 = vence && !atrasada && (vence.getTime()-Date.now()) < 48*3600*1000
              const responsavel = t.responsavel
              const atribuidor  = t.atribuidor
              return (
                <div key={t.id} className="card" style={{padding:'14px 18px',borderLeft:`3px solid ${atrasada?'var(--red)':vencendoEm48?'var(--gold)':STATUS_CORES[t.status]||'var(--border)'}`}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                        <span style={{fontSize:14,fontWeight:600}}>{t.titulo}</span>
                        <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:`${STATUS_CORES[t.status]}20`,color:STATUS_CORES[t.status],fontWeight:600}}>{STATUS_LABELS[t.status]||t.status}</span>
                        {atrasada && <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:'rgba(224,82,82,0.2)',color:'var(--red)',fontWeight:600}}>⚠️ Atrasada</span>}
                      </div>
                      {t.descricao && <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:6}}>{t.descricao}</div>}
                      <div style={{display:'flex',gap:12,flexWrap:'wrap',fontSize:11,color:'var(--text-muted)',alignItems:'center'}}>
                        <span>📌 {t.tipo}</span>
                        {t.prazo && <span style={{color:atrasada?'var(--red)':vencendoEm48?'var(--gold)':'var(--text-muted)'}}>📅 {new Date(t.prazo).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>}
                        {t.clientes?.nome && <span style={{cursor:'pointer',color:'var(--gold)'}} onClick={()=>router.push(`/dashboard/clientes/${t.cliente_id}`)}>👤 {t.clientes.nome}</span>}
                        {responsavel && (
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <Avatar nome={responsavel.nome} avatarUrl={responsavel.avatar_url} role={responsavel.role} size={18} />
                            <span>{responsavel.nome?.split(' ')[0]}</span>
                          </div>
                        )}
                        {atribuidor && t.responsavel_id !== t.atribuido_por && (
                          <span style={{color:'var(--teal)'}}>↑ {atribuidor.nome?.split(' ')[0]}</span>
                        )}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0}}>
                      {t.status === 'pendente' && (
                        <button onClick={()=>alterarStatus(t.id,'em_andamento')}
                          style={{padding:'5px 10px',borderRadius:6,fontSize:11,cursor:'pointer',border:'1px solid rgba(28,181,160,0.3)',background:'rgba(28,181,160,0.08)',color:'var(--teal)',fontFamily:'DM Sans,sans-serif'}}>
                          Iniciar
                        </button>
                      )}
                      {(t.status === 'pendente' || t.status === 'em_andamento') && (
                        <button onClick={()=>alterarStatus(t.id,'concluida')}
                          style={{padding:'5px 10px',borderRadius:6,fontSize:11,cursor:'pointer',border:'1px solid rgba(201,168,76,0.3)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',fontFamily:'DM Sans,sans-serif'}}>
                          ✓ Concluir
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal nova tarefa */}
      {modalAberto && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalAberto(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:500,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:20,marginBottom:20}}>+ Nova Tarefa</div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Título *</label>
              <input value={form.titulo} onChange={e=>setForm(f=>({...f,titulo:e.target.value}))} placeholder="Título da tarefa" style={inp} autoFocus />
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Descrição</label>
              <textarea value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} placeholder="Detalhes..." rows={2} style={{...inp,resize:'none'}} />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Tipo</label>
                <select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                  {TIPOS.map(t=><option key={t} value={t} style={{background:'#ffffff'}}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Prazo</label>
                <input type="datetime-local" value={form.prazo} onChange={e=>setForm(f=>({...f,prazo:e.target.value}))} style={inp} />
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,color:'var(--gold)',display:'block',marginBottom:4}}>👤 Responsável</label>
              <select value={form.responsavel_id} onChange={e=>setForm(f=>({...f,responsavel_id:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                <option value={profile?.id} style={{background:'#ffffff'}}>Eu mesmo ({profile?.nome})</option>
                {usuarios.filter(u=>u.id!==profile?.id).map(u=>(
                  <option key={u.id} value={u.id} style={{background:'#ffffff'}}>{u.nome}</option>
                ))}
              </select>
              {form.responsavel_id && form.responsavel_id !== profile?.id && (
                <div style={{fontSize:11,color:'var(--teal)',marginTop:4}}>
                  ✓ Notificação será enviada para {usuarios.find(u=>u.id===form.responsavel_id)?.nome}
                </div>
              )}
            </div>
            <div style={{marginBottom:20,position:'relative'}}>
              <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Cliente (opcional)</label>
              {clienteSel ? (
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'rgba(28,181,160,0.08)',border:'1px solid rgba(28,181,160,0.3)',borderRadius:8}}>
                  <span style={{fontSize:13}}>{clienteSel.nome}</span>
                  <button onClick={()=>{setClienteSel(null);setBuscaCliente('')}} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
                </div>
              ) : (
                <>
                  <input value={buscaCliente} onChange={e=>buscarClientes(e.target.value)} placeholder="🔍 Buscar cliente..." style={inp} />
                  {clientesBusca.length > 0 && (
                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,zIndex:10,marginTop:4,maxHeight:160,overflow:'auto'}}>
                      {clientesBusca.map(c=>(
                        <div key={c.id} onClick={()=>{setClienteSel(c);setBuscaCliente(c.nome);setClientesBusca([])}}
                          style={{padding:'8px 14px',cursor:'pointer',fontSize:13}}
                          onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.08)')}
                          onMouseLeave={e=>(e.currentTarget.style.background='')}>
                          {c.nome}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalAberto(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarTarefa} disabled={salvando}>
                {salvando?'Salvando...':'✓ Criar Tarefa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
